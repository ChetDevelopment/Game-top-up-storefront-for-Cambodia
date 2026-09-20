/**
 * Comprehensive State Audit Log System
 * 
 * Tracks EVERY state change in the payment system for:
 * - Debugging
 * - Fraud detection
 * - Reconciliation
 * - Compliance
 * 
 * AUDIT LOG ENTRY:
 * - orderId
 * - previousState
 * - newState
 * - actor (API / worker / webhook / system)
 * - timestamp
 * - reason
 * - requestId (for tracing)
 * - metadata (additional context)
 */

import { prisma } from './prisma';

export type AuditActor = 'API' | 'WORKER' | 'WEBHOOK' | 'SYSTEM' | 'ADMIN';
export type AuditEventType = 
  | 'ORDER_CREATED'
  | 'PAYMENT_INITIATED'
  | 'PAYMENT_VERIFIED'
  | 'STATE_TRANSITION'
  | 'DELIVERY_STARTED'
  | 'DELIVERY_COMPLETED'
  | 'DELIVERY_FAILED'
  | 'LOCK_ACQUIRED'
  | 'LOCK_RELEASED'
  | 'IDEMPOTENCY_CHECK'
  | 'RETRY_SCHEDULED'
  | 'EXPIRATION_CHECK'
  | 'RECONCILIATION'
  | 'MANUAL_REVIEW'
  | 'ERROR';

export interface AuditLogEntry {
  orderId: string;
  orderNumber?: string;
  eventType: AuditEventType;
  actor: AuditActor;
  previousState?: string;
  newState?: string;
  reason?: string;
  requestId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Create an audit log entry
 * Always succeeds (fail-safe logging)
 */
export async function createAuditLog(entry: AuditLogEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        orderId: entry.orderId,
        action: entry.eventType,
        targetType: 'Order',
        targetId: entry.orderNumber || entry.orderId,
        details: JSON.stringify({
          previousState: entry.previousState,
          newState: entry.newState,
          actor: entry.actor,
          reason: entry.reason,
          requestId: entry.requestId,
          ...entry.metadata,
        }),
        ipAddress: entry.ipAddress,
        userAgent: entry.userAgent,
      },
    });
    
    console.log(`[Audit] Logged ${entry.eventType} for ${entry.orderNumber || entry.orderId}`);
  } catch (error) {
    // NEVER fail on audit log errors - log and continue
    console.error('[Audit] Failed to create audit log entry:', error);
  }
}

/**
 * Log order creation
 */
export async function logOrderCreation(
  orderId: string,
  orderNumber: string,
  metadata: {
    gameId: string;
    productId: string;
    amount: number;
    paymentMethod: string;
  },
  requestId?: string
): Promise<void> {
  await createAuditLog({
    orderId,
    orderNumber,
    eventType: 'ORDER_CREATED',
    actor: 'API',
    newState: 'PENDING',
    requestId,
    metadata,
  });
}

/**
 * Log payment initiation
 */
export async function logPaymentInitiation(
  orderId: string,
  orderNumber: string,
  metadata: {
    paymentRef: string;
    provider: string;
    qrGenerated: boolean;
  },
  requestId?: string
): Promise<void> {
  await createAuditLog({
    orderId,
    orderNumber,
    eventType: 'PAYMENT_INITIATED',
    actor: 'API',
    requestId,
    metadata,
  });
}

/**
 * Log state transition with full context
 */
export async function logStateTransition(
  orderId: string,
  orderNumber: string,
  fromState: string,
  toState: string,
  actor: AuditActor,
  reason: string,
  metadata?: Record<string, unknown>,
  requestId?: string
): Promise<void> {
  await createAuditLog({
    orderId,
    orderNumber,
    eventType: 'STATE_TRANSITION',
    actor,
    previousState: fromState,
    newState: toState,
    reason,
    requestId,
    metadata,
  });
}

/**
 * Log payment verification
 */
export async function logPaymentVerification(
  orderId: string,
  orderNumber: string,
  metadata: {
    verifiedBy: 'webhook' | 'polling' | 'worker';
    bakongTransactionId?: string;
    amount?: number;
    currency?: string;
  },
  requestId?: string
): Promise<void> {
  await createAuditLog({
    orderId,
    orderNumber,
    eventType: 'PAYMENT_VERIFIED',
    actor: 'WEBHOOK',
    newState: 'PAID',
    requestId,
    metadata,
  });
}

/**
 * Log delivery attempt
 */
