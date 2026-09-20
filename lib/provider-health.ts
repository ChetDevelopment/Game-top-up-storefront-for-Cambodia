/**
 * Provider Health Scoring System
 * 
 * Tracks per-provider health metrics and computes real-time health scores.
 * Used by circuit breaker, worker routing, and reconciliation priority.
 * 
 * Metrics tracked (rolling window):
 * - Success rate
 * - Timeout rate
 * - 409 conflict rate
 * - Average latency (p50, p95, p99)
 * - Reconciliation mismatch rate
 * 
 * Output: 0.0 - 1.0 health score
 * - 0.8-1.0: Healthy
 * - 0.5-0.8: Degraded
 * - 0.2-0.5: Unhealthy
 * - 0.0-0.2: Critical (circuit breaker trigger)
 */

import { prisma } from "./prisma";

export type ProviderName = 'GAMEDROP' | 'G2BULK' | 'BAKONG';

export interface ProviderMetrics {
  provider: ProviderName;
  windowMinutes: number;
  totalRequests: number;
  successCount: number;
  failureCount: number;
  timeoutCount: number;
  conflictCount: number; // 409 idempotency conflicts
  successRate: number;
  timeoutRate: number;
  conflictRate: number;
  latencyP50: number;
  latencyP95: number;
  latencyP99: number;
  avgLatency: number;
  healthScore: number;
  status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY' | 'CRITICAL';
}

export interface HealthSnapshot {
  provider: ProviderName;
  healthScore: number;
  status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY' | 'CRITICAL';
  lastUpdated: Date;
  metrics: ProviderMetrics;
}

const WINDOW_MINUTES = 10; // Rolling window for metrics
const HEALTH_THRESHOLDS = {
  CRITICAL: 0.2,
  UNHEALTHY: 0.5,
  DEGRADED: 0.8,
};

/**
 * Record a provider call result
 * Called after every provider API interaction
 */
export async function recordProviderCall(
  provider: ProviderName,
  result: {
    success: boolean;
    timeout?: boolean;
    conflict?: boolean;
    latencyMs: number;
    statusCode?: number;
    errorMessage?: string;
  }
): Promise<void> {
  await prisma.providerHealthMetric.create({
    data: {
      provider,
      success: result.success,
      timeout: result.timeout || false,
      conflict: result.conflict || false,
      latencyMs: result.latencyMs,
      statusCode: result.statusCode?.toString() || null,
      errorMessage: result.errorMessage,
      timestamp: new Date(),
    },
  });
}

/**
 * Calculate health metrics for a provider over a time window
 */
export async function calculateProviderMetrics(
  provider: ProviderName,
  windowMinutes: number = WINDOW_MINUTES
): Promise<ProviderMetrics> {
  const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);

  // Get all metrics in window
  const metrics = await prisma.providerHealthMetric.findMany({
    where: {
      provider,
      timestamp: { gte: windowStart },
    },
    orderBy: { timestamp: 'asc' },
  });

  const totalRequests = metrics.length;
  if (totalRequests === 0) {
    return {
      provider,
      windowMinutes,
      totalRequests: 0,
      successCount: 0,
      failureCount: 0,
      timeoutCount: 0,
      conflictCount: 0,
      successRate: 1.0, // No data = assume healthy
      timeoutRate: 0,
      conflictRate: 0,
      latencyP50: 0,
      latencyP95: 0,
      latencyP99: 0,
      avgLatency: 0,
      healthScore: 1.0,
      status: 'HEALTHY',
    };
  }

  // Calculate counts
  const successCount = metrics.filter(m => m.success).length;
  const failureCount = metrics.filter(m => !m.success).length;
  const timeoutCount = metrics.filter(m => m.timeout).length;
  const conflictCount = metrics.filter(m => m.conflict).length;

  // Calculate rates
  const successRate = successCount / totalRequests;
  const timeoutRate = timeoutCount / totalRequests;
  const conflictRate = conflictCount / totalRequests;

  // Calculate latencies
  const latencies = metrics.map(m => m.latencyMs).sort((a, b) => a - b);
  const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  const latencyP50 = latencies[Math.floor(latencies.length * 0.5)] || 0;
  const latencyP95 = latencies[Math.floor(latencies.length * 0.95)] || 0;
  const latencyP99 = latencies[Math.floor(latencies.length * 0.99)] || 0;

  // Calculate health score
  const healthScore = calculateHealthScore({
    successRate,
    timeoutRate,
    conflictRate,
    latencyP99,
  });

  // Determine status
  const status = getHealthStatus(healthScore);

  return {
    provider,
    windowMinutes,
    totalRequests,
    successCount,
    failureCount,
    timeoutCount,
    conflictCount,
    successRate,
    timeoutRate,
    conflictRate,
    latencyP50,
    latencyP95,
    latencyP99,
    avgLatency,
    healthScore,
    status,
  };
}

/**
 * Calculate health score from metrics
 * Weighted formula:
 * - Success rate: 40%
 * - Timeout rate: 25%
 * - Conflict rate: 15%
 * - Latency: 20%
 */
