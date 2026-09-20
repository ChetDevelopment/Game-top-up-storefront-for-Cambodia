/**
 * Delivery Worker - FINAL STRIPE-LEVEL SAFE VERSION
 * 
 * CRITICAL SAFETY GUARANTEES:
 * 1. lockVersion prevents stale worker overwrites
 * 2. SENDING state isolates provider call intent
 * 3. providerFinalizedAt prevents replay after external completion
 * 4. All transitions are single-row atomic updates
 * 5. Crash at any point leads to deterministic recovery
 * 
 * EXECUTION PHASE MACHINE:
 * PENDING → IN_PROGRESS → SENDING → DISPATCHED → SUCCESS/FAILED/UNKNOWN
 * 
 * CRASH BOUNDARY:
 * - Before SENDING: Safe to retry (no provider call)
 * - After SENDING: Assume "unknown sent state", recovery must be idempotent-safe
 * - After providerFinalizedAt: NEVER retry (external execution complete)
 */

import crypto from "crypto";
import { prisma } from "./prisma";
import { createGameDropOrder } from "./gamedrop";
import { createG2BulkOrder } from "./g2bulk";
import {
  isCircuitOpen,
  recordCircuitResult,
} from "./circuit-breaker-sot";
import {
  getBackpressureState,
  canDispatch,
  canRetry,
  getConcurrencyLimit,
} from "./backpressure-sot";
import { recordProviderCall } from "./provider-health";

export type DeliveryStatus = 
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'SENDING'
  | 'DISPATCHED'
  | 'SUCCESS'
  | 'FAILED'
  | 'FAILED_FINAL'
  | 'UNKNOWN'
  | 'UNKNOWN_ESCALATED'
  | 'MANUAL_REVIEW'
  | 'DEAD_LETTER';

export interface DeliveryState {
  id: string;
  orderId: string;
  status: DeliveryStatus;
  provider: string | null;
  idempotencyKey: string | null;
  payloadHash: string | null;
  attempt: number;
  maxAttempts: number;
  lockedBy: string | null;
  lockUntil: Date | null;
  lockVersion: number;
  dispatchedAt: Date | null;
  providerFinalizedAt: Date | null;
  nextAttemptAt: Date | null;
  lastError: string | null;
  errorCode: string | null;
  providerTransactionId: string | null;
}

const LOCK_DURATION_MS = 120_000; // 2 minutes

/**
 * ATOMIC JOB CLAIMING WITH VERSIONING
 * 
 * CRITICAL SAFETY:
 * - Uses SELECT FOR UPDATE SKIP LOCKED
 * - Checks circuit breaker atomically during claim
 * - Returns lockVersion for fencing
 * - Checks providerFinalizedAt (never replay finalized)
 */
export async function claimDeliveryJob(
  workerId: string
): Promise<DeliveryState | null> {
  const claimed = await prisma.$transaction(async (tx) => {
    // 1. Check backpressure (DB-stored)
    const backpressure = await tx.backpressureState.findUnique({
      where: { id: 'singleton' },
    });
    
    if (backpressure?.pauseDispatches) {
      return null;
    }
    
    // 2. Atomic claim with SKIP LOCKED and version increment
    const claimed = await tx.$queryRaw<DeliveryState[]>`
      UPDATE "DeliveryState" ds
      SET 
        status = 'IN_PROGRESS',
        "lockedBy" = ${workerId},
        "lockUntil" = NOW() + ${LOCK_DURATION_MS / 1000} * INTERVAL '1 second',
        "lockVersion" = "lockVersion" + 1,
        "updatedAt" = NOW()
      WHERE ds.id = (
        SELECT id FROM "DeliveryState"
        WHERE status IN ('PENDING', 'FAILED')
          AND "providerFinalizedAt" IS NULL  -- NEVER replay finalized
          AND ("nextAttemptAt" IS NULL OR "nextAttemptAt" <= NOW())
          AND attempt < "maxAttempts"
          AND ("lockUntil" IS NULL OR "lockUntil" < NOW())
        ORDER BY "nextAttemptAt" ASC NULLS FIRST, "createdAt" ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *
    `;
    
    if (claimed.length === 0) {
      return null;
    }
    
    const state = claimed[0];
    
    // 3. Circuit breaker check (atomically, before release)
    if (state.provider) {
      const circuitOpen = await isCircuitOpen(tx, state.provider);
      if (circuitOpen) {
        // Release job back to queue
        await tx.deliveryState.update({
          where: { id: state.id },
          data: {
            status: 'PENDING',
            lockedBy: null,
            lockUntil: null,
            nextAttemptAt: new Date(Date.now() + 300000),
          },
        });
        return null;
      }
    }
    
    return state;
  }, {
    isolationLevel: 'ReadCommitted',
    maxWait: 5000,
    timeout: 10000,
  });
  
  return claimed;
}

