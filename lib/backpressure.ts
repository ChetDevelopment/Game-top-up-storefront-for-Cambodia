/**
 * Backpressure Control System
 * 
 * Prevents system collapse during provider failures.
 * Implements protective throttling when failure rates exceed thresholds.
 * 
 * Trigger conditions (ANY of these):
 * - UNKNOWN rate > 10%
 * - Manual review queue > 1000 jobs
 * - Provider circuit breaker OPEN
 * - DLQ growth rate > 10/hour
 * 
 * Actions when triggered:
 * 1. Reduce worker concurrency
 * 2. Pause new dispatches
 * 3. Prioritize reconciliation only
 * 4. Stop retries completely
 * 
 * System enters PROTECTIVE_MODE until conditions normalize.
 */

import { prisma } from "./prisma";
import { getAllCircuitStates } from "./circuit-breaker";
import { getDLQStats } from "./dead-letter-queue";
import { getUnknownStats } from "./unknown-escalation";
import { notifyTelegram } from "./telegram";

export type SystemMode = 'NORMAL' | 'DEGRADED' | 'PROTECTIVE';

export interface BackpressureState {
  mode: SystemMode;
  triggeredAt: Date | null;
  reasons: string[];
  metrics: {
    unknownRate: number;
    manualReviewQueueSize: number;
    dlqGrowthRate: number;
    openCircuitBreakers: number;
  };
  actions: {
    reduceConcurrency: boolean;
    pauseDispatches: boolean;
    prioritizeReconciliation: boolean;
    stopRetries: boolean;
  };
}

const THRESHOLDS = {
  UNKNOWN_RATE: 0.10, // 10%
  MANUAL_REVIEW_QUEUE: 1000,
  DLQ_GROWTH_RATE_PER_HOUR: 10,
  OPEN_CIRCUIT_BREAKERS: 1, // Any open circuit
};

let currentState: BackpressureState = {
  mode: 'NORMAL',
  triggeredAt: null,
  reasons: [],
  metrics: {
    unknownRate: 0,
    manualReviewQueueSize: 0,
    dlqGrowthRate: 0,
    openCircuitBreakers: 0,
  },
  actions: {
    reduceConcurrency: false,
    pauseDispatches: false,
    prioritizeReconciliation: false,
    stopRetries: false,
  },
};

const lastStateChange = new Date(0);
const STATE_CHANGE_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Evaluate current system state and update backpressure
 */
export async function evaluateBackpressure(): Promise<BackpressureState> {
  const now = new Date();
  
  // Prevent rapid state changes
  if (now.getTime() - lastStateChange.getTime() < STATE_CHANGE_COOLDOWN_MS) {
    return currentState;
  }

  // Gather metrics
  const [unknownStats, circuitStates, dlqStats] = await Promise.all([
    getUnknownStats(),
    getAllCircuitStates(),
    getDLQStats(),
  ]);

  const manualReviewCount = await prisma.manualReviewQueue.count({
    where: { status: 'PENDING' },
  });

  // Calculate total deliveries (approximate from last hour)
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const totalDeliveries = await prisma.deliveryJob.count({
    where: {
      createdAt: { gte: oneHourAgo },
    },
  });

  const unknownRate = totalDeliveries > 0 
    ? unknownStats.total / totalDeliveries 
    : 0;

  const openCircuitBreakers = Object.values(circuitStates).filter(
    s => s.state === 'OPEN'
  ).length;

  // Calculate DLQ growth rate (entries created in last hour)
  const dlqLastHour = await prisma.deadLetterQueue.count({
    where: {
      createdAt: { gte: oneHourAgo },
    },
  });
  const dlqGrowthRate = dlqLastHour;

  // Determine if backpressure should be triggered
  const reasons: string[] = [];

  if (unknownRate > THRESHOLDS.UNKNOWN_RATE) {
    reasons.push(`UNKNOWN rate ${(unknownRate * 100).toFixed(1)}% > ${(THRESHOLDS.UNKNOWN_RATE * 100).toFixed(0)}%`);
  }

  if (manualReviewCount > THRESHOLDS.MANUAL_REVIEW_QUEUE) {
    reasons.push(`Manual review queue ${manualReviewCount} > ${THRESHOLDS.MANUAL_REVIEW_QUEUE}`);
  }

  if (openCircuitBreakers >= THRESHOLDS.OPEN_CIRCUIT_BREAKERS) {
    reasons.push(`${openCircuitBreakers} circuit breaker(s) OPEN`);
  }

  if (dlqGrowthRate > THRESHOLDS.DLQ_GROWTH_RATE_PER_HOUR) {
    reasons.push(`DLQ growth ${dlqGrowthRate}/hour > ${THRESHOLDS.DLQ_GROWTH_RATE_PER_HOUR}/hour`);
  }

  // Determine mode
  let newMode: SystemMode = 'NORMAL';
  if (reasons.length >= 2) {
    newMode = 'PROTECTIVE';
  } else if (reasons.length === 1) {
    newMode = 'DEGRADED';
  }

  // Update state if changed
  if (newMode !== currentState.mode) {
    const oldMode = currentState.mode;
    currentState = {
      mode: newMode,
      triggeredAt: newMode === 'NORMAL' ? null : new Date(),
      reasons,
      metrics: {
        unknownRate,
        manualReviewQueueSize: manualReviewCount,
        dlqGrowthRate,
        openCircuitBreakers,
      },
      actions: getActionsForMode(newMode),
    };

    lastStateChange.setTime(now.getTime());

    console.log(`[backpressure] Mode changed: ${oldMode} → ${newMode}`);
    
    // Notify if entering PROTECTIVE mode
    if (newMode === 'PROTECTIVE') {
      await notifyProtectiveMode(reasons);
    }
  } else {
    // Update metrics even if mode unchanged
    currentState.metrics = {
      unknownRate,
      manualReviewQueueSize: manualReviewCount,
      dlqGrowthRate,
      openCircuitBreakers,
    };
    currentState.reasons = reasons;
  }

  return currentState;
}

