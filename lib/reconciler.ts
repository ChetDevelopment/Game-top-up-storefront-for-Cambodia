/**
 * Reconciliation Worker (HARDENED)
 * 
 * Handles UNKNOWN_EXTERNAL_STATE and AMBIGUOUS ledger entries.
 * NOW WITH:
 * - Exponential backoff + jitter
 * - Per-provider rate limiting
 * - Circuit breaker integration
 * - UNKNOWN escalation policy
 * - Backpressure awareness
 */

import crypto from "crypto";
import { prisma } from "./prisma";
import { checkG2BulkOrderStatus } from "./g2bulk";
import { notifyTelegram } from "./telegram";
import {
  getEntriesNeedingReconciliation,
  resolveFromReconciliation,
  createManualReview,
  getPendingManualReviews,
} from "./provider-ledger";
import {
  getJobsReadyForReconcile,
  scheduleNextReconcileAttempt,
  executeWithRateLimit,
  getBackoffStats,
} from "./reconciler-backoff";
import {
  processUnknownEscalations,
  resolveUnknownState,
} from "./unknown-escalation";
import {
  isRequestAllowed,
  recordCircuitSuccess,
  recordCircuitFailure,
} from "./circuit-breaker";
import {
  recordProviderCall,
  getProviderHealth,
} from "./provider-health";
import {
  canRetryJobs,
  getWorkerConcurrencyLimit,
} from "./backpressure";

const G2BULK_TOKEN = process.env.G2BULK_TOKEN || "";
const GAMEDROP_TOKEN = process.env.GAMEDROP_TOKEN || "";

/**
 * Check GameDrop order status
 * Note: GameDrop does NOT have a public status API
 */
async function checkGameDropStatus(
  idempotencyKey: string,
  providerTransactionId?: string
): Promise<{ success: boolean; status?: string; message: string; latencyMs: number }> {
  const startTime = Date.now();
  
  // GameDrop has no status API - return immediately
  return {
    success: false,
    message: "GameDrop does not expose status API",
    latencyMs: Date.now() - startTime,
  };
}

/**
 * Reconcile a single ledger entry WITH BACKOFF AND RATE LIMITING
 */
async function reconcileLedgerEntry(ledger: any): Promise<{
  resolved: boolean;
  newState?: 'SUCCESS' | 'FAILED' | 'STILL_AMBIGUOUS';
  reason: string;
  latencyMs?: number;
}> {
  const provider = ledger.provider;
  const idempotencyKey = ledger.idempotencyKey;
  const providerTransactionId = ledger.providerTransactionId;

  // Check circuit breaker
  const circuitCheck = await isRequestAllowed(provider);
  if (!circuitCheck.allowed) {
    return {
      resolved: false,
      newState: 'STILL_AMBIGUOUS',
      reason: `Circuit breaker: ${circuitCheck.reason}`,
    };
  }

  // Check if retries are allowed (backpressure)
  if (!canRetryJobs()) {
    return {
      resolved: false,
      newState: 'STILL_AMBIGUOUS',
      reason: 'Backpressure: retries paused',
    };
  }

  // Execute with rate limiting
  const startTime = Date.now();
  let statusResult: { success: boolean; status?: string; message: string } | null = null;

  try {
    await executeWithRateLimit(provider, async () => {
      if (provider === 'G2BULK' && providerTransactionId) {
        try {
          const status = await checkG2BulkOrderStatus(G2BULK_TOKEN, parseInt(providerTransactionId));
          statusResult = status;
        } catch (err) {
          statusResult = {
            success: false,
            message: `Status API error: ${err.message}`,
          };
        }
      } else if (provider === 'GAMEDROP') {
        statusResult = await checkGameDropStatus(idempotencyKey, providerTransactionId);
      }
    });

    const latencyMs = Date.now() - startTime;

    // Record provider call for health tracking
    await recordProviderCall(provider, {
      success: statusResult?.success || false,
      timeout: latencyMs > 10000,
      latencyMs,
      errorMessage: statusResult?.message,
    });

    // Record circuit breaker metrics
    if (statusResult?.success) {
      await recordCircuitSuccess(provider);
    } else {
      await recordCircuitFailure(provider, statusResult?.message || 'Status check failed');
    }

    // Analyze result
    if (!statusResult || !statusResult.success) {
      return {
        resolved: false,
        newState: 'STILL_AMBIGUOUS',
        reason: statusResult?.message || 'Status check failed',
        latencyMs,
      };
    }

    // Provider confirmed a state
    const status = (statusResult.status || '').toUpperCase();
    
    if (status === 'SUCCESS' || status === 'COMPLETED') {
      return {
        resolved: true,
        newState: 'SUCCESS',
        reason: 'Provider confirmed success',
        latencyMs,
      };
    }
    
    if (status === 'FAILED' || status === 'ERROR' || status === 'CANCELLED') {
      return {
        resolved: true,
        newState: 'FAILED',
        reason: 'Provider confirmed failure',
        latencyMs,
      };
    }

    // PENDING/PROCESSING = still ambiguous
    return {
      resolved: false,
      newState: 'STILL_AMBIGUOUS',
      reason: `Provider status: ${status}`,
      latencyMs,
    };
  } catch (err) {
    const latencyMs = Date.now() - startTime;
    
    // Record failure
    await recordProviderCall(provider, {
      success: false,
      timeout: err.name === 'AbortError' || err.message.includes('timeout'),
      latencyMs,
      errorMessage: err.message,
    });
    await recordCircuitFailure(provider, err.message);

    return {
      resolved: false,
      newState: 'STILL_AMBIGUOUS',
      reason: `Reconciliation error: ${err.message}`,
      latencyMs,
    };
  }
}