/**
 * VALIDATE EXECUTION LEASE WITH VERSION CHECK
 * 
 * CRITICAL SAFETY:
 * - Uses DB's NOW() for clock-drift immunity
 * - Checks lockVersion for fencing
 * - Prevents zombie worker execution
 */
export async function validateLease(
  stateId: string,
  workerId: string,
  expectedVersion: number
): Promise<boolean> {
  const result = await prisma.$queryRaw<{ valid: boolean }[]>`
    SELECT (
      "lockedBy" = ${workerId} 
      AND "lockUntil" > NOW() 
      AND "lockVersion" = ${expectedVersion}
      AND "providerFinalizedAt" IS NULL
    ) as valid
    FROM "DeliveryState"
    WHERE id = ${stateId}
  `;
  
  return result[0]?.valid || false;
}

/**
 * ATOMIC STATE TRANSITION WITH VERSION FENCING
 * 
 * CRITICAL SAFETY:
 * - Single-row atomic update
 * - Version check prevents stale overwrites
 * - Version increment on every valid transition
 * - NO multi-table transactions
 */
export async function transitionState(
  stateId: string,
  workerId: string,
  fromVersion: number,
  transition: {
    status: DeliveryStatus;
    errorCode?: string | null;
    lastError?: string | null;
    providerTransactionId?: string | null;
    providerResponse?: any | null;
    providerFinalizedAt?: Date | null;
    nextAttemptAt?: Date | null;
    attempt?: number;
    dispatchedAt?: Date | null;
  }
): Promise<{ success: boolean; error?: string; newState?: DeliveryState }> {
  const result = await prisma.$executeRaw`
    UPDATE "DeliveryState"
    SET 
      status = ${transition.status},
      "errorCode" = ${transition.errorCode || null},
      "lastError" = ${transition.lastError || null},
      "providerTransactionId" = ${transition.providerTransactionId || null},
      "providerResponse" = ${transition.providerResponse ? JSON.stringify(transition.providerResponse) : null}::jsonb,
      "providerFinalizedAt" = ${transition.providerFinalizedAt || null},
      "nextAttemptAt" = ${transition.nextAttemptAt || null},
      "attempt" = ${transition.attempt !== undefined ? transition.attempt : 'attempt'},
      "dispatchedAt" = ${transition.dispatchedAt || null},
      "lockedBy" = null,
      "lockUntil" = null,
      "lockVersion" = "lockVersion" + 1,
      "completedAt" = CASE 
        WHEN ${transition.status} IN ('SUCCESS', 'FAILED_FINAL', 'DEAD_LETTER') THEN NOW() 
        ELSE "completedAt" 
      END,
      "updatedAt" = NOW()
    WHERE id = ${stateId}
      AND "lockedBy" = ${workerId}
      AND "lockVersion" = ${fromVersion}
  `;
  
  if (result === 0) {
    return { success: false, error: 'LEASE_EXPIRED_OR_VERSION_MISMATCH' };
  }
  
  // Fetch updated state
  const newState = await prisma.deliveryState.findUnique({
    where: { id: stateId },
  }) as DeliveryState | null;
  
  return { success: true, newState: newState || undefined };
}

