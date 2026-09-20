/**
 * Provider Ledger - Write-Ahead Log for External Provider Calls
 * 
 * CRITICAL: Ledger entry MUST be created BEFORE any external API call.
 * This ensures we can recover from crashes mid-flight and distinguish
 * between "never sent" vs "sent but response lost".
 */

import crypto from "crypto";
import { prisma } from "./prisma";

export type ProviderState = 
  | 'UNKNOWN'
  | 'DISPATCHED'
  | 'SUCCESS'
  | 'FAILED'
  | 'AMBIGUOUS';

export type ResolutionSource = 
  | 'API_RESPONSE'
  | 'RECONCILIATION'
  | 'MANUAL';

export type ProviderType = 'GAMEDROP' | 'G2BULK';

export interface LedgerEntry {
  id: string;
  deliveryJobId: string;
  provider: ProviderType;
  idempotencyKey: string;
  payloadHash: string;
  requestPayload: any;
  dispatchedAt: Date | null;
  dispatchedBy: string | null;
  providerTransactionId: string | null;
  providerResponse: any | null;
  externalState: ProviderState;
  resolvedAt: Date | null;
  resolvedBy: string | null;
  resolutionSource: ResolutionSource | null;
}

/**
 * Generate payload hash for idempotency key binding
 * This ensures different payloads = different idempotency keys
 */
