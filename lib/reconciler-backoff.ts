/**
 * Reconciliation Backoff Engine
 * 
 * Prevents provider overload during reconciliation.
 * Implements exponential backoff with jitter per job.
 * 
 * Backoff schedule:
 * Attempt 1 → 10s
 * Attempt 2 → 30s
 * Attempt 3 → 2 min
 * Attempt 4 → 10 min
 * Attempt 5+ → Escalate to manual review
 * 
 * Features:
 * - Per-provider rate limiting
 * - Jitter to prevent thundering herd
 * - Respects provider health score
 * - Never hammers provider APIs
 */

import { prisma } from "./prisma";
import { getProviderHealth, ProviderName } from "./provider-health";
import { isRequestAllowed } from "./circuit-breaker";

export interface BackoffSchedule {
  attempt: number;
  delaySeconds: number;
  maxDelaySeconds: number;
}

const BACKOFF_SCHEDULE: BackoffSchedule[] = [
  { attempt: 1, delaySeconds: 10, maxDelaySeconds: 15 },
  { attempt: 2, delaySeconds: 30, maxDelaySeconds: 45 },
  { attempt: 3, delaySeconds: 120, maxDelaySeconds: 180 },
  { attempt: 4, delaySeconds: 600, maxDelaySeconds: 900 },
  { attempt: 5, delaySeconds: 1800, maxDelaySeconds: 2700 }, // 30-45 min
];

const MAX_RECONCILE_ATTEMPTS = 5;

/**
 * Calculate next retry time with exponential backoff + jitter
 */
export function calculateNextRetryTime(
  attempt: number,
  baseTime: Date = new Date()
): Date {
  const schedule = BACKOFF_SCHEDULE[Math.min(attempt, BACKOFF_SCHEDULE.length - 1)];
  
  // Add jitter (±20%)
  const jitter = (Math.random() - 0.5) * 0.4 * schedule.delaySeconds;
  const delayWithJitter = Math.max(0, schedule.delaySeconds + jitter);
  
  return new Date(baseTime.getTime() + delayWithJitter * 1000);
}

/**
 * Check if job is ready for reconciliation
 */
export async function isJobReadyForReconcile(
  deliveryJobId: string
): Promise<{
  ready: boolean;
  reason: string;
  nextAttemptTime?: Date;
}> {
  const job = await prisma.deliveryJob.findUnique({
    where: { id: deliveryJobId },
    include: { providerLedger: true },
  });

  if (!job) {
    return { ready: false, reason: 'Job not found' };
  }

  if (job.status !== 'UNKNOWN_EXTERNAL_STATE') {
    return { ready: false, reason: `Job not in UNKNOWN state: ${job.status}` };
  }

  // Check if max attempts exceeded
  if ((job.attempt || 0) >= MAX_RECONCILE_ATTEMPTS) {
    return { 
      ready: false, 
      reason: `Max reconciliation attempts reached (${MAX_RECONCILE_ATTEMPTS})` 
    };
  }

  // Check next attempt time
  if (job.nextAttemptAt && job.nextAttemptAt > new Date()) {
    return {
      ready: false,
      reason: 'Not yet time for next attempt',
      nextAttemptTime: job.nextAttemptAt,
    };
  }

  // Check provider circuit breaker
  const provider = job.providerLedger?.provider as ProviderName | undefined;
  if (provider) {
    const circuitCheck = await isRequestAllowed(provider);
    if (!circuitCheck.allowed) {
      return {
        ready: false,
        reason: `Circuit breaker: ${circuitCheck.reason}`,
        nextAttemptTime: circuitCheck.nextRetryTime,
      };
    }
  }

  // Check provider health
  if (provider) {
    const health = await getProviderHealth(provider);
    if (health.healthScore < 0.2) {
      return {
        ready: false,
        reason: `Provider health critical (${health.healthScore.toFixed(2)})`,
      };
    }
  }

  return { ready: true, reason: 'Ready for reconciliation' };
}

/**
 * Get jobs ready for reconciliation with backoff consideration
 */
export async function getJobsReadyForReconcile(
  limit: number = 50,
  provider?: ProviderName
): Promise<any[]> {
  const now = new Date();

  const where: any = {
    status: 'UNKNOWN_EXTERNAL_STATE',
    nextAttemptAt: { lte: now },
    attempt: { lt: MAX_RECONCILE_ATTEMPTS },
  };

  if (provider) {
    where.providerLedger = {
      provider,
    };
  }

  const jobs = await prisma.deliveryJob.findMany({
    where,
    include: {
      providerLedger: true,
      order: {
        include: {
          game: true,
          product: true,
        },
      },
    },
    orderBy: { nextAttemptAt: 'asc' },
    take: limit,
  });

  // Filter by readiness (circuit breaker, health, etc.)
  const readyJobs = [];
  for (const job of jobs) {
    const readiness = await isJobReadyForReconcile(job.id);
    if (readiness.ready) {
      readyJobs.push(job);
    }
  }

  return readyJobs;
}

/**
 * Update job with next retry time after reconciliation attempt
 */