/**
 * Get actions for each mode
 */
function getActionsForMode(mode: SystemMode): BackpressureState['actions'] {
  switch (mode) {
    case 'NORMAL':
      return {
        reduceConcurrency: false,
        pauseDispatches: false,
        prioritizeReconciliation: false,
        stopRetries: false,
      };

    case 'DEGRADED':
      return {
        reduceConcurrency: true,
        pauseDispatches: false,
        prioritizeReconciliation: true,
        stopRetries: false,
      };

    case 'PROTECTIVE':
      return {
        reduceConcurrency: true,
        pauseDispatches: true,
        prioritizeReconciliation: true,
        stopRetries: true,
      };
  }
}

/**
 * Notify operators about protective mode
 */
async function notifyProtectiveMode(reasons: string[]): Promise<void> {
  const message = `🚨 <b>PROTECTIVE MODE ACTIVATED</b>

System has entered protective throttling mode.

<b>Reasons:</b>
${reasons.map(r => `• ${r}`).join('\n')}

<b>Actions Taken:</b>
• Worker concurrency reduced
• New dispatches paused
• Reconciliation prioritized
• Retries stopped

<b>Required Actions:</b>
1. Investigate provider health
2. Check circuit breaker status
3. Clear manual review backlog
4. Monitor DLQ growth

System will auto-recover when metrics normalize.`;

  await notifyTelegram(message);
}

/**
 * Check if new dispatches are allowed
 */
export function canDispatchNewJobs(): boolean {
  return !currentState.actions.pauseDispatches;
}

/**
 * Check if retries are allowed
 */
export function canRetryJobs(): boolean {
  return !currentState.actions.stopRetries;
}

/**
 * Get worker concurrency limit
 */
export function getWorkerConcurrencyLimit(): number {
  if (currentState.actions.reduceConcurrency) {
    return currentState.mode === 'PROTECTIVE' ? 5 : 10;
  }
  return 20; // Normal concurrency
}

/**
 * Get current backpressure state
 */
export function getBackpressureState(): BackpressureState {
  return { ...currentState };
}

/**
 * Force enter protective mode (manual override)
 */
export async function forceProtectiveMode(reason: string): Promise<void> {
  const now = new Date();
  
  currentState = {
    mode: 'PROTECTIVE',
    triggeredAt: now,
    reasons: [`MANUAL OVERRIDE: ${reason}`],
    metrics: currentState.metrics,
    actions: getActionsForMode('PROTECTIVE'),
  };

  lastStateChange.setTime(now.getTime());
  await notifyProtectiveMode([reason]);
  
  console.log(`[backpressure] Force entered PROTECTIVE mode: ${reason}`);
}

/**
 * Force exit protective mode (manual override)
 */
export async function forceNormalMode(): Promise<void> {
  const now = new Date();
  
  currentState = {
    mode: 'NORMAL',
    triggeredAt: null,
    reasons: [],
    metrics: currentState.metrics,
    actions: getActionsForMode('NORMAL'),
  };

  lastStateChange.setTime(now.getTime());
  
  console.log('[backpressure] Force exited to NORMAL mode');
}

/**
 * Get backpressure dashboard data
 */
export async function getBackpressureDashboard(): Promise<{
  state: BackpressureState;
  thresholds: typeof THRESHOLDS;
  recommendations: string[];
}> {
  const recommendations: string[] = [];

  if (currentState.mode !== 'NORMAL') {
    if (currentState.metrics.unknownRate > THRESHOLDS.UNKNOWN_RATE) {
      recommendations.push('Investigate UNKNOWN state root cause');
    }
    if (currentState.metrics.manualReviewQueueSize > THRESHOLDS.MANUAL_REVIEW_QUEUE) {
      recommendations.push('Add manual review operators');
    }
    if (currentState.metrics.openCircuitBreakers > 0) {
      recommendations.push('Check provider health and circuit breakers');
    }
    if (currentState.metrics.dlqGrowthRate > THRESHOLDS.DLQ_GROWTH_RATE_PER_HOUR) {
      recommendations.push('Review DLQ entries for patterns');
    }
  }

  return {
    state: currentState,
    thresholds: THRESHOLDS,
    recommendations,
  };
}
