/**
 * Audit Consistency Checker
 * 
 * Background job that detects and reports data inconsistencies.
 * Compares ProviderLedger vs DeliveryJob vs Order states.
 * 
 * Detects:
 * - SUCCESS without ledger entry
 * - Ledger SUCCESS without job SUCCESS
 * - Missing response entries
 * - State mismatches
 * - Orphaned records
 * 
 * Auto-escalates inconsistencies to DLQ for investigation.
 */

import { prisma } from "./prisma";
import { moveToDeadLetterQueue } from "./dead-letter-queue";

export interface ConsistencyIssue {
  type: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  deliveryJobId: string;
  description: string;
  details: any;
  detectedAt: Date;
  autoEscalated: boolean;
}

export interface AuditResult {
  checkedAt: Date;
  totalJobsChecked: number;
  issuesFound: number;
  issues: ConsistencyIssue[];
  escalatedToDLQ: number;
}

/**
 * Run full audit consistency check
 */
export async function runAuditConsistencyCheck(
  limit: number = 500
): Promise<AuditResult> {
  const checkedAt = new Date();
  const issues: ConsistencyIssue[] = [];

  // Get recent delivery jobs
  const jobs = await prisma.deliveryJob.findMany({
    where: {
      createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // Last 24 hours
    },
    include: {
      providerLedger: true,
      order: true,
    },
    take: limit,
  });

  for (const job of jobs) {
    const jobIssues = await checkJobConsistency(job);
    issues.push(...jobIssues);
  }

  // Check for orphaned ledger entries
  const orphanedLedgers = await findOrphanedLedgers();
  issues.push(...orphanedLedgers);

  // Auto-escalate critical issues
  let escalatedCount = 0;
  for (const issue of issues) {
    if (issue.severity === 'CRITICAL' || issue.severity === 'HIGH') {
      try {
        await moveToDeadLetterQueue(issue.deliveryJobId, 'PROVIDER_INCONSISTENT', {
          severity: issue.severity,
          originalState: issue.details.jobStatus,
          lastError: issue.description,
          canReplay: false,
        });
        issue.autoEscalated = true;
        escalatedCount++;
      } catch (err) {
        console.error(`[audit] Failed to escalate issue ${issue.deliveryJobId}:`, err);
      }
    }
  }

  return {
    checkedAt,
    totalJobsChecked: jobs.length,
    issuesFound: issues.length,
    issues,
    escalatedToDLQ: escalatedCount,
  };
}

/**
 * Check consistency for a single job
 */
async function checkJobConsistency(job: any): Promise<ConsistencyIssue[]> {
  const issues: ConsistencyIssue[] = [];
  const now = new Date();

  // Issue 1: SUCCESS without ledger entry
  if (job.status === 'SUCCESS' && !job.providerLedger) {
    issues.push({
      type: 'SUCCESS_WITHOUT_LEDGER',
      severity: 'HIGH',
      deliveryJobId: job.id,
      description: 'Job marked SUCCESS but no ProviderLedger entry exists',
      details: {
        jobStatus: job.status,
        ledgerExists: false,
      },
      detectedAt: now,
      autoEscalated: false,
    });
  }

  // Issue 2: Ledger SUCCESS without job SUCCESS
  if (job.providerLedger?.externalState === 'SUCCESS' && job.status !== 'SUCCESS') {
    issues.push({
      type: 'LEDGER_SUCCESS_JOB_MISMATCH',
      severity: 'HIGH',
      deliveryJobId: job.id,
      description: `ProviderLedger says SUCCESS but job status is ${job.status}`,
      details: {
        jobStatus: job.status,
        ledgerState: job.providerLedger.externalState,
      },
      detectedAt: now,
      autoEscalated: false,
    });
  }

  // Issue 3: Missing response in ledger
  if (job.providerLedger && 
      job.providerLedger.externalState === 'SUCCESS' && 
      !job.providerLedger.providerResponse) {
    issues.push({
      type: 'MISSING_RESPONSE',
      severity: 'MEDIUM',
      deliveryJobId: job.id,
      description: 'Ledger SUCCESS but providerResponse is null',
      details: {
        ledgerState: job.providerLedger.externalState,
        hasResponse: false,
      },
      detectedAt: now,
      autoEscalated: false,
    });
  }

  // Issue 4: MISSING transaction ID on SUCCESS
  if (job.providerLedger?.externalState === 'SUCCESS' && 
      !job.providerLedger.providerTransactionId) {
    issues.push({
      type: 'MISSING_TRANSACTION_ID',
      severity: 'MEDIUM',
      deliveryJobId: job.id,
      description: 'Ledger SUCCESS but providerTransactionId is null',
      details: {
        hasTransactionId: false,
      },
      detectedAt: now,
      autoEscalated: false,
    });
  }

  // Issue 5: UNKNOWN for too long (>24 hours)
  if (job.status === 'UNKNOWN_EXTERNAL_STATE') {
    const unknownSince = job.startedAt || job.updatedAt;
    const hoursInUnknown = (now.getTime() - unknownSince.getTime()) / (1000 * 60 * 60);
    
    if (hoursInUnknown > 24) {
      issues.push({
        type: 'UNKNOWN_TIMEOUT',
        severity: 'HIGH',
        deliveryJobId: job.id,
        description: `Job in UNKNOWN state for ${hoursInUnknown.toFixed(1)} hours`,
        details: {
          hoursInUnknown,
          unknownSince: unknownSince.toISOString(),
        },
        detectedAt: now,
        autoEscalated: false,
      });
    }
  }

  // Issue 6: Order/Job state mismatch
  if (job.status === 'SUCCESS' && job.order.status !== 'DELIVERED') {
    issues.push({
      type: 'ORDER_JOB_MISMATCH',
      severity: 'HIGH',
      deliveryJobId: job.id,
      description: `Job SUCCESS but Order status is ${job.order.status}`,
      details: {
        jobStatus: job.status,
        orderStatus: job.order.status,
      },
      detectedAt: now,
      autoEscalated: false,
    });
  }

  // Issue 7: DISPATCHED without response for too long
  if (job.providerLedger?.externalState === 'DISPATCHED') {
    const dispatchedAt = job.providerLedger.dispatchedAt;
    if (dispatchedAt) {
      const hoursSinceDispatch = (now.getTime() - dispatchedAt.getTime()) / (1000 * 60 * 60);
      if (hoursSinceDispatch > 1) {
        issues.push({
          type: 'DISPATCHED_NO_RESPONSE',
          severity: 'MEDIUM',
          deliveryJobId: job.id,
          description: `Dispatched ${hoursSinceDispatch.toFixed(1)} hours ago with no response`,
          details: {
            hoursSinceDispatch,
            dispatchedAt: dispatchedAt.toISOString(),
          },
          detectedAt: now,
          autoEscalated: false,
        });
      }
    }
  }

  // Issue 8: Job FAILED but ledger shows SUCCESS
  if (job.status === 'FAILED' && job.providerLedger?.externalState === 'SUCCESS') {
    issues.push({
      type: 'FAILED_BUT_LEDGER_SUCCESS',
      severity: 'CRITICAL',
      deliveryJobId: job.id,
      description: 'Job FAILED but ProviderLedger says SUCCESS - DATA CORRUPTION',
      details: {
        jobStatus: job.status,
        ledgerState: job.providerLedger.externalState,
      },
      detectedAt: now,
      autoEscalated: false,
    });
  }

  return issues;
}

