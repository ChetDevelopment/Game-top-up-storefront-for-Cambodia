/**
 * UNKNOWN Escalation Policy
 * 
 * Ensures UNKNOWN_EXTERNAL_STATE never remains infinite.
 * Implements time-based state convergence:
 * 
 * 0-10 min   → Retry via reconciler
 * 10-60 min  → Provider status lookup only
 * 1-24 hours → Escalate to MANUAL_REVIEW
 * 24+ hours  → MANUAL_FINAL (system decision required)
 * 
 * MUST converge to final state: SUCCESS / FAILED / MANUAL_FINAL
 */

import { prisma } from "./prisma";
import { moveToDeadLetterQueue } from "./dead-letter-queue";

export type UnknownStage = 
  | 'INITIAL'           // 0-10 min
  | 'STATUS_LOOKUP'     // 10-60 min
  | 'MANUAL_PENDING'    // 1-24 hours
  | 'MANUAL_FINAL';     // 24+ hours

export interface UnknownEscalationState {
  deliveryJobId: string;
  stage: UnknownStage;
  unknownSince: Date;
  timeInUnknownMinutes: number;
  nextEscalationTime: Date;
  reconciliationAttempts: number;
  lastStatusLookup: Date | null;
  canEscalate: boolean;
}

const ESCALATION_THRESHOLDS = {
  INITIAL_TO_STATUS_LOOKUP: 10 * 60 * 1000,    // 10 minutes
  STATUS_LOOKUP_TO_MANUAL: 60 * 60 * 1000,     // 60 minutes (1 hour)
  MANUAL_TO_FINAL: 24 * 60 * 60 * 1000,        // 24 hours
};

/**
 * Get escalation state for UNKNOWN jobs
 */
export async function getUnknownEscalationState(
  deliveryJobId: string
): Promise<UnknownEscalationState | null> {
  const job = await prisma.deliveryJob.findUnique({
    where: { id: deliveryJobId },
    include: {
      providerLedger: true,
    },
  });

  if (!job || job.status !== 'UNKNOWN_EXTERNAL_STATE') {
    return null;
  }

  // Find when job entered UNKNOWN state
  const unknownSince = job.startedAt || job.updatedAt;
  const now = new Date();
  const timeInUnknownMinutes = (now.getTime() - unknownSince.getTime()) / (1000 * 60);

  // Determine stage
  let stage: UnknownStage = 'INITIAL';
  let nextEscalationTime: Date;

  if (timeInUnknownMinutes < 10) {
    stage = 'INITIAL';
    nextEscalationTime = new Date(unknownSince.getTime() + ESCALATION_THRESHOLDS.INITIAL_TO_STATUS_LOOKUP);
  } else if (timeInUnknownMinutes < 60) {
    stage = 'STATUS_LOOKUP';
    nextEscalationTime = new Date(unknownSince.getTime() + ESCALATION_THRESHOLDS.STATUS_LOOKUP_TO_MANUAL);
  } else if (timeInUnknownMinutes < 24 * 60) {
    stage = 'MANUAL_PENDING';
    nextEscalationTime = new Date(unknownSince.getTime() + ESCALATION_THRESHOLDS.MANUAL_TO_FINAL);
  } else {
    stage = 'MANUAL_FINAL';
    nextEscalationTime = unknownSince; // Already past final threshold
  }

  return {
    deliveryJobId,
    stage,
    unknownSince,
    timeInUnknownMinutes,
    nextEscalationTime,
    reconciliationAttempts: job.attempt || 0,
    lastStatusLookup: job.providerLedger?.resolvedAt || null,
    canEscalate: now >= nextEscalationTime,
  };
}

/**
 * Process UNKNOWN state escalation
 * Called by reconciler cron
 */