export async function scheduleNextReconcileAttempt(
  deliveryJobId: string,
  attempt: number
): Promise<void> {
  const nextAttemptTime = calculateNextRetryTime(attempt);

  await prisma.deliveryJob.update({
    where: { id: deliveryJobId },
    data: {
      attempt: attempt + 1,
      nextAttemptAt: nextAttemptTime,
    },
  });
}

/**
 * Get per-provider rate limits based on health
 */
export async function getProviderRateLimit(provider: ProviderName): Promise<{
  maxConcurrent: number;
  requestsPerMinute: number;
  delayBetweenRequests: number;
}> {
  const health = await getProviderHealth(provider);

  // Adjust limits based on health score
  if (health.healthScore >= 0.8) {
    // Healthy - normal limits
    return {
      maxConcurrent: 10,
      requestsPerMinute: 60,
      delayBetweenRequests: 1000, // 1 second
    };
  } else if (health.healthScore >= 0.5) {
    // Degraded - reduced limits
    return {
      maxConcurrent: 5,
      requestsPerMinute: 30,
      delayBetweenRequests: 2000, // 2 seconds
    };
  } else if (health.healthScore >= 0.2) {
    // Unhealthy - strict limits
    return {
      maxConcurrent: 2,
      requestsPerMinute: 10,
      delayBetweenRequests: 6000, // 6 seconds
    };
  } else {
    // Critical - minimal limits
    return {
      maxConcurrent: 1,
      requestsPerMinute: 5,
      delayBetweenRequests: 12000, // 12 seconds
    };
  }
}

/**
 * Rate limiter for provider API calls
 */
class ProviderRateLimiter {
  private lastCallTime = new Map<ProviderName, number>();
  private concurrentCalls = new Map<ProviderName, number>();

  async acquire(provider: ProviderName): Promise<boolean> {
    const limits = await getProviderRateLimit(provider);
    const now = Date.now();

    // Check concurrent calls
    const current = this.concurrentCalls.get(provider) || 0;
    if (current >= limits.maxConcurrent) {
      return false;
    }

    // Check rate limit
    const lastCall = this.lastCallTime.get(provider) || 0;
    const timeSinceLastCall = now - lastCall;
    if (timeSinceLastCall < limits.delayBetweenRequests) {
      return false;
    }

    // Acquire
    this.concurrentCalls.set(provider, current + 1);
    this.lastCallTime.set(provider, now);
    return true;
  }

  release(provider: ProviderName): void {
    const current = this.concurrentCalls.get(provider) || 0;
    this.concurrentCalls.set(provider, Math.max(0, current - 1));
  }
}

export const rateLimiter = new ProviderRateLimiter();

/**
 * Execute reconciliation with rate limiting
 */
export async function executeWithRateLimit<T>(
  provider: ProviderName,
  action: () => Promise<T>
): Promise<T | null> {
  // Wait for rate limit
  let attempts = 0;
  const maxWaitAttempts = 10;

  while (attempts < maxWaitAttempts) {
    const acquired = await rateLimiter.acquire(provider);
    if (acquired) {
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
    attempts++;
  }

  if (attempts >= maxWaitAttempts) {
    console.warn(`[rate-limiter] Timeout waiting for ${provider} rate limit`);
    return null;
  }

  try {
    return await action();
  } finally {
    rateLimiter.release(provider);
  }
}

/**
 * Get backoff statistics for dashboard
 */
export async function getBackoffStats(): Promise<{
  totalUnknown: number;
  readyForReconcile: number;
  waitingForBackoff: number;
  maxAttemptsReached: number;
  avgNextAttemptDelayMinutes: number;
  byProvider: Record<ProviderName, {
    ready: number;
    waiting: number;
  }>;
}> {
  const unknownJobs = await prisma.deliveryJob.findMany({
    where: { status: 'UNKNOWN_EXTERNAL_STATE' },
    include: { providerLedger: true },
  });

  const now = new Date();
  const stats = {
    totalUnknown: unknownJobs.length,
    readyForReconcile: 0,
    waitingForBackoff: 0,
    maxAttemptsReached: 0,
    avgNextAttemptDelayMinutes: 0,
    byProvider: {
      GAMEDROP: { ready: 0, waiting: 0 },
      G2BULK: { ready: 0, waiting: 0 },
      BAKONG: { ready: 0, waiting: 0 },
    },
  };

  let totalDelay = 0;

  for (const job of unknownJobs) {
    const provider = job.providerLedger?.provider as ProviderName || 'GAMEDROP';
    
    if ((job.attempt || 0) >= MAX_RECONCILE_ATTEMPTS) {
      stats.maxAttemptsReached++;
    } else if (job.nextAttemptAt && job.nextAttemptAt <= now) {
      stats.readyForReconcile++;
      stats.byProvider[provider].ready++;
    } else {
      stats.waitingForBackoff++;
      stats.byProvider[provider].waiting++;
      
      if (job.nextAttemptAt) {
        const delayMinutes = (job.nextAttemptAt.getTime() - now.getTime()) / (1000 * 60);
        totalDelay += delayMinutes;
      }
    }
  }

  const waitingCount = stats.waitingForBackoff + stats.readyForReconcile;
  if (waitingCount > 0) {
    stats.avgNextAttemptDelayMinutes = totalDelay / waitingCount;
  }

  return stats;
}