/**
 * Main reconciliation job WITH BACKOFF
 */
export async function reconcileUnknownDeliveries(limit: number = 50): Promise<{
  checked: number;
  resolved: number;
  escalated: number;
  stillAmbiguous: number;
  backoffStats: any;
}> {
  const workerId = `reconcile_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  const results = { 
    checked: 0, 
    resolved: 0, 
    escalated: 0, 
    stillAmbiguous: 0,
    backoffStats: null as any,
  };

  // Get jobs ready for reconcile (respects backoff)
  const jobs = await getJobsReadyForReconcile(limit);

  // Respect concurrency limit (backpressure)
  const concurrencyLimit = getWorkerConcurrencyLimit();
  const jobsToProcess = jobs.slice(0, concurrencyLimit);

  for (const job of jobsToProcess) {
    results.checked++;
    const ledger = job.providerLedger;

    if (!ledger) {
      console.warn(`[reconciler] Job ${job.id} has no ledger entry`);
      continue;
    }

    try {
      const reconciliation = await reconcileLedgerEntry(ledger);

      if (reconciliation.resolved) {
        // Provider confirmed state - resolve it
        await prisma.$transaction(async (tx) => {
          await resolveFromReconciliation(tx, ledger.id, {
            state: reconciliation.newState!,
            response: { 
              reconciledAt: new Date(), 
              reason: reconciliation.reason,
              latencyMs: reconciliation.latencyMs,
            },
          });

          await tx.deliveryJob.update({
            where: { id: job.id },
            data: {
              status: reconciliation.newState === 'SUCCESS' ? 'SUCCESS' : 'FAILED',
              completedAt: reconciliation.newState === 'SUCCESS' ? new Date() : null,
            },
          });

          // Update order status if needed
          if (reconciliation.newState === 'SUCCESS') {
            await tx.order.update({
              where: { id: job.orderId },
              data: {
                status: 'DELIVERED',
                deliveryStatus: 'DELIVERED',
                deliveredAt: new Date(),
              },
            });
          }
        });

        results.resolved++;
        console.log(`[reconciler] Resolved ${job.id} -> ${reconciliation.newState}`);
      } else {
        // Still ambiguous - schedule next attempt with backoff
        await scheduleNextReconcileAttempt(job.id, job.attempt || 0);
        
        // Check if should escalate to manual review
        if (job.attempt >= 4) {
          await createManualReview(
            job.id,
            'RECONCILIATION_EXHAUSTED',
            'HIGH'
          );
          results.escalated++;
        } else {
          results.stillAmbiguous++;
        }
      }
    } catch (err) {
      console.error(`[reconciler] Error reconciling ${job.id}:`, err);
      results.stillAmbiguous++;
    }
  }

  // Process UNKNOWN escalations
  const escalationResults = await processUnknownEscalations(50);
  results.escalated += escalationResults.escalated;

  results.backoffStats = await getBackoffStats();

  return results;
}

/**
 * Process manual review queue notifications
 */
export async function notifyManualReviews(): Promise<void> {
  const reviews = await getPendingManualReviews(20);

  for (const review of reviews) {
    const order = review.deliveryJob.order;
    const product = order.product;
    const game = order.game;

    const message = `🔍 <b>Manual Review Required</b>

<b>Order:</b> ${order.orderNumber}
<b>Game:</b> ${game.name}
<b>Product:</b> ${product.name}
<b>Player UID:</b> ${order.playerUid}
<b>Server:</b> ${order.serverId || 'N/A'}
<b>Reason:</b> ${review.reason}
<b>Priority:</b> ${review.priority}

<b>Action Required:</b>
1. Contact provider support if NO_STATUS_API
2. Check provider dashboard manually
3. Verify if player received value
4. Update review status accordingly

<a href="${process.env.NEXT_PUBLIC_BASE_URL}/admin/orders/${order.orderNumber}">Open in Admin</a>`;

    await notifyTelegram(message);
  }
}

/**
 * Combined reconciliation job (called by cron)
 */
export async function runReconciliation(): Promise<{
  deliveries: any;
  notifications: number;
  backpressure: any;
}> {
  console.log('[reconciler] Starting reconciliation run...');

  const deliveryResults = await reconcileUnknownDeliveries(50);
  
  // Send notifications for new manual reviews
  await notifyManualReviews();

  console.log('[reconciler] Completed:', deliveryResults);

  return {
    deliveries: deliveryResults,
    notifications: 0,
    backpressure: {
      canRetry: canRetryJobs(),
      concurrencyLimit: getWorkerConcurrencyLimit(),
    },
  };
}
