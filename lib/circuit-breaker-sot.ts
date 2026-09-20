/**
 * Circuit Breaker - Single Source of Truth Version
 * 
 * All state stored in DB (CircuitBreaker table).
 * No in-memory state.
 * Atomic state transitions.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

const CONFIG = {
  failureThreshold: 5,
  timeoutRateThreshold: 0.15,
  openTimeoutMs: 5 * 60 * 1000,
  halfOpenMaxRequests: 3,
  successThreshold: 2,
};

/**
 * Check if circuit is open (used atomically during job claim)
 */
export async function isCircuitOpen(
  tx: any,
  provider: string
): Promise<boolean> {
  const circuit = await tx.circuitBreaker.findUnique({
    where: { provider },
  });
  
  if (!circuit || circuit.state === 'CLOSED') {
    return false;
  }
  
  if (circuit.state === 'OPEN') {
    // Check if timeout elapsed
    if (circuit.nextRetryTime && new Date() >= circuit.nextRetryTime) {
      // Transition to HALF_OPEN
      await tx.circuitBreaker.update({
        where: { provider },
        data: {
          state: 'HALF_OPEN',
          lastStateChange: new Date(),
          testRequestsAllowed: CONFIG.halfOpenMaxRequests,
          testRequestsUsed: 0,
          successCount: 0,
          failureCount: 0,
        },
      });
      return false; // Allow test request
    }
    return true; // Still OPEN
  }
  
  if (circuit.state === 'HALF_OPEN') {
    // Check if test requests remaining
    return circuit.testRequestsUsed >= circuit.testRequestsAllowed;
  }
  
  return false;
}

/**
 * Record circuit result (success/failure)
 */
export async function recordCircuitResult(
  provider: string,
  success: boolean
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const circuit = await tx.circuitBreaker.findUnique({
      where: { provider },
    });
    
    if (!circuit) {
      // Create initial
      await tx.circuitBreaker.create({
        data: {
          provider,
          state: success ? 'CLOSED' : 'CLOSED',
          successCount: success ? 1 : 0,
          failureCount: success ? 0 : 1,
          lastFailureTime: success ? null : new Date(),
        },
      });
      return;
    }
    
    if (success) {
      if (circuit.state === 'HALF_OPEN') {
        const newSuccess = circuit.successCount + 1;
        
        if (newSuccess >= CONFIG.successThreshold) {
          // Close circuit
          await tx.circuitBreaker.update({
            where: { provider },
            data: {
              state: 'CLOSED',
              failureCount: 0,
              successCount: 0,
              testRequestsUsed: 0,
              testRequestsAllowed: 0,
              reason: null,
            },
          });
        } else {
          await tx.circuitBreaker.update({
            where: { provider },
            data: {
              successCount: newSuccess,
              testRequestsUsed: circuit.testRequestsUsed + 1,
            },
          });
        }
      } else if (circuit.state === 'CLOSED') {
        await tx.circuitBreaker.update({
          where: { provider },
          data: {
            failureCount: 0,
            successCount: circuit.successCount + 1,
          },
        });
      }
    } else {
      if (circuit.state === 'CLOSED') {
        const newFailure = circuit.failureCount + 1;
        
        if (newFailure >= CONFIG.failureThreshold) {
          // Open circuit
          await tx.circuitBreaker.update({
            where: { provider },
            data: {
              state: 'OPEN',
              failureCount: newFailure,
              lastFailureTime: new Date(),
              lastStateChange: new Date(),
              nextRetryTime: new Date(Date.now() + CONFIG.openTimeoutMs),
              reason: `Failure threshold reached (${newFailure} failures)`,
            },
          });
        } else {
          await tx.circuitBreaker.update({
            where: { provider },
            data: {
              failureCount: newFailure,
              lastFailureTime: new Date(),
            },
          });
        }
      } else if (circuit.state === 'HALF_OPEN') {
        // Any failure in HALF_OPEN → back to OPEN
        await tx.circuitBreaker.update({
          where: { provider },
          data: {
            state: 'OPEN',
            failureCount: circuit.failureCount + 1,
            lastFailureTime: new Date(),
            lastStateChange: new Date(),
            nextRetryTime: new Date(Date.now() + CONFIG.openTimeoutMs * 2),
            reason: 'Test request failed',
          },
        });
      }
    }
  });
}

/**
 * Force open circuit (manual override)
 */
export async function forceOpenCircuit(
  provider: string,
  reason: string
): Promise<void> {
  await prisma.circuitBreaker.update({
    where: { provider },
    data: {
      state: 'OPEN',
      lastStateChange: new Date(),
      nextRetryTime: new Date(Date.now() + CONFIG.openTimeoutMs),
      reason: `MANUAL: ${reason}`,
    },
  });
}

/**
 * Force close circuit (manual override)
 */
export async function forceCloseCircuit(provider: string): Promise<void> {
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
}