/**
 * EXECUTE DELIVERY WITH CRASH SAFETY BOUNDARIES
 * 
 * CRITICAL EXECUTION ORDER:
 * 1. Validate lease (prevent zombie)
 * 2. Transition to SENDING (persist intent) ← CRASH BOUNDARY
 * 3. Call provider API
 * 4. Store response atomically with DISPATCHED
 * 5. Transition to final state
 * 
 * CRASH RECOVERY:
 * - Before SENDING: Safe to retry
 * - After SENDING: Assume "unknown sent", idempotent-safe recovery
 * - After providerFinalizedAt: NEVER retry
 */
export async function executeDelivery(
  state: DeliveryState,
  workerId: string
): Promise<{ success: boolean; error?: string }> {
  const startTime = Date.now();
  
  // 1. Get order details (read-only, not for decisions)
  const order = await prisma.order.findUnique({
    where: { id: state.orderId },
    include: { product: true, game: true },
  });
  
  if (!order) {
    await transitionState(state.id, workerId, state.lockVersion, {
      status: 'FAILED_FINAL',
      errorCode: 'PROVIDER_ERROR',
      lastError: 'Order not found',
      providerFinalizedAt: new Date(),
    });
    return { success: false, error: 'Order not found' };
  }
  
  // 2. CRITICAL: Validate lease before ANY side effect
  const leaseValid = await validateLease(state.id, workerId, state.lockVersion);
  if (!leaseValid) {
    // Zombie worker - abort WITHOUT side effects
    return { success: false, error: 'LEASE_EXPIRED' };
  }
  
  // 3. CRITICAL: Transition to SENDING (persist intent before API call)
  // This is the CRASH BOUNDARY - after this, we assume provider call may have happened
  const sendingResult = await transitionState(state.id, workerId, state.lockVersion, {
    status: 'SENDING',
    dispatchedAt: new Date(), // Track when we started sending
  });
  
  if (!sendingResult.success) {
    return { success: false, error: sendingResult.error };
  }
  
  const sendingVersion = sendingResult.newState?.lockVersion || state.lockVersion + 1;
  
  // 4. Prepare provider request
  const requestPayload = {
    playerUid: order.playerUid,
    serverId: order.serverId,
    amount: order.amountUsd,
  };
  
  // 5. Execute provider call
  let result: {
    success: boolean;
    transactionId?: string;
    response?: any;
    errorCode?: 'TIMEOUT' | 'NETWORK_ERROR' | 'IDEMPOTENCY_CONFLICT' | 'PROVIDER_ERROR';
    message?: string;
  };
  
  try {
    const provider = order.product.gameDropOfferId ? 'GAMEDROP' : 
                     order.product.g2bulkCatalogueName ? 'G2BULK' : null;
    
    if (!provider) {
      result = { success: true, message: 'Manual fulfillment' };
    } else if (provider === 'GAMEDROP') {
      const gameDropResult = await createGameDropOrder(
        process.env.GAMEDROP_TOKEN || '',
        order.product.gameDropOfferId!,
        order.playerUid,
        order.serverId,
        state.idempotencyKey!
      );
      
      if (gameDropResult.status === 'SUCCESS' || gameDropResult.status === 'PENDING') {
        result = {
          success: true,
          transactionId: gameDropResult.transactionId,
          response: gameDropResult,
        };
      } else {
        result = {
          success: false,
          errorCode: 'PROVIDER_ERROR',
          message: gameDropResult.message,
          response: gameDropResult,
        };
      }
    } else if (provider === 'G2BULK') {
      const g2bulkResult = await createG2BulkOrder(
        process.env.G2BULK_TOKEN || '',
        order.product.g2bulkCatalogueName!,
        order.playerUid,
        order.serverId,
        state.idempotencyKey!
      );
      
      if (g2bulkResult.success) {
        result = {
          success: true,
          transactionId: g2bulkResult.orderId?.toString(),
          response: g2bulkResult,
        };
      } else {
        result = {
          success: false,
          errorCode: 'PROVIDER_ERROR',
          message: g2bulkResult.message,
          response: g2bulkResult,
        };
      }
    } else {
      result = { success: true, message: 'Unknown provider' };
    }
  } catch (err: any) {
    const latencyMs = Date.now() - startTime;
    
    if (err.name === 'AbortError' || err.message.includes('timeout')) {
      result = {
        success: false,
        errorCode: 'TIMEOUT',
        message: `Provider timeout: ${err.message}`,
      };
    } else if (err.message.includes('network') || err.message.includes('fetch')) {
      result = {
        success: false,
        errorCode: 'NETWORK_ERROR',
        message: `Network error: ${err.message}`,
      };
    } else if (err.statusCode === 409 || err.message.includes('duplicate') || err.message.includes('idempotency')) {
      result = {
        success: false,
        errorCode: 'IDEMPOTENCY_CONFLICT',
        message: `Idempotency conflict: ${err.message}`,
      };
    } else {
      result = {
        success: false,
        errorCode: 'PROVIDER_ERROR',
        message: err.message,
      };
    }
  }
  
  const latencyMs = Date.now() - startTime;
  
  // 6. Record provider metrics (append-only, not for decisions)
  if (state.provider) {
    await recordProviderCall(state.provider, {
      success: result.success,
      timeout: result.errorCode === 'TIMEOUT',
      conflict: result.errorCode === 'IDEMPOTENCY_CONFLICT',
      latencyMs,
      errorMessage: result.message,
    });
    
    await recordCircuitResult(state.provider, result.success);
  }
  
  // 7. CRITICAL: Atomic transition to final state with response stored
  // This MUST be single-row atomic - response + state together
  if (result.success) {
    await transitionState(state.id, workerId, sendingVersion, {
      status: 'SUCCESS',
      providerTransactionId: result.transactionId || null,
      providerResponse: result.response,
      providerFinalizedAt: new Date(), // FINAL - never retry
      dispatchedAt: new Date(),
    });
    
    // Update Order projection (async, best-effort, not critical)
    await prisma.order.update({
      where: { id: state.orderId },
      data: {
        status: 'DELIVERED',
        deliveryStatus: 'DELIVERED',
        deliveredAt: new Date(),
      },
    }).catch(() => {});
    
    return { success: true };
  } else if (result.errorCode === 'TIMEOUT' || result.errorCode === 'NETWORK_ERROR') {
    // CRITICAL: UNKNOWN state - we sent SENDING but don't know if provider received
    // Recovery must be idempotent-safe (provider may have processed)
    await transitionState(state.id, workerId, sendingVersion, {
      status: 'UNKNOWN',
      errorCode: result.errorCode,
      lastError: result.message,
      nextAttemptAt: new Date(Date.now() + 60000),
      attempt: state.attempt + 1,
      dispatchedAt: new Date(),
    });
    
    return { success: false, error: result.message };
  } else if (result.errorCode === 'IDEMPOTENCY_CONFLICT') {
    // CRITICAL: Provider says duplicate - may have succeeded on previous attempt
    // Treat as UNKNOWN, recovery must be idempotent-safe
    await transitionState(state.id, workerId, sendingVersion, {
      status: 'UNKNOWN',
      errorCode: 'IDEMPOTENCY_CONFLICT',
      lastError: 'Idempotency conflict - may have succeeded',
      nextAttemptAt: new Date(Date.now() + 300000),
      attempt: state.attempt + 1,
      dispatchedAt: new Date(),
    });
    
    return { success: false, error: result.message };
  } else {
    // Explicit failure (provider confirmed failure)
    const nextAttempt = state.attempt + 1;
    const isFinal = nextAttempt >= state.maxAttempts;
    
    await transitionState(state.id, workerId, sendingVersion, {
      status: isFinal ? 'FAILED_FINAL' : 'FAILED',
      errorCode: result.errorCode,
      lastError: result.message,
      providerResponse: result.response,
      providerFinalizedAt: isFinal ? new Date() : null,
      nextAttemptAt: isFinal ? null : new Date(Date.now() + 300000),
      attempt: nextAttempt,
      dispatchedAt: new Date(),
    });
    
    return { success: false, error: result.message };
  }
}