/**
 * Find orphaned ledger entries (no matching delivery job)
 */
async function findOrphanedLedgers(): Promise<ConsistencyIssue[]> {
  const issues: ConsistencyIssue[] = [];
  const now = new Date();

  // Find ledgers where delivery job doesn't exist
  const orphanedLedgers = await prisma.providerLedger.findMany({
    where: {
      createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
    include: {
      deliveryJob: false, // We want to find orphans
    },
    take: 100,
  });

  for (const ledger of orphanedLedgers) {
    // Check if delivery job exists
    const job = await prisma.deliveryJob.findUnique({
      where: { id: ledger.deliveryJobId },
    });

    if (!job) {
      issues.push({
        type: 'ORPHANED_LEDGER',
        severity: 'HIGH',
        deliveryJobId: ledger.deliveryJobId,
        description: 'ProviderLedger exists but DeliveryJob is missing',
        details: {
          ledgerId: ledger.id,
          ledgerState: ledger.externalState,
          deliveryJobExists: false,
        },
        detectedAt: now,
        autoEscalated: false,
      });
    }
  }

  return issues;
}

/**
 * Get audit statistics for dashboard
 */
export async function getAuditStats(): Promise<{
  lastCheck: Date | null;
  totalIssuesDetected: number;
  criticalIssues: number;
  highIssues: number;
  mediumIssues: number;
  lowIssues: number;
  autoEscalated: number;
  topIssueTypes: Array<{ type: string; count: number }>;
}> {
  // Get issues from last 7 days
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  
  // This would ideally be stored in a separate AuditIssue table
  // For now, return placeholder stats
  return {
    lastCheck: null,
    totalIssuesDetected: 0,
    criticalIssues: 0,
    highIssues: 0,
    mediumIssues: 0,
    lowIssues: 0,
    autoEscalated: 0,
    topIssueTypes: [],
  };
}

/**
 * Schedule periodic audit checks
 */
export function startPeriodicAudit(intervalMinutes: number = 60): NodeJS.Timeout {
  const runAudit = async () => {
    try {
      console.log('[audit] Running scheduled consistency check...');
      const result = await runAuditConsistencyCheck(500);
      
      if (result.issuesFound > 0) {
        console.log(`[audit] Found ${result.issuesFound} issues, escalated ${result.escalatedToDLQ} to DLQ`);
      }
    } catch (err) {
      console.error('[audit] Error during scheduled check:', err);
    }
  };

  // Run immediately
  runAudit();

  // Then run periodically
  return setInterval(runAudit, intervalMinutes * 60 * 1000);
}
