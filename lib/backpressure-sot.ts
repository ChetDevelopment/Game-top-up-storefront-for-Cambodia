/**
 * Backpressure Control - Single Source of Truth Version
 * 
 * All state stored in DB (BackpressureState table).
 * No in-memory state.
 * Cross-worker synchronized.
 */

import { prisma } from "./prisma";

export type BackpressureMode = 'NORMAL' | 'DEGRADED' | 'PROTECTIVE';

export interface BackpressureState {
  id: string;
  mode: BackpressureMode;
  triggeredAt: Date | null;
  triggeredBy: string | null;
  reason: string | null;
  unknownRate: number;
  manualReviewCount: number;
  dlqGrowthRate: number;
  openCircuitBreakers: number;
  reduceConcurrency: boolean;
  pauseDispatches: boolean;
  stopRetries: boolean;
}

const THRESHOLDS = {
  UNKNOWN_RATE: 0.10,
  MANUAL_REVIEW_QUEUE: 1000,
  DLQ_GROWTH_RATE: 10,
  OPEN_CIRCUIT_BREAKERS: 1,
};

const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Get current backpressure state from DB
 */
export async function getBackpressureState(): Promise<BackpressureState> {
  let state = await prisma.backpressureState.findUnique({
    where: { id: 'singleton' },
  });
  
  if (!state) {
    // Initialize
    state = await prisma.backpressureState.create({
      data: {
        id: 'singleton',
        mode: 'NORMAL',
        unknownRate: 0,
        manualReviewCount: 0,
        dlqGrowthRate: 0,
        openCircuitBreakers: 0,
        reduceConcurrency: false,
        pauseDispatches: false,
        stopRetries: false,
      },
    });
  }
  
  return state;
}

/**
 * Evaluate and update backpressure state
 */
export async function evaluateBackpressure(): Promise<BackpressureState> {
  const now = new Date();
  
  // Gather metrics from DB
  const [unknownStats, circuitStates, dlqStats] = await Promise.all([
    prisma.$queryRaw<{ total: number }[]>`
      SELECT COUNT(*) as total FROM "DeliveryState" 
      WHERE status = 'UNKNOWN'
    `,
    prisma.circuitBreaker.findMany({
      where: { state: 'OPEN' },
    }),
    prisma.$queryRaw<{ growth: number }[]>`
      SELECT COUNT(*) as growth FROM "DeadLetterQueue"
      WHERE "createdAt" > NOW() - INTERVAL '1 hour'
    `,
  ]);
  
  const manualReviewCount = await prisma.$queryRaw<{ count: number }[]>`
    SELECT COUNT(*) as count FROM "ManualReviewQueue"
    WHERE status = 'PENDING'
  `;
  
  const totalDeliveries = await prisma.$queryRaw<{ total: number }[]>`
    SELECT COUNT(*) as total FROM "DeliveryState"
    WHERE "createdAt" > NOW() - INTERVAL '1 hour'
  `;
  
  const unknownRate = totalDeliveries[0].total > 0
    ? unknownStats[0].total / totalDeliveries[0].total
    : 0;
  
  const openCircuitBreakers = circuitStates.length;
  const dlqGrowthRate = dlqStats[0].growth;
  
  // Determine mode
  const reasons: string[] = [];
  
  if (unknownRate > THRESHOLDS.UNKNOWN_RATE) {
    reasons.push(`UNKNOWN rate ${(unknownRate * 100).toFixed(1)}%`);
  }
  if (manualReviewCount[0].count > THRESHOLDS.MANUAL_REVIEW_QUEUE) {
    reasons.push(`Manual review queue ${manualReviewCount[0].count}`);
  }
  if (openCircuitBreakers >= THRESHOLDS.OPEN_CIRCUIT_BREAKERS) {
    reasons.push(`${openCircuitBreakers} circuit breaker(s) OPEN`);
  }
  if (dlqGrowthRate > THRESHOLDS.DLQ_GROWTH_RATE) {
    reasons.push(`DLQ growth ${dlqGrowthRate}/hour`);
  }
  
  let newMode: BackpressureMode = 'NORMAL';
  if (reasons.length >= 2) {
    newMode = 'PROTECTIVE';
  } else if (reasons.length === 1) {
    newMode = 'DEGRADED';
  }
  
  // Update DB
  const updated = await prisma.backpressureState.update({
    where: { id: 'singleton' },
    data: {
      mode: newMode,
      triggeredAt: newMode === 'NORMAL' ? null : now,
      triggeredBy: null,
      reason: reasons.join('; '),
      unknownRate,
      manualReviewCount: manualReviewCount[0].count,
      dlqGrowthRate,
      openCircuitBreakers,
      reduceConcurrency: newMode !== 'NORMAL',
      pauseDispatches: newMode === 'PROTECTIVE',
      stopRetries: newMode === 'PROTECTIVE',
    },
  });
  
  return updated;
}

/**
 * Check if dispatches are allowed
 */
export function canDispatch(state: BackpressureState): boolean {
  return !state.pauseDispatches;
}

/**
 * Check if retries are allowed
 */
export function canRetry(state: BackpressureState): boolean {
  return !state.stopRetries;
}

/**
 * Get concurrency limit based on mode
 */
export function getConcurrencyLimit(state: BackpressureState): number {
  switch (state.mode) {
    case 'PROTECTIVE':
      return 5;
    case 'DEGRADED':
      return 10;
    default:
      return 20;
  }
}

/**
 * Force mode change (manual override)
 */
export async function forceBackpressureMode(
  mode: BackpressureMode,
  reason: string,
  triggeredBy: string
): Promise<void> {
  await prisma.backpressureState.update({
    where: { id: 'singleton' },
    data: {
      mode,
      triggeredAt: new Date(),
      triggeredBy,
      reason: `MANUAL: ${reason}`,
      reduceConcurrency: mode !== 'NORMAL',
      pauseDispatches: mode === 'PROTECTIVE',
      stopRetries: mode === 'PROTECTIVE',
    },
  });
}