export function generatePayloadHash(payload: {
  playerUid: string;
  serverId?: string;
  amount?: number;
  [key: string]: any;
}): string {
  // Canonical JSON serialization (sorted keys for consistency)
  const canonical = JSON.stringify(payload, Object.keys(payload).sort());
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

/**
 * Generate idempotency key bound to payload hash
 * Format: TOPUP-{orderNumber}-{payloadHashPrefix}
 */
export function generateIdempotencyKey(orderNumber: string, payload: any): string {
  const payloadHash = generatePayloadHash(payload);
  return `TOPUP-${orderNumber}-${payloadHash.slice(0, 16)}`;
}

/**
 * Verify payload matches original ledger entry
 * Returns false if payload has drifted (admin edit, corruption, etc.)
 */
export function verifyPayloadHash(
  originalPayloadHash: string,
  currentPayload: any
): boolean {
  const currentHash = generatePayloadHash(currentPayload);
  return originalPayloadHash === currentPayloadHash;
}

/**
 * Create ledger entry BEFORE dispatching to provider
 * This is the WRITE-AHEAD LOG - must be called before ANY external API call
 */
export async function createLedgerEntry(
  tx: any, // Prisma transaction
  deliveryJobId: string,
  provider: ProviderType,
  idempotencyKey: string,
  requestPayload: any,
  workerId: string
): Promise<LedgerEntry> {
  const payloadHash = generatePayloadHash(requestPayload);
  
  return tx.providerLedger.create({
    data: {
      deliveryJobId,
      provider,
      idempotencyKey,
      payloadHash,
      requestPayload,
      externalState: 'DISPATCHED',
      dispatchedAt: new Date(),
      dispatchedBy: workerId,
    },
  });
}

/**
 * Resolve ledger entry AFTER receiving provider response
 * Must be called atomically with delivery job status update
 */
export async function resolveLedgerEntry(
  tx: any, // Prisma transaction
  ledgerId: string,
  workerId: string,
  outcome: {
    state: ProviderState;
    providerTransactionId?: string;
    response: any;
  }
): Promise<void> {
  await tx.providerLedger.update({
    where: { id: ledgerId },
    data: {
      externalState: outcome.state,
      providerTransactionId: outcome.providerTransactionId,
      providerResponse: outcome.response,
      resolvedAt: new Date(),
      resolvedBy: workerId,
      resolutionSource: 'API_RESPONSE',
    },
  });
}

/**
 * Mark ledger as ambiguous (timeout, network error, crash recovery)
 * This triggers reconciler or manual review
 */
export async function markLedgerAmbiguous(
  tx: any,
  ledgerId: string,
  reason: string
): Promise<void> {
  await tx.providerLedger.update({
    where: { id: ledgerId },
    data: {
      externalState: 'AMBIGUOUS',
      resolvedAt: null,
      resolutionSource: null,
    },
  });
}

/**
 * Get ledger entries needing reconciliation
 * Called by reconciler cron job
 */
export async function getEntriesNeedingReconciliation(
  limit: number = 50
): Promise<LedgerEntry[]> {
  const thirtySecondsAgo = new Date(Date.now() - 30000);
  
  return prisma.providerLedger.findMany({
    where: {
      externalState: { in: ['DISPATCHED', 'AMBIGUOUS'] },
      dispatchedAt: { lt: thirtySecondsAgo },
      resolvedAt: null,
    },
    include: {
      deliveryJob: {
        include: {
          order: {
            include: {
              game: true,
              product: true,
            },
          },
        },
      },
    },
    take: limit,
    orderBy: { dispatchedAt: 'asc' },
  });
}

/**
 * Update ledger state from reconciliation
 */
export async function resolveFromReconciliation(
  tx: any,
  ledgerId: string,
  outcome: {
    state: ProviderState;
    providerTransactionId?: string;
    response: any;
  }
): Promise<void> {
  await tx.providerLedger.update({
    where: { id: ledgerId },
    data: {
      externalState: outcome.state,
      providerTransactionId: outcome.providerTransactionId,
      providerResponse: outcome.response,
      resolvedAt: new Date(),
      resolutionSource: 'RECONCILIATION',
    },
  });
}

/**
 * Create manual review entry for unresolvable cases
 */
export async function createManualReview(
  tx: any,
  deliveryJobId: string,
  reason: string,
  priority: 'NORMAL' | 'HIGH' | 'CRITICAL' = 'NORMAL'
): Promise<void> {
  await tx.manualReviewQueue.create({
    data: {
      deliveryJobId,
      reason,
      status: 'PENDING',
      priority,
    },
  });
  
  // Also update delivery job status
  await tx.deliveryJob.update({
    where: { id: deliveryJobId },
    data: { status: 'MANUAL_REVIEW' },
  });
}

/**
 * Get pending manual reviews
 */
export async function getPendingManualReviews(
  limit: number = 50
): Promise<any[]> {
  return prisma.manualReviewQueue.findMany({
    where: { status: 'PENDING' },
    include: {
      deliveryJob: {
        include: {
          order: {
            include: {
              game: true,
              product: true,
            },
          },
          providerLedger: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
    take: limit,
  });
}

/**
 * Resolve manual review
 */
export async function resolveManualReview(
  tx: any,
  reviewId: string,
  resolvedBy: string,
  resolution: string,
  finalState: 'SUCCESS' | 'FAILED'
): Promise<void> {
  const review = await tx.manualReviewQueue.findUnique({
    where: { id: reviewId },
    include: { deliveryJob: true },
  });
  
  if (!review) throw new Error('Manual review not found');
  
  // Update manual review
  await tx.manualReviewQueue.update({
    where: { id: reviewId },
    data: {
      status: 'RESOLVED',
      resolvedBy,
      resolution,
      resolvedAt: new Date(),
    },
  });
  
  // Update delivery job
  await tx.deliveryJob.update({
    where: { id: review.deliveryJobId },
    data: {
      status: finalState === 'SUCCESS' ? 'SUCCESS' : 'FAILED',
      completedAt: finalState === 'SUCCESS' ? new Date() : null,
    },
  });
  
  // Update ledger
  if (review.deliveryJob.providerLedgerId) {
    await tx.providerLedger.update({
      where: { id: review.deliveryJob.providerLedgerId },
      data: {
        externalState: finalState === 'SUCCESS' ? 'SUCCESS' : 'FAILED',
        resolvedAt: new Date(),
        resolutionSource: 'MANUAL',
      },
    });
  }
}
