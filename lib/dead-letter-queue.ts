/**
 * Dead Letter Queue (DLQ)
 * 
 * Handles permanently failed, corrupted, or unresolvable delivery jobs.
 * Provides audit trail and replay capability for manual investigation.
 * 
 * Entry triggers:
 * - UNKNOWN_EXTERNAL_STATE > 24 hours
 * - Provider inconsistency detected
 * - Corrupted payload
 * - Permanent provider failure
 * - Manual escalation (MANUAL_FINAL)
 * 
 * Supports:
 * - Manual replay (if canReplay = true)
 * - Audit inspection
 * - Resolution tracking
 */

import { prisma } from "./prisma";
import { notifyTelegram } from "./telegram";

export type DLQReason = 
  | 'PERMANENT_FAILURE'
  | 'CORRUPTED_PAYLOAD'
  | 'PROVIDER_INCONSISTENT'
  | 'UNKNOWN_TIMEOUT'
  | 'MANUAL_FINAL'
  | 'CIRCUIT_BREAKER_BLOCKED';

export type DLQSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface DLQEntry {
  id: string;
  deliveryJobId: string;
  providerLedgerId: string | null;
  reason: DLQReason;
  severity: DLQSeverity;
  originalState: string;
  ledgerSnapshot: any | null;
  lastError: string | null;
  retryHistory: any | null;
  canReplay: boolean;
  replayCount: number;
  maxReplays: number;
  status: 'PENDING' | 'INVESTIGATING' | 'RESOLVED' | 'ARCHIVED';
  resolvedBy: string | null;
  resolution: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Move a delivery job to Dead Letter Queue
 */
export async function moveToDeadLetterQueue(
  deliveryJobId: string,
  reason: DLQReason,
  details: {
    severity?: DLQSeverity;
    originalState?: string;
    lastError?: string;
    retryHistory?: any[];
    canReplay?: boolean;
  } = {}
): Promise<DLQEntry> {
  // Get full job and ledger data
  const job = await prisma.deliveryJob.findUnique({
    where: { id: deliveryJobId },
    include: {
      providerLedger: true,
      order: {
        include: {
          game: true,
          product: true,
        },
      },
    },
  });

  if (!job) {
    throw new Error(`Delivery job not found: ${deliveryJobId}`);
  }

  // Create DLQ entry with full snapshot
  const dlqEntry = await prisma.deadLetterQueue.create({
    data: {
      deliveryJobId,
      providerLedgerId: job.providerLedger?.id || null,
      reason,
      severity: details.severity || 'HIGH',
      originalState: details.originalState || job.status,
      ledgerSnapshot: job.providerLedger || null,
      lastError: details.lastError || job.errorMessage,
      retryHistory: details.retryHistory || {
        attempts: job.attempt,
        maxAttempts: job.maxAttempts,
      },
      canReplay: details.canReplay !== false, // Default true unless specified
      replayCount: 0,
      maxReplays: 3,
      status: 'PENDING',
    },
  });

  // Update delivery job status
  await prisma.deliveryJob.update({
    where: { id: deliveryJobId },
    data: { status: 'DEAD_LETTER' },
  });

  // Notify operators for HIGH/CRITICAL severity
  if (dlqEntry.severity === 'HIGH' || dlqEntry.severity === 'CRITICAL') {
    await notifyDLQAlert(dlqEntry, job);
  }

  console.log(`[dlq] Job ${deliveryJobId} moved to DLQ: ${reason}`);
  return dlqEntry;
}

/**
 * Notify operators about new DLQ entry
 */
async function notifyDLQAlert(dlqEntry: DLQEntry, job: any): Promise<void> {
  const severityEmoji = {
    CRITICAL: '🚨',
    HIGH: '⚠️',
    MEDIUM: '📋',
    LOW: 'ℹ️',
  };

  const message = `${severityEmoji[dlqEntry.severity]} <b>Dead Letter Queue Alert</b>

<b>Order:</b> ${job.order.orderNumber}
<b>Game:</b> ${job.order.game.name}
<b>Product:</b> ${job.order.product.name}
<b>Player UID:</b> ${job.order.playerUid}
<b>Reason:</b> ${dlqEntry.reason}
<b>Severity:</b> ${dlqEntry.severity}
<b>Can Replay:</b> ${dlqEntry.canReplay ? 'Yes' : 'No'}
<b>Error:</b> ${dlqEntry.lastError || 'N/A'}

<b>Action Required:</b>
1. Investigate provider logs
2. Check if player received value
3. Decide: replay, refund, or manual delivery

<a href="${process.env.NEXT_PUBLIC_BASE_URL}/admin/dlq/${dlqEntry.id}">View in DLQ Dashboard</a>`;

  await notifyTelegram(message);
}

/**
 * Get pending DLQ entries
 */
export async function getPendingDLQEntries(limit: number = 50): Promise<DLQEntry[]> {
  const entries = await prisma.deadLetterQueue.findMany({
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
        },
      },
      providerLedger: true,
    },
    orderBy: { createdAt: 'asc' },
    take: limit,
  });

  return entries;
}

/**
 * Replay a DLQ entry (if canReplay = true)
 */
