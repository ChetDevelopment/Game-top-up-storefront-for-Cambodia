/**
 * Delivery Worker - Single Source of Truth Architecture
 * 
 * CORE PRINCIPLES:
 * 1. DeliveryState is the ONLY execution state
 * 2. Atomic job claiming with SELECT FOR UPDATE SKIP LOCKED
 * 3. Circuit breaker checked atomically during claim
 * 4. Single-row state transitions (no multi-table commits)
 * 5. Idempotency key immutable per attempt
 * 6. Backpressure read from DB (not memory)
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
  nextAttemptAt: Date | null;
  lastError: string | null;
  errorCode: string | null;
  providerTransactionId: string | null;
}

const LOCK_DURATION_MS = 120_000; // 2 minutes

/**
 * ATOMIC JOB CLAIMING
 * 
 * Uses SELECT FOR UPDATE SKIP LOCKED to prevent race conditions.
 * Checks circuit breaker atomically during claim.
 * Returns null if no jobs available or circuit open.
 */
export async function claimDeliveryJob(
  workerId: string
): Promise<DeliveryState | null> {
  const worker = await prisma.$transaction(async (tx) => {
    // 1. Check backpressure (DB-stored, not memory)
    const backpressure = await tx.backpressureState.findUnique({
      where: { id: 'singleton' },
    });
    
    if (backpressure?.pauseDispatches) {
      return null; // Backpressure active
    }
    
    // 2. Atomic job claim with SKIP LOCKED
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
            nextAttemptAt: new Date(Date.now() + 300000), // 5 min backoff
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
  
  return worker;
}

/**
 * VALIDATE EXECUTION LEASE
 * 
 * Called before provider API call to prevent zombie execution.
 * Uses DB's NOW() for clock-drift immunity.
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
    ) as valid
    FROM "DeliveryState"
    WHERE id = ${stateId}
  `;
  
  return result[0]?.valid || false;
}

/**
 * ATOMIC STATE TRANSITION
 * 
 * Single-row update, no multi-table commits.
 * Uses optimistic locking (lockVersion) for fencing.
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
    nextAttemptAt?: Date | null;
    attempt?: number;
  }
): Promise<{ success: boolean; error?: string }> {
  const result = await prisma.$executeRaw`
    UPDATE "DeliveryState"
    SET 
      status = ${transition.status},
      "errorCode" = ${transition.errorCode || null},
      "lastError" = ${transition.lastError || null},
      "providerTransactionId" = ${transition.providerTransactionId || null},
      "providerResponse" = ${transition.providerResponse ? JSON.stringify(transition.providerResponse) : null}::jsonb,
      "nextAttemptAt" = ${transition.nextAttemptAt || null},
      "attempt" = ${transition.attempt !== undefined ? transition.attempt : 'attempt'},
      "lockedBy" = null,
      "lockUntil" = null,
      "lockVersion" = "lockVersion" + 1,
      "completedAt" = CASE WHEN ${transition.status} IN ('SUCCESS', 'FAILED_FINAL', 'DEAD_LETTER') THEN NOW() ELSE "completedAt" END,
      "updatedAt" = NOW()
    WHERE id = ${stateId}
      AND "lockedBy" = ${workerId}
      AND "lockVersion" = ${fromVersion}
  `;
  
  if (result === 0) {
    return { success: false, error: 'LEASE_EXPIRED_OR_VERSION_MISMATCH' };
  }
  
  return { success: true };
}

/**
 * EXECUTE DELIVERY WITH CRASH SAFETY
 * 
 * Full execution flow with single-row state transitions.
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
    });
    return { success: false, error: 'Order not found' };
  }
  
  // 2. Validate lease before API call
  const leaseValid = await validateLease(state.id, workerId, state.lockVersion);
  if (!leaseValid) {
    // Zombie worker - abort without side effects
    return { success: false, error: 'LEASE_EXPIRED' };
  }
  
  // 3. Transition to DISPATCHED (atomic, single-row)
  await transitionState(state.id, workerId, state.lockVersion, {
    status: 'DISPATCHED',
  });
  
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
  
  // 7. Transition to final state (atomic, single-row)
  if (result.success) {
    await transitionState(state.id, workerId, state.lockVersion, {
      status: 'SUCCESS',
      providerTransactionId: result.transactionId || null,
      providerResponse: result.response,
      completedAt: new Date(),
    });
    
    // Update Order projection (async, not for decisions)
    await prisma.order.update({
      where: { id: state.orderId },
      data: {
        status: 'DELIVERED',
        deliveryStatus: 'DELIVERED',
        deliveredAt: new Date(),
      },
    }).catch(() => {}); // Best-effort, not critical
    
    return { success: true };
  } else if (result.errorCode === 'TIMEOUT' || result.errorCode === 'NETWORK_ERROR') {
    // UNKNOWN state - ambiguous, requires reconciliation
    await transitionState(state.id, workerId, state.lockVersion, {
      status: 'UNKNOWN',
      errorCode: result.errorCode,
      lastError: result.message,
      nextAttemptAt: new Date(Date.now() + 60000), // 1 min backoff
      attempt: state.attempt + 1,
    });
    
    return { success: false, error: result.message };
  } else if (result.errorCode === 'IDEMPOTENCY_CONFLICT') {
    // UNKNOWN - may have succeeded on previous attempt
    await transitionState(state.id, workerId, state.lockVersion, {
      status: 'UNKNOWN',
      errorCode: 'IDEMPOTENCY_CONFLICT',
      lastError: 'Idempotency conflict - may have succeeded',
      nextAttemptAt: new Date(Date.now() + 300000), // 5 min backoff
      attempt: state.attempt + 1,
    });
    
    return { success: false, error: result.message };
  } else {
    // Explicit failure
    const nextAttempt = state.attempt + 1;
    const isFinal = nextAttempt >= state.maxAttempts;
    
    await transitionState(state.id, workerId, state.lockVersion, {
      status: isFinal ? 'FAILED_FINAL' : 'FAILED',
      errorCode: result.errorCode,
      lastError: result.message,
      providerResponse: result.response,
      nextAttemptAt: isFinal ? null : new Date(Date.now() + 300000),
      attempt: nextAttempt,
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
      
      // Crash recovery - release lock
      await prisma.deliveryState.update({
        where: { id: state.id },
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
