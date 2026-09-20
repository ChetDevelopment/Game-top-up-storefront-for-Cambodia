/**
 * Provider Circuit Breaker
 * 
 * Prevents cascade failures during provider outages.
 * Implements standard circuit breaker pattern with three states:
 * 
 * CLOSED → Normal operation, requests flow through
 * OPEN → All requests blocked immediately, fail fast
 * HALF_OPEN → Limited test requests to check recovery
 * 
 * Triggers to OPEN:
 * - Failure rate > 20% in rolling window
 * - Timeout rate > 15% in rolling window
 * - Health score < 0.2 (critical)
 * - Manual override
 * 
 * Recovery from OPEN:
 * - After timeout (default 5 min), transition to HALF_OPEN
 * - Allow 1-5 test requests
 * - If test requests succeed → CLOSED
 * - If test requests fail → back to OPEN
 */

import { getProviderHealth, getProviderStatus, ProviderName } from "./provider-health";
import { prisma } from "./prisma";

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerState {
  provider: ProviderName;
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastFailureTime: Date | null;
  lastStateChange: Date;
  nextRetryTime: Date | null;
  testRequestsAllowed: number;
  testRequestsUsed: number;
  reason?: string;
}

export interface CircuitBreakerConfig {
  failureThreshold: number; // failures before opening
  timeoutRateThreshold: number; // timeout rate before opening
  healthScoreThreshold: number; // health score before opening
  openTimeoutMs: number; // time in OPEN before HALF_OPEN
  halfOpenMaxRequests: number; // test requests in HALF_OPEN
  successThreshold: number; // successes in HALF_OPEN before CLOSED
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  timeoutRateThreshold: 0.15,
  healthScoreThreshold: 0.2,
  openTimeoutMs: 5 * 60 * 1000, // 5 minutes
  halfOpenMaxRequests: 3,
  successThreshold: 2,
};

const configCache = new Map<ProviderName, CircuitBreakerConfig>();

/**
 * Get or create circuit breaker state for a provider
 */
async function getCircuitState(provider: ProviderName): Promise<CircuitBreakerState> {
  let state = await prisma.circuitBreaker.findUnique({
    where: { provider },
  });

  if (!state) {
    // Create initial state
    state = await prisma.circuitBreaker.create({
      data: {
        provider,
        state: 'CLOSED',
        failureCount: 0,
        successCount: 0,
        lastFailureTime: null,
        lastStateChange: new Date(),
        nextRetryTime: null,
        testRequestsAllowed: 0,
        testRequestsUsed: 0,
        reason: null,
      },
    });
  }

  return state;
}

/**
 * Record a successful provider call
 */
export async function recordCircuitSuccess(provider: ProviderName): Promise<void> {
  const state = await getCircuitState(provider);
  const now = new Date();

  if (state.state === 'HALF_OPEN') {
    const newUsed = state.testRequestsUsed + 1;
    const newSuccess = state.successCount + 1;

    // Check if we should close the circuit
    if (newSuccess >= DEFAULT_CONFIG.successThreshold) {
      // Transition to CLOSED
      await prisma.circuitBreaker.update({
        where: { provider },
        data: {
          state: 'CLOSED',
          failureCount: 0,
          successCount: 0,
          testRequestsUsed: 0,
          testRequestsAllowed: 0,
          lastStateChange: now,
          nextRetryTime: null,
          reason: null,
        },
      });
      console.log(`[circuit] ${provider}: HALF_OPEN → CLOSED (recovered)`);
    } else {
      // Continue in HALF_OPEN
      await prisma.circuitBreaker.update({
        where: { provider },
        data: {
          successCount: newSuccess,
          testRequestsUsed: newUsed,
        },
      });
    }
  } else if (state.state === 'CLOSED') {
    // Reset failure count on success in CLOSED state
    await prisma.circuitBreaker.update({
      where: { provider },
      data: {
        failureCount: 0,
        successCount: state.successCount + 1,
      },
    });
  }
}

/**
 * Record a failed provider call
 */