function calculateHealthScore(metrics: {
  successRate: number;
  timeoutRate: number;
  conflictRate: number;
  latencyP99: number;
}): number {
  const { successRate, timeoutRate, conflictRate, latencyP99 } = metrics;

  // Success rate component (40%)
  const successComponent = successRate * 0.4;

  // Timeout component (25%) - inverted (lower timeout = higher score)
  const timeoutComponent = (1 - Math.min(timeoutRate, 1)) * 0.25;

  // Conflict component (15%) - inverted
  const conflictComponent = (1 - Math.min(conflictRate, 1)) * 0.15;

  // Latency component (20%)
  // Score = 1.0 at 1s, 0.5 at 5s, 0.0 at 15s+
  const latencyScore = Math.max(0, 1 - latencyP99 / 15000);
  const latencyComponent = latencyScore * 0.2;

  const healthScore = successComponent + timeoutComponent + conflictComponent + latencyComponent;
  return Math.max(0, Math.min(1, healthScore));
}

/**
 * Get health status from score
 */
function getHealthStatus(score: number): 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY' | 'CRITICAL' {
  if (score >= HEALTH_THRESHOLDS.DEGRADED) return 'HEALTHY';
  if (score >= HEALTH_THRESHOLDS.UNHEALTHY) return 'DEGRADED';
  if (score >= HEALTH_THRESHOLDS.CRITICAL) return 'UNHEALTHY';
  return 'CRITICAL';
}

/**
 * Get current health snapshot for a provider
 */
export async function getProviderHealth(provider: ProviderName): Promise<HealthSnapshot> {
  const metrics = await calculateProviderMetrics(provider);
  return {
    provider,
    healthScore: metrics.healthScore,
    status: metrics.status,
    lastUpdated: new Date(),
    metrics,
  };
}

/**
 * Get health for all providers
 */
export async function getAllProviderHealth(): Promise<HealthSnapshot[]> {
  const providers: ProviderName[] = ['GAMEDROP', 'G2BULK', 'BAKONG'];
  return Promise.all(providers.map(getProviderHealth));
}

/**
 * Check if provider is healthy enough for normal operations
 */
export async function isProviderHealthy(provider: ProviderName, threshold: number = 0.5): Promise<boolean> {
  const health = await getProviderHealth(provider);
  return health.healthScore >= threshold;
}

/**
 * Get provider status for circuit breaker
 */
export async function getProviderStatus(provider: ProviderName): Promise<{
  allowRequests: boolean;
  reason: string;
  healthScore: number;
  status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY' | 'CRITICAL';
}> {
  const health = await getProviderHealth(provider);
  
  if (health.healthScore < HEALTH_THRESHOLDS.CRITICAL) {
    return {
      allowRequests: false,
      reason: `Provider health critical (score: ${health.healthScore.toFixed(2)})`,
      healthScore: health.healthScore,
      status: health.status,
    };
  }
  
  if (health.metrics.timeoutRate > 0.15) {
    return {
      allowRequests: false,
      reason: `Timeout rate too high (${(health.metrics.timeoutRate * 100).toFixed(1)}%)`,
      healthScore: health.healthScore,
      status: health.status,
    };
  }
  
  if (health.metrics.conflictRate > 0.1) {
    return {
      allowRequests: false,
      reason: `Conflict rate too high (${(health.metrics.conflictRate * 100).toFixed(1)}%)`,
      healthScore: health.healthScore,
      status: health.status,
    };
  }
  
  return {
    allowRequests: true,
    reason: 'Provider healthy',
    healthScore: health.healthScore,
    status: health.status,
  };
}

/**
 * Cleanup old metrics (keep last 24 hours)
 * Called periodically by maintenance job
 */
export async function cleanupOldProviderMetrics(): Promise<number> {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  
  const result = await prisma.providerHealthMetric.deleteMany({
    where: {
      timestamp: { lt: twentyFourHoursAgo },
    },
  });
  
  return result.count;
}

/**
 * Get metrics for dashboard/monitoring
 */
export async function getProviderDashboard(): Promise<{
  providers: HealthSnapshot[];
  circuitBreakerStates: Record<ProviderName, string>;
  alerts: Array<{ provider: ProviderName; alert: string; severity: 'HIGH' | 'MEDIUM' | 'LOW' }>;
}> {
  const providers = await getAllProviderHealth();
  const alerts: Array<{ provider: ProviderName; alert: string; severity: 'HIGH' | 'MEDIUM' | 'LOW' }> = [];
  
  for (const provider of providers) {
    // Critical health alert
    if (provider.status === 'CRITICAL') {
      alerts.push({
        provider: provider.provider as ProviderName,
        alert: `Provider health CRITICAL (score: ${provider.healthScore.toFixed(2)})`,
        severity: 'HIGH',
      });
    }
    
    // High timeout rate
    if (provider.metrics.timeoutRate > 0.1) {
      alerts.push({
        provider: provider.provider as ProviderName,
        alert: `High timeout rate: ${(provider.metrics.timeoutRate * 100).toFixed(1)}%`,
        severity: provider.metrics.timeoutRate > 0.2 ? 'HIGH' : 'MEDIUM',
      });
    }
    
    // High conflict rate
    if (provider.metrics.conflictRate > 0.05) {
      alerts.push({
        provider: provider.provider as ProviderName,
        alert: `High conflict rate: ${(provider.metrics.conflictRate * 100).toFixed(1)}%`,
        severity: 'MEDIUM',
      });
    }
    
    // High latency
    if (provider.metrics.latencyP99 > 10000) {
      alerts.push({
        provider: provider.provider as ProviderName,
        alert: `High P99 latency: ${(provider.metrics.latencyP99 / 1000).toFixed(1)}s`,
        severity: 'MEDIUM',
      });
    }
  }
  
  return {
    providers,
    circuitBreakerStates: {}, // Will be populated by circuit breaker module
    alerts,
  };
}