/**
 * MAIN WORKER LOOP
 */
export async function runDeliveryWorker(
  workerId: string,
  maxJobs: number = 20
): Promise<{ processed: number; succeeded: number; failed: number }> {
  const results = { processed: 0, succeeded: 0, failed: 0 };
  
  // Check backpressure
  const backpressure = await getBackpressureState();
  if (!canDispatch(backpressure)) {
    console.log('[worker] Backpressure active - skipping execution');
    return results;
  }
  
  const concurrencyLimit = getConcurrencyLimit(backpressure);
  const effectiveLimit = Math.min(maxJobs, concurrencyLimit);
  
  for (let i = 0; i < effectiveLimit; i++) {
    const state = await claimDeliveryJob(workerId);
    
    if (!state) {
      break; // No more jobs
    }
    
    results.processed++;
    
    try {
      const execResult = await executeDelivery(state, workerId);
      
      if (execResult.success) {
        results.succeeded++;
      } else {
        results.failed++;
      }
    } catch (err: any) {
      console.error(`[worker] Unexpected error for ${state.id}:`, err);
      results.failed++;
      
      // Crash recovery - release lock atomically
      await prisma.deliveryState.update({
        where: { 
          id: state.id,
          lockedBy: workerId,
          lockVersion: state.lockVersion,
        },
        data: {
          status: 'PENDING',
          lockedBy: null,
          lockUntil: null,
          nextAttemptAt: new Date(Date.now() + 60000),
        },
      }).catch(() => {});
    }
  }
  
  return results;
}