export async function recordCircuitFailure(
  provider: ProviderName,
  reason: string,
  isTimeout: boolean = false
): Promise<void> {
  const state = await getCircuitState(provider);
  const now = new Date();
  const config = getConfig(provider);

  if (state.state === 'CLOSED') {
    const newFailureCount = state.failureCount + 1;

    // Check health score
    const healthStatus = await getProviderStatus(provider);
    
    // Check if we should open the circuit
    const shouldOpen = 
      newFailureCount >= config.failureThreshold ||
      healthStatus.healthScore < config.healthScoreThreshold ||
      (isTimeout && healthStatus.metrics.timeoutRate > config.timeoutRateThreshold);

    if (shouldOpen) {
      // Transition to OPEN
      await prisma.circuitBreaker.update({
        where: { provider },
        data: {
          state: 'OPEN',
          failureCount: newFailureCount,
          lastFailureTime: now,
          lastStateChange: now,
          nextRetryTime: new Date(Date.now() + config.openTimeoutMs),
          testRequestsAllowed: 0,
          testRequestsUsed: 0,
          reason: reason || `Failure threshold reached (${newFailureCount} failures)`,
        },
      });
      console.log(`[circuit] ${provider}: CLOSED → OPEN (${reason})`);
    } else {
      // Stay CLOSED, increment failure count
      await prisma.circuitBreaker.update({
        where: { provider },
        data: {
          failureCount: newFailureCount,
          lastFailureTime: now,
        },
      });
    }
  } else if (state.state === 'HALF_OPEN') {
    // Any failure in HALF_OPEN → back to OPEN
    await prisma.circuitBreaker.update({
      where: { provider },
      data: {
        state: 'OPEN',
        failureCount: state.failureCount + 1,
        lastFailureTime: now,
        lastStateChange: now,
        nextRetryTime: new Date(Date.now() + config.openTimeoutMs * 2), // Exponential backoff
        testRequestsAllowed: 0,
        testRequestsUsed: 0,
        reason: `Test request failed: ${reason}`,
      },
    });
    console.log(`[circuit] ${provider}: HALF_OPEN → OPEN (${reason})`);
  }
}

/**
 * Check if request is allowed for a provider
 * Returns { allowed, reason, state }
 */
export async function isRequestAllowed(provider: ProviderName): Promise<{
  allowed: boolean;
  reason: string;
  state: CircuitState;
  nextRetryTime?: Date;
}> {
  const state = await getCircuitState(provider);
  const now = new Date();

  if (state.state === 'CLOSED') {
    return {
      allowed: true,
      reason: 'Circuit CLOSED - normal operation',
      state: 'CLOSED',
    };
  }

  if (state.state === 'OPEN') {
    // Check if timeout has elapsed
    if (state.nextRetryTime && now >= state.nextRetryTime) {
      // Transition to HALF_OPEN
      const config = getConfig(provider);
      await prisma.circuitBreaker.update({
        where: { provider },
        data: {
          state: 'HALF_OPEN',
          lastStateChange: now,
          testRequestsAllowed: config.halfOpenMaxRequests,
          testRequestsUsed: 0,
          successCount: 0,
          failureCount: 0,
        },
      });
      console.log(`[circuit] ${provider}: OPEN → HALF_OPEN (testing recovery)`);
      
      return {
        allowed: true,
        reason: 'Circuit HALF_OPEN - test request allowed',
        state: 'HALF_OPEN',
      };
    }

    return {
      allowed: false,
      reason: `Circuit OPEN - ${state.reason || 'provider unhealthy'}`,
      state: 'OPEN',
      nextRetryTime: state.nextRetryTime || undefined,
    };
  }

  if (state.state === 'HALF_OPEN') {
    // Check if we have test requests remaining
    if (state.testRequestsUsed < state.testRequestsAllowed) {
      return {
        allowed: true,
        reason: `Circuit HALF_OPEN - test request ${state.testRequestsUsed + 1}/${state.testRequestsAllowed}`,
        state: 'HALF_OPEN',
      };
    }

    return {
      allowed: false,
      reason: 'Circuit HALF_OPEN - no test requests remaining',
      state: 'HALF_OPEN',
      nextRetryTime: state.nextRetryTime || undefined,
    };
  }

  return {
    allowed: false,
    reason: 'Unknown circuit state',
    state: 'CLOSED',
  };
}

