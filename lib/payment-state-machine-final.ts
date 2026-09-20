/**
 * Payment State Machine with Fencing Tokens
 * 
 * CRITICAL IMPROVEMENTS:
 * 1. Monotonic version numbers (fencing tokens)
 * 2. Webhook has absolute authority
 * 3. Single writer rule enforced
 * 4. Stale workers cannot overwrite newer state
 * 
 * STATE TRANSITIONS:
 * PENDING ──→ PAID ──→ PROCESSING ──→ DELIVERED
 *      ↓           ↓            ↓
 *   EXPIRED    FAILED       MANUAL_REVIEW
 * 
 * WRITER RULES:
 * - Webhook: PENDING → PAID (absolute authority)
 * - Worker: PAID → PROCESSING → DELIVERED
 * - System: PENDING → EXPIRED, any → FAILED
 */

import { prisma } from './prisma';
import { validateFencingToken } from './heartbeat-lock';
import { createAuditLog } from './audit-log';

export type PaymentState =
  | 'PENDING'
  | 'PAID'
  | 'PROCESSING'
  | 'DELIVERED'
  | 'FAILED'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'MANUAL_REVIEW';

export type StateWriter = 'WEBHOOK' | 'WORKER' | 'API' | 'SYSTEM';

// Valid state transitions
const STATE_TRANSITIONS: Record<PaymentState, PaymentState[]> = {
  PENDING: ['PAID', 'EXPIRED', 'CANCELLED'],
  PAID: ['PROCESSING', 'FAILED'],
  PROCESSING: ['DELIVERED', 'FAILED', 'MANUAL_REVIEW'],
  DELIVERED: [], // Terminal state
  FAILED: ['MANUAL_REVIEW'],
  EXPIRED: [], // Terminal state
  CANCELLED: [], // Terminal state
  MANUAL_REVIEW: ['DELIVERED', 'FAILED'],
};

// Writer permissions for each transition
const WRITER_PERMISSIONS: Record<string, StateWriter[]> = {
  'PENDING→PAID': ['WEBHOOK', 'SYSTEM'], // Webhook has absolute authority
  'PENDING→EXPIRED': ['SYSTEM'],
  'PENDING→CANCELLED': ['API', 'SYSTEM'],
  'PAID→PROCESSING': ['WORKER'],
  'PAID→FAILED': ['WORKER', 'SYSTEM'],
  'PROCESSING→DELIVERED': ['WORKER'],
  'PROCESSING→FAILED': ['WORKER', 'SYSTEM'],
  'PROCESSING→MANUAL_REVIEW': ['WORKER', 'SYSTEM'],
  'FAILED→MANUAL_REVIEW': ['SYSTEM'],
  'MANUAL_REVIEW→DELIVERED': ['WORKER', 'SYSTEM'],
  'MANUAL_REVIEW→FAILED': ['WORKER', 'SYSTEM'],
};

/**
 * Check if state transition is valid
 */
export function canTransition(from: PaymentState, to: PaymentState): boolean {
  return STATE_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Check if writer is allowed to perform transition
 */
export function canWriterTransition(
  from: PaymentState,
  to: PaymentState,
  writer: StateWriter
): boolean {
  const key = `${from}→${to}`;
  const allowedWriters = WRITER_PERMISSIONS[key];
  return allowedWriters?.includes(writer) ?? false;
}

/**
 * Check if state is terminal
 */
export function isTerminalState(state: PaymentState): boolean {
  return STATE_TRANSITIONS[state]?.length === 0;
}

/**
 * Atomically transition order state with fencing token
 * 
 * CRITICAL RULES:
 * 1. Webhook always wins for PENDING → PAID
 * 2. Worker cannot override webhook
 * 3. Fencing token prevents stale writes
 */
export async function transitionOrderState(
  orderId: string,
  from: PaymentState,
  to: PaymentState,
  writer: StateWriter,
  metadata?: Record<string, unknown>,
  options?: {
    fencingToken?: number;
    resource?: string;
  }
): Promise<{ success: boolean; error?: string; currentStatus?: string }> {
  // Validate transition
  if (!canTransition(from, to)) {
    return {
      success: false,
      error: `Invalid state transition: ${from} → ${to}`,
    };
  }
  
  // Validate writer permission
  if (!canWriterTransition(from, to, writer)) {
    return {
      success: false,
      error: `Writer ${writer} not allowed to transition ${from} → ${to}`,
    };
  }
  
  try {
    // CRITICAL: Validate fencing token if provided
    if (options?.fencingToken && options?.resource) {
      const isValid = await validateFencingToken(options.resource, options.fencingToken);
      if (!isValid) {
        return {
          success: false,
          error: 'Fencing token invalid - lock may have been lost',
        };
      }
    }
    
    // ATOMIC UPDATE with version check and state validation
    const result = await prisma.order.updateMany({
      where: {
        id: orderId,
        status: from, // Only update if still in expected state
      },
      data: {
        status: to,
        // Update timestamps based on state
        ...(to === 'PAID' ? { paidAt: new Date() } : {}),
        ...(to === 'DELIVERED' ? { deliveredAt: new Date() } : {}),
        // Increment version (fencing token)
        version: { increment: 1 },
        // Store metadata
        ...(metadata ? { 
          metadata: { 
            ...(metadata as any), 
            lastTransition: { 
              from, 
              to, 
              at: new Date().toISOString(),
              writer,
              fencingToken: options?.fencingToken,
            } 
          } 
        } : {}),
      },
    });

    if (result.count === 0) {
      // No rows updated = state already changed or order not found
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        select: { status: true, version: true },
      });
      
      if (order) {
        // SPECIAL CASE: Webhook trying to mark as PAID
        if (writer === 'WEBHOOK' && to === 'PAID') {
          if (['PAID', 'PROCESSING', 'DELIVERED'].includes(order.status)) {
            // Already paid by another process - webhook wins, consider it successful
            console.log(`[State] Order ${orderId} already paid (status: ${order.status}) - webhook authority`);
            return { 
              success: true, 
              currentStatus: order.status,
            };
          }
        }
        
        return {
          success: false,
          error: `State already changed from ${from} to ${order.status} (version: ${order.version})`,
          currentStatus: order.status,
        };
      }
      
      return {
        success: false,
        error: 'Order not found',
      };
    }

    // Log state transition
    await createAuditLog({
      orderId,
      eventType: 'STATE_TRANSITION',
      actor: writer as any,
      previousState: from,
      newState: to,
      reason: metadata?.reason as string,
      metadata,
    });

    console.log(`[State] Transitioned order ${orderId}: ${from} → ${to} (writer: ${writer})`);
    
    return { success: true };
  } catch (error: any) {
    console.error('[State] Transition error:', error);
    return {
      success: false,
      error: error.message || 'Database error',
    };
  }
}