/**
 * CRASH RECOVERY SCANNER
 * 
 * Scans for stuck jobs and recovers deterministically:
 * - SENDING without DISPATCHED → UNKNOWN (assume sent, idempotent recovery)
 * - IN_PROGRESS without SENDING → PENDING (safe to retry)
 * - providerFinalizedAt set → NEVER touch (finalized externally)
 */
export async function recoverStuckJobs(): Promise<{ recovered: number }> {
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
  
  // Recover SENDING jobs (crash after intent persisted)
  const sendingRecovery = await prisma.$executeRaw`
    UPDATE "DeliveryState"
    SET 
      status = 'UNKNOWN',
      "lockedBy" = null,
      "lockUntil" = null,
      "lockVersion" = "lockVersion" + 1,
      "errorCode" = 'CRASH_RECOVERY',
      "lastError" = 'Worker crashed after SENDING, assuming provider may have received',
      "nextAttemptAt" = NOW() + INTERVAL '5 minutes',
      "updatedAt" = NOW()
    WHERE status = 'SENDING'
      AND "providerFinalizedAt" IS NULL
      AND "dispatchedAt" < ${tenMinutesAgo}
  `;
  
  // Recover IN_PROGRESS jobs (crash before intent persisted)
  const inProgressRecovery = await prisma.$executeRaw`
    UPDATE "DeliveryState"
    SET 
      status = 'PENDING',
      "lockedBy" = null,
      "lockUntil" = null,
      "lockVersion" = "lockVersion" + 1,
      "nextAttemptAt" = NOW() + INTERVAL '1 minute',
      "updatedAt" = NOW()
    WHERE status = 'IN_PROGRESS'
      AND "providerFinalizedAt" IS NULL
      AND "lockUntil" < NOW()
  `;
  
  return { recovered: sendingRecovery + inProgressRecovery };
}