export async function replayDLQEntry(
  dlqId: string,
  operatorId: string
): Promise<{ success: boolean; error?: string }> {
  const dlq = await prisma.deadLetterQueue.findUnique({
    where: { id: dlqId },
    include: { deliveryJob: true, providerLedger: true },
  });

  if (!dlq) {
    return { success: false, error: 'DLQ entry not found' };
  }

  if (!dlq.canReplay) {
    return { success: false, error: 'Entry marked as non-replayable' };
  }

  if (dlq.replayCount >= dlq.maxReplays) {
    return { success: false, error: `Max replays reached (${dlq.maxReplays})` };
  }

  if (dlq.status !== 'PENDING' && dlq.status !== 'RESOLVED') {
    return { success: false, error: `Invalid status for replay: ${dlq.status}` };
  }

  // Update DLQ entry
  await prisma.deadLetterQueue.update({
    where: { id: dlqId },
    data: {
      status: 'INVESTIGATING',
      replayCount: dlq.replayCount + 1,
      resolvedBy: operatorId,
      resolution: `Replay initiated at ${new Date().toISOString()}`,
    },
  });

  // Reset delivery job to PENDING for reprocessing
  await prisma.deliveryJob.update({
    where: { id: dlq.deliveryJobId },
    data: {
      status: 'PENDING',
      attempt: 0,
      errorMessage: null,
      workerId: null,
    },
  });

  // Reset provider ledger if exists
  if (dlq.providerLedgerId) {
    await prisma.providerLedger.update({
      where: { id: dlq.providerLedgerId },
      data: {
        externalState: 'UNKNOWN',
        resolvedAt: null,
        resolutionSource: null,
      },
    });
  }

  console.log(`[dlq] Entry ${dlqId} replayed (attempt ${dlq.replayCount + 1}/${dlq.maxReplays})`);
  return { success: true };
}

/**
 * Resolve DLQ entry manually
 */
export async function resolveDLQEntry(
  dlqId: string,
  operatorId: string,
  resolution: string,
  finalState: 'SUCCESS' | 'FAILED' | 'REFUNDED'
): Promise<void> {
  const dlq = await prisma.deadLetterQueue.findUnique({
    where: { id: dlqId },
    include: { deliveryJob: true },
  });

  if (!dlq) {
    throw new Error(`DLQ entry not found: ${dlqId}`);
  }

  // Update DLQ entry
  await prisma.deadLetterQueue.update({
    where: { id: dlqId },
    data: {
      status: 'RESOLVED',
      resolvedBy: operatorId,
      resolution,
      resolvedAt: new Date(),
    },
  });

  // Update delivery job based on final state
  if (finalState === 'SUCCESS') {
    await prisma.deliveryJob.update({
      where: { id: dlq.deliveryJobId },
      data: {
        status: 'SUCCESS',
        completedAt: new Date(),
      },
    });

    // Update order if needed
    await prisma.order.update({
      where: { id: dlq.deliveryJob.orderId },
      data: {
        status: 'DELIVERED',
        deliveredAt: new Date(),
      },
    });
  } else if (finalState === 'FAILED') {
    await prisma.deliveryJob.update({
      where: { id: dlq.deliveryJobId },
      data: { status: 'FAILED_FINAL' },
    });

    await prisma.order.update({
      where: { id: dlq.deliveryJob.orderId },
      data: {
        status: 'FAILED_FINAL',
        failureReason: resolution,
      },
    });
  }
  // REFUNDED - handled separately via refund system

  console.log(`[dlq] Entry ${dlqId} resolved: ${finalState}`);
}

/**
 * Archive old resolved DLQ entries
 */
export async function archiveOldDLQEntries(daysOld: number = 30): Promise<number> {
  const cutoff = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);

  const result = await prisma.deadLetterQueue.updateMany({
    where: {
      status: 'RESOLVED',
      resolvedAt: { lt: cutoff },
    },
    data: {
      status: 'ARCHIVED',
    },
  });

  return result.count;
}

/**
 * Get DLQ statistics for dashboard
 */
export async function getDLQStats(): Promise<{
  total: number;
  pending: number;
  investigating: number;
  resolved: number;
  archived: number;
  byReason: Record<string, number>;
  bySeverity: Record<string, number>;
  replayable: number;
  avgResolutionTimeHours: number;
}> {
  const entries = await prisma.deadLetterQueue.findMany({
    select: {
      status: true,
      reason: true,
      severity: true,
      canReplay: true,
      createdAt: true,
      resolvedAt: true,
    },
  });

  const stats = {
    total: entries.length,
    pending: entries.filter(e => e.status === 'PENDING').length,
    investigating: entries.filter(e => e.status === 'INVESTIGATING').length,
    resolved: entries.filter(e => e.status === 'RESOLVED').length,
    archived: entries.filter(e => e.status === 'ARCHIVED').length,
    byReason: {} as Record<string, number>,
    bySeverity: {} as Record<string, number>,
    replayable: entries.filter(e => e.canReplay).length,
    avgResolutionTimeHours: 0,
  };

  // Count by reason
  for (const entry of entries) {
    stats.byReason[entry.reason] = (stats.byReason[entry.reason] || 0) + 1;
    stats.bySeverity[entry.severity] = (stats.bySeverity[entry.severity] || 0) + 1;
  }

  // Calculate average resolution time
  const resolved = entries.filter(e => e.status === 'RESOLVED' && e.resolvedAt);
  if (resolved.length > 0) {
    const totalHours = resolved.reduce((sum, e) => {
      const hours = (e.resolvedAt!.getTime() - e.createdAt.getTime()) / (1000 * 60 * 60);
      return sum + hours;
    }, 0);
    stats.avgResolutionTimeHours = totalHours / resolved.length;
  }

  return stats;
}

/**
 * Get DLQ entries needing attention (pending > 1 hour)
 */
export async function getStaleDLQEntries(hoursOld: number = 1): Promise<DLQEntry[]> {
  const cutoff = new Date(Date.now() - hoursOld * 60 * 60 * 1000);

  return prisma.deadLetterQueue.findMany({
    where: {
      status: 'PENDING',
      createdAt: { lt: cutoff },
    },
    include: {
      deliveryJob: {
        include: {
          order: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
    take: 20,
  });
}