/**
 * Force open circuit breaker (manual override)
 */
export async function forceOpenCircuit(provider: ProviderName, reason: string): Promise<void> {
  const config = getConfig(provider);
  await prisma.circuitBreaker.update({
    where: { provider },
    data: {
      state: 'OPEN',
      lastStateChange: new Date(),
      nextRetryTime: new Date(Date.now() + config.openTimeoutMs),
      reason: `MANUAL OVERRIDE: ${reason}`,
    },
  });
  console.log(`[circuit] ${provider}: Force OPEN - ${reason}`);
}

/**
 * Force close circuit breaker (manual override)
 */
export async function forceCloseCircuit(provider: ProviderName): Promise<void> {
  await prisma.circuitBreaker.update({
    where: { provider },
    data: {
      state: 'CLOSED',
      failureCount: 0,
      successCount: 0,
      lastStateChange: new Date(),
      nextRetryTime: null,
      reason: null,
    },
  });
  console.log(`[circuit] ${provider}: Force CLOSE - manual reset`);
}

/**
 * Get circuit breaker state for all providers
 */
export async function getAllCircuitStates(): Promise<Record<ProviderName, CircuitBreakerState>> {
  const providers: ProviderName[] = ['GAMEDROP', 'G2BULK', 'BAKONG'];
  const states = await prisma.circuitBreaker.findMany({
    where: { provider: { in: providers } },
  });

  const result: Record<ProviderName, CircuitBreakerState> = {
    GAMEDROP: states.find(s => s.provider === 'GAMEDROP') || await getCircuitState('GAMEDROP'),
    G2BULK: states.find(s => s.provider === 'G2BULK') || await getCircuitState('G2BULK'),
    BAKONG: states.find(s => s.provider === 'BAKONG') || await getCircuitState('BAKONG'),
  };

  return result;
}

/**
 * Get config for provider (with caching)
 */
function getConfig(provider: ProviderName): CircuitBreakerConfig {
  if (!configCache.has(provider)) {
    configCache.set(provider, { ...DEFAULT_CONFIG });
  }
  return configCache.get(provider)!;
}

/**
 * Update circuit breaker config
 */
export function updateCircuitConfig(provider: ProviderName, updates: Partial<CircuitBreakerConfig>): void {
  const current = getConfig(provider);
  configCache.set(provider, { ...current, ...updates });
}

/**
 * Get circuit breaker dashboard data
 */
export async function getCircuitBreakerDashboard(): Promise<{
  states: Record<ProviderName, CircuitBreakerState>;
  healthScores: Record<ProviderName, number>;
  alerts: Array<{ provider: ProviderName; alert: string; severity: 'HIGH' | 'MEDIUM' }>;
}> {
  const states = await getAllCircuitStates();
  const alerts: Array<{ provider: ProviderName; alert: string; severity: 'HIGH' | 'MEDIUM' }> = [];

  const healthScores: Record<ProviderName, number> = {
    GAMEDROP: 1.0,
    G2BULK: 1.0,
    BAKONG: 1.0,
  };

  for (const [provider, state] of Object.entries(states)) {
    const health = await getProviderHealth(provider as ProviderName);
    healthScores[provider as ProviderName] = health.healthScore;

    if (state.state === 'OPEN') {
      alerts.push({
        provider: provider as ProviderName,
        alert: `Circuit OPEN - ${state.reason || 'provider unhealthy'}`,
        severity: 'HIGH',
      });
    } else if (state.state === 'HALF_OPEN') {
      alerts.push({
        provider: provider as ProviderName,
        alert: `Circuit HALF_OPEN - testing recovery`,
        severity: 'MEDIUM',
      });
    }

    if (health.healthScore < 0.5) {
      alerts.push({
        provider: provider as ProviderName,
        alert: `Provider health degraded (score: ${health.healthScore.toFixed(2)})`,
        severity: health.healthScore < 0.2 ? 'HIGH' : 'MEDIUM',
      });
    }
  }

  return {
    states,
    healthScores,
    alerts,
  };
}