export async function processUnknownEscalations(limit: number = 50): Promise<{
  checked: number;
  escalated: number;
  resolved: number;
  movedToDLQ: number;
}> {
  const now = new Date();
  const results = { checked: 0, escalated: 0, resolved: 0, movedToDLQ: 0 };

  // Get all UNKNOWN jobs
  const unknownJobs = await prisma.deliveryJob.findMany({
    where: { status: 'UNKNOWN_EXTERNAL_STATE' },
    include: {
      providerLedger: true,
      order: true,
    },
    orderBy: { startedAt: 'asc' },
    take: limit,
  });

  for (const job of unknownJobs) {
    results.checked++;

    const state = await getUnknownEscalationState(job.id);
    if (!state) continue;

    try {
      // Stage 1: INITIAL (0-10 min) - retry via reconciler
      if (state.stage === 'INITIAL') {
        // Don't escalate yet, let reconciler retry
        continue;
      }

      // Stage 2: STATUS_LOOKUP (10-60 min) - provider status lookup only
      if (state.stage === 'STATUS_LOOKUP') {
        if (state.canEscalate || !state.lastStatusLookup) {
          // Attempt status lookup (handled by reconciler)
          // Mark that we attempted lookup
          await prisma.providerLedger.update({
            where: { id: job.providerLedgerId! },
            data: {
              resolutionSource: 'RECONCILIATION',
            },
          });
          results.escalated++;
        }
        continue;
      }

      // Stage 3: MANUAL_PENDING (1-24 hours) - escalate to manual review
      if (state.stage === 'MANUAL_PENDING') {
        if (state.canEscalate) {
          // Check if already in manual review
          const existingReview = await prisma.manualReviewQueue.findUnique({
            where: { deliveryJobId: job.id },
          });

          if (!existingReview) {
            // Create manual review
            await prisma.manualReviewQueue.create({
              data: {
                deliveryJobId: job.id,
                reason: 'UNKNOWN_TIMEOUT',
                status: 'PENDING',
                priority: 'HIGH',
                notes: `Unknown state for ${Math.round(state.timeInUnknownMinutes)} minutes`,
              },
            });

            await prisma.deliveryJob.update({
              where: { id: job.id },
              data: { status: 'MANUAL_REVIEW' },
            });

            results.escalated++;
          }
        }
        continue;
      }

      // Stage 4: MANUAL_FINAL (24+ hours) - move to DLQ
      if (state.stage === 'MANUAL_FINAL') {
        // Check if already in DLQ
        const existingDLQ = await prisma.deadLetterQueue.findUnique({
          where: { deliveryJobId: job.id },
        });

        if (!existingDLQ) {
          // Move to DLQ
          await moveToDeadLetterQueue(job.id, 'UNKNOWN_TIMEOUT', {
            severity: 'CRITICAL',
            originalState: 'UNKNOWN_EXTERNAL_STATE',
            lastError: `Unknown state for ${Math.round(state.timeInUnknownMinutes / 60)} hours`,
            canReplay: false, // Requires manual decision
          });
          results.movedToDLQ++;
        }
      }
    } catch (err) {
      console.error(`[escalation] Error processing job ${job.id}:`, err);
    }
  }

  return results;
}

/**
 * Get UNKNOWN state statistics
 */
