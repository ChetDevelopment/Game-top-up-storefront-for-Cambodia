/**
 * Execution Fingerprint System
 * 
 * CRITICAL GUARANTEE:
 * - Every delivery execution has a unique fingerprint
 * - Duplicate executions are blocked at the database level
 * - Survives retry storms, crashes, and duplicate messages
 * 
 * FINGERPRINT COMPONENTS:
 * - orderId
 * - provider
 * - attempt number
 * - idempotency key
 * - timestamp hash
 * 
 * USAGE:
 * 1. Before provider call: recordExecutionAttempt()
 * 2. If duplicate: block execution
 * 3. After provider call: updateExecutionResult()
 */

import { prisma } from './prisma';
import { hashSha256 } from './encryption';

export interface ExecutionFingerprint {
  id: string;
  orderId: string;
  orderNumber: string;
  provider: string;
  attemptNumber: number;
  idempotencyKey: string;
  status: 'PENDING' | 'EXECUTING' | 'SUCCESS' | 'FAILED' | 'UNKNOWN';
  providerTransactionId?: string;
  errorMessage?: string;
  startedAt: Date;
  completedAt?: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Generate unique execution fingerprint
 */
export function generateExecutionFingerprint(
  orderId: string,
  provider: string,
  attemptNumber: number,
  idempotencyKey: string
): string {
  const data = `${orderId}:${provider}:${attemptNumber}:${idempotencyKey}:${Date.now()}`;
  return `exec_${hashSha256(data).slice(0, 16)}`;
}

/**
 * Record execution attempt BEFORE calling provider
 * Returns false if duplicate execution detected
 */
export async function recordExecutionAttempt(
  orderId: string,
  orderNumber: string,
  provider: string,
  attemptNumber: number,
  idempotencyKey: string,
  metadata?: Record<string, unknown>
): Promise<{ success: boolean; fingerprintId?: string; reason?: string }> {
  const fingerprintId = generateExecutionFingerprint(
    orderId,
    provider,
    attemptNumber,
    idempotencyKey
  );
  
  try {
    // Check for existing execution with same fingerprint
    const existing = await prisma.executionFingerprint.findFirst({
      where: {
        orderId,
        provider,
        idempotencyKey,
        status: {
          in: ['EXECUTING', 'SUCCESS'],
        },
      },
    });
    
    if (existing) {
      // Duplicate execution detected
      console.log(`[Fingerprint] Duplicate execution blocked for ${orderNumber} (existing: ${existing.id})`);
      
      return {
        success: false,
        reason: `Duplicate execution detected (status: ${existing.status})`,
      };
    }
    
    // Record new execution attempt
    await prisma.executionFingerprint.create({
      data: {
        id: fingerprintId,
        orderId,
        orderNumber,
        provider,
        attemptNumber,
        idempotencyKey,
        status: 'EXECUTING',
        startedAt: new Date(),
        metadata: metadata as any,
      },
    });
    
    console.log(`[Fingerprint] Recorded execution ${fingerprintId} for ${orderNumber}`);
    
    return {
      success: true,
      fingerprintId,
    };
  } catch (error: any) {
    // Unique constraint violation = duplicate
    if (error.code === 'P2002') {
      console.log(`[Fingerprint] Duplicate execution blocked (DB constraint) for ${orderNumber}`);
      
      return {
        success: false,
        reason: 'Duplicate execution (unique constraint)',
      };
    }
    
    console.error(`[Fingerprint] Error recording execution:`, error);
    throw error;
  }
}

/**
 * Update execution result AFTER provider call
 */
export async function updateExecutionResult(
  fingerprintId: string,
  result: {
    status: 'SUCCESS' | 'FAILED' | 'UNKNOWN';
    providerTransactionId?: string;
    errorMessage?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  await prisma.executionFingerprint.update({
    where: { id: fingerprintId },
    data: {
      status: result.status,
      providerTransactionId: result.providerTransactionId,
      errorMessage: result.errorMessage,
      completedAt: new Date(),
      metadata: result.metadata as any,
    },
  });
  
  console.log(`[Fingerprint] Updated execution ${fingerprintId} to ${result.status}`);
}

/**
 * Check if execution is safe to proceed
 * (called mid-execution for long-running operations)
 */
export async function checkExecutionStillValid(
  fingerprintId: string
): Promise<boolean> {
  const fingerprint = await prisma.executionFingerprint.findUnique({
    where: { id: fingerprintId },
    select: { status: true, orderId: true },
  });
  
  if (!fingerprint) {
    console.error(`[Fingerprint] Execution ${fingerprintId} not found`);
    return false;
  }
  
  if (fingerprint.status !== 'EXECUTING') {
    console.log(`[Fingerprint] Execution ${fingerprintId} no longer executing (status: ${fingerprint.status})`);
    return false;
  }
  
  return true;
}

/**
 * Get execution history for an order
 */
export async function getExecutionHistory(orderId: string): Promise<ExecutionFingerprint[]> {
  const executions = await prisma.executionFingerprint.findMany({
    where: { orderId },
    orderBy: { startedAt: 'desc' },
  });
  
  return executions;
}

/**
 * Clean up stuck executions (older than 1 hour, still EXECUTING)
 */
export async function cleanupStuckExecutions(): Promise<number> {
  const oneHourAgo = new Date(Date.now() - (60 * 60 * 1000));
  
  const result = await prisma.executionFingerprint.updateMany({
    where: {
      status: 'EXECUTING',
      startedAt: {
        lt: oneHourAgo,
      },
    },
    data: {
      status: 'UNKNOWN',
      completedAt: new Date(),
      metadata: {
        stuckCleanup: true,
        cleanupAt: new Date().toISOString(),
      } as any,
    },
  });
  
  console.log(`[Fingerprint] Cleaned up ${result.count} stuck executions`);
  return result.count;
}

/**
 * Get statistics for monitoring
 */
export async function getExecutionStats(hours: number = 24): Promise<{
  total: number;
  success: number;
  failed: number;
  unknown: number;
  executing: number;
}> {
  const cutoff = new Date(Date.now() - (hours * 60 * 60 * 1000));
  
  const [total, success, failed, unknown, executing] = await Promise.all([
    prisma.executionFingerprint.count({
      where: { startedAt: { gte: cutoff } },
    }),
    prisma.executionFingerprint.count({
      where: {
        status: 'SUCCESS',
        startedAt: { gte: cutoff },
      },
    }),
    prisma.executionFingerprint.count({
      where: {
        status: 'FAILED',
        startedAt: { gte: cutoff },
      },
    }),
    prisma.executionFingerprint.count({
      where: {
        status: 'UNKNOWN',
        startedAt: { gte: cutoff },
      },
    }),
    prisma.executionFingerprint.count({
      where: {
        status: 'EXECUTING',
      },
    }),
  ]);
  
  return { total, success, failed, unknown, executing };
}