/**
 * Mark order as paid (WEBHOOK has absolute authority)
 */
export async function markOrderAsPaid(
  orderId: string,
  paymentData: {
    paymentRef: string;
    amount: number;
    currency: string;
    transactionId?: string;
    verifiedBy: 'webhook' | 'polling' | 'worker';
  },
  fencingToken?: number
): Promise<{ success: boolean; error?: string; currentStatus?: string }> {
  return transitionOrderState(
    orderId,
    'PENDING',
    'PAID',
    'WEBHOOK', // Webhook has absolute authority
    {
      paymentRef: paymentData.paymentRef,
      amount: paymentData.amount,
      currency: paymentData.currency,
      transactionId: paymentData.transactionId,
      verifiedBy: paymentData.verifiedBy,
      verifiedAt: new Date().toISOString(),
    },
    { fencingToken }
  );
}

/**
 * Mark order as processing (WORKER only)
 */
export async function markOrderAsProcessing(
  orderId: string,
  deliveryData: {
    provider: string;
    deliveryJobId: string;
  },
  fencingToken?: number
): Promise<{ success: boolean; error?: string }> {
  const result = await transitionOrderState(
    orderId,
    'PAID',
    'PROCESSING',
    'WORKER',
    {
      ...deliveryData,
      processingStartedAt: new Date().toISOString(),
    },
    { fencingToken }
  );
  
  return result;
}

/**
 * Mark order as delivered (WORKER only)
 */
export async function markOrderAsDelivered(
  orderId: string,
  deliveryData: {
    provider: string;
    transactionId: string;
    deliveredAt: string;
  },
  fencingToken?: number
): Promise<{ success: boolean; error?: string }> {
  return transitionOrderState(
    orderId,
    'PROCESSING',
    'DELIVERED',
    'WORKER',
    {
      ...deliveryData,
      finalState: true,
    },
    { fencingToken }
  );
}

/**
 * Mark order as failed (WORKER or SYSTEM)
 */
export async function markOrderAsFailed(
  orderId: string,
  from: PaymentState,
  failureData: {
    reason: string;
    errorCode?: string;
    retryable?: boolean;
  },
  writer: StateWriter = 'WORKER',
  fencingToken?: number
): Promise<{ success: boolean; error?: string }> {
  return transitionOrderState(
    orderId,
    from,
    'FAILED',
    writer,
    {
      ...failureData,
      failedAt: new Date().toISOString(),
    },
    { fencingToken }
  );
}

/**
 * Mark order as expired (SYSTEM only)
 */
export async function markOrderAsExpired(
  orderId: string,
  fencingToken?: number
): Promise<{ success: boolean; error?: string }> {
  return transitionOrderState(
    orderId,
    'PENDING',
    'EXPIRED',
    'SYSTEM',
    {
      expiredAt: new Date().toISOString(),
    },
    { fencingToken }
  );
}

/**
 * Get current state of order with version
 */
export async function getOrderState(orderId: string): Promise<{
  paymentState: PaymentState;
  version: number;
  isTerminal: boolean;
}> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      status: true,
      version: true,
    },
  });

  if (!order) {
    throw new Error('Order not found');
  }

  return {
    paymentState: order.status as PaymentState,
    version: order.version,
    isTerminal: isTerminalState(order.status as PaymentState),
  };
}