export async function getUnknownStats(): Promise<{
  total: number;
  byStage: Record<UnknownStage, number>;
  avgTimeInUnknownMinutes: number;
  oldestUnknownMinutes: number;
  needsEscalation: number;
}> {
  const unknownJobs = await prisma.deliveryJob.findMany({
    where: { status: 'UNKNOWN_EXTERNAL_STATE' },
    select: {
      id: true,
      startedAt: true,
      updatedAt: true,
    },
  });

  const now = new Date();
  const byStage: Record<UnknownStage, number> = {
    INITIAL: 0,
    STATUS_LOOKUP: 0,
    MANUAL_PENDING: 0,
    MANUAL_FINAL: 0,
  };

  let totalTimeInUnknown = 0;
  let oldestMinutes = 0;
  let needsEscalation = 0;

  for (const job of unknownJobs) {
    const unknownSince = job.startedAt || job.updatedAt;
    const timeInUnknownMinutes = (now.getTime() - unknownSince.getTime()) / (1000 * 60);
    totalTimeInUnknown += timeInUnknownMinutes;

    if (timeInUnknownMinutes > oldestMinutes) {
      oldestMinutes = timeInUnknownMinutes;
    }

    // Determine stage
    if (timeInUnknownMinutes < 10) {
      byStage.INITIAL++;
    } else if (timeInUnknownMinutes < 60) {
      byStage.STATUS_LOOKUP++;
    } else if (timeInUnknownMinutes < 24 * 60) {
      byStage.MANUAL_PENDING++;
      needsEscalation++;
    } else {
      byStage.MANUAL_FINAL++;
      needsEscalation++;
    }
  }

  return {
    total: unknownJobs.length,
    byStage,
    avgTimeInUnknownMinutes: unknownJobs.length > 0 ? totalTimeInUnknown / unknownJobs.length : 0,
    oldestUnknownMinutes: oldestMinutes,
    needsEscalation,
  };
}

/**
 * Force escalate UNKNOWN job to manual review
 */
export async function forceEscalateToManual(
  deliveryJobId: string,
  priority: 'NORMAL' | 'HIGH' | 'CRITICAL' = 'HIGH',
  notes?: string
): Promise<void> {
  const job = await prisma.deliveryJob.findUnique({
    where: { id: deliveryJobId },
  });

  if (!job) {
    throw new Error(`Job not found: ${deliveryJobId}`);
  }

  if (job.status !== 'UNKNOWN_EXTERNAL_STATE') {
    throw new Error(`Job not in UNKNOWN state: ${job.status}`);
  }

  // Create manual review
  await prisma.manualReviewQueue.create({
    data: {
      deliveryJobId,
      reason: 'UNKNOWN_FORCED_ESCALATION',
      status: 'PENDING',
      priority,
      notes: notes || `Forced escalation at ${new Date().toISOString()}`,
    },
  });

  await prisma.deliveryJob.update({
    where: { id: deliveryJobId },
    data: { status: 'MANUAL_REVIEW' },
  });
}

/**
 * Resolve UNKNOWN state directly (if evidence found)
 */
export async function resolveUnknownState(
  deliveryJobId: string,
  finalState: 'SUCCESS' | 'FAILED',
  reason: string,
  evidence?: any
): Promise<void> {
  const job = await prisma.deliveryJob.findUnique({
    where: { id: deliveryJobId },
    include: { providerLedger: true },
  });

  if (!job) {
    throw new Error(`Job not found: ${deliveryJobId}`);
  }

  if (job.status !== 'UNKNOWN_EXTERNAL_STATE') {
    throw new Error(`Job not in UNKNOWN state: ${job.status}`);
  }

  await prisma.$transaction([
    // Update delivery job
    prisma.deliveryJob.update({
      where: { id: deliveryJobId },
      data: {
        status: finalState === 'SUCCESS' ? 'SUCCESS' : 'FAILED',
        completedAt: finalState === 'SUCCESS' ? new Date() : null,
        errorMessage: reason,
      },
    }),

    // Update provider ledger
    job.providerLedgerId ? 
      prisma.providerLedger.update({
        where: { id: job.providerLedgerId },
        data: {
          externalState: finalState === 'SUCCESS' ? 'SUCCESS' : 'FAILED',
          resolvedAt: new Date(),
          resolutionSource: 'MANUAL',
          providerResponse: evidence || {},
        },
      }) : prisma.$executeRaw`SELECT 1`,

    // Update order if success
    finalState === 'SUCCESS' ? 
      prisma.order.update({
        where: { id: job.orderId },
        data: {
          status: 'DELIVERED',
          deliveredAt: new Date(),
        },
      }) : prisma.$executeRaw`SELECT 1`,
  ]);

  console.log(`[escalation] Resolved UNKNOWN ${deliveryJobId} -> ${finalState}`);
}