export async function logDeliveryAttempt(
  orderId: string,
  orderNumber: string,
  metadata: {
    provider: string;
    attempt: number;
    status: 'SUCCESS' | 'FAILED' | 'RETRYING';
    transactionId?: string;
    errorMessage?: string;
  },
  requestId?: string
): Promise<void> {
  const eventType = metadata.status === 'SUCCESS' 
    ? 'DELIVERY_COMPLETED' 
    : metadata.status === 'FAILED' 
      ? 'DELIVERY_FAILED'
      : 'DELIVERY_STARTED';
  
  await createAuditLog({
    orderId,
    orderNumber,
    eventType,
    actor: 'WORKER',
    requestId,
    metadata,
  });
}

/**
 * Log lock acquisition/release
 */
export async function logLockEvent(
  orderId: string,
  orderNumber: string,
  eventType: 'LOCK_ACQUIRED' | 'LOCK_RELEASED',
  metadata: {
    workerId: string;
    resource: string;
  },
  requestId?: string
): Promise<void> {
  await createAuditLog({
    orderId,
    orderNumber,
    eventType,
    actor: 'WORKER',
    requestId,
    metadata,
  });
}

/**
 * Log idempotency check
 */
export async function logIdempotencyCheck(
  orderId: string,
  orderNumber: string,
  metadata: {
    idempotencyKey: string;
    isFirst: boolean;
    cachedResponse?: boolean;
  },
  requestId?: string
): Promise<void> {
  await createAuditLog({
    orderId,
    orderNumber,
    eventType: 'IDEMPOTENCY_CHECK',
    actor: 'API',
    requestId,
    metadata,
  });
}

/**
 * Log retry scheduling
 */
export async function logRetryScheduled(
  orderId: string,
  orderNumber: string,
  metadata: {
    attempt: number;
    delayMs: number;
    reason: string;
  },
  requestId?: string
): Promise<void> {
  await createAuditLog({
    orderId,
    orderNumber,
    eventType: 'RETRY_SCHEDULED',
    actor: 'WORKER',
    requestId,
    metadata,
  });
}

/**
 * Log reconciliation event
 */
export async function logReconciliation(
  orderId: string,
  orderNumber: string,
  metadata: {
    reason: string;
    previousState: string;
    newState: string;
    resolvedBy: string;
  },
  requestId?: string
): Promise<void> {
  await createAuditLog({
    orderId,
    orderNumber,
    eventType: 'RECONCILIATION',
    actor: 'SYSTEM',
    previousState: metadata.previousState,
    newState: metadata.newState,
    reason: metadata.reason,
    requestId,
    metadata: {
      resolvedBy: metadata.resolvedBy,
    },
  });
}

/**
 * Log error event
 */
export async function logError(
  orderId: string,
  orderNumber: string,
  metadata: {
    errorType: string;
    errorMessage: string;
    stack?: string;
    context: Record<string, unknown>;
  },
  requestId?: string
): Promise<void> {
  await createAuditLog({
    orderId,
    orderNumber,
    eventType: 'ERROR',
    actor: 'SYSTEM',
    reason: metadata.errorType,
    requestId,
    metadata,
  });
}

/**
 * Get audit trail for an order (for debugging)
 */
export async function getOrderAuditTrail(
  orderNumber: string,
  limit: number = 100
): Promise<any[]> {
  const logs = await prisma.auditLog.findMany({
    where: {
      targetId: orderNumber,
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: limit,
  });
  
  return logs.map((log) => ({
    timestamp: log.createdAt,
    action: log.action,
    actor: log.adminEmail || 'SYSTEM',
    details: log.details ? JSON.parse(log.details as string) : {},
  }));
}

/**
 * Search audit logs for debugging/investigation
 */
export async function searchAuditLogs(filters: {
  orderNumber?: string;
  eventType?: AuditEventType;
  actor?: AuditActor;
  fromDate?: Date;
  toDate?: Date;
}, limit: number = 100): Promise<any[]> {
  const where: any = {};
  
  if (filters.orderNumber) {
    where.targetId = filters.orderNumber;
  }
  
  if (filters.eventType) {
    where.action = filters.eventType;
  }
  
  if (filters.fromDate || filters.toDate) {
    where.createdAt = {};
    if (filters.fromDate) {
      where.createdAt.gte = filters.fromDate;
    }
    if (filters.toDate) {
      where.createdAt.lte = filters.toDate;
    }
  }
  
  const logs = await prisma.auditLog.findMany({
    where,
    orderBy: {
      createdAt: 'desc',
    },
    take: limit,
  });
  
  return logs;
}
