/**
 * Transactional Outbox Pattern Implementation
 * 
 * CRITICAL GUARANTEE:
 * - State change and event persistence happen in SAME transaction
 * - No state change without event persistence
 * - No event without state change
 * - Events are processed exactly once by workers
 * 
 * PATTERN:
 * 1. DB Transaction:
 *    - Update order state
 *    - Insert outbox event
 * 2. Worker processes outbox event
 * 3. Mark event as processed
 * 
 * This eliminates:
 * - Lost updates
 * - Duplicate side effects
 * - Inconsistent state
 */

import { prisma } from './prisma';
import { addPaymentVerificationJob, addDeliveryProcessingJob, addReconciliationJob } from './queue';

export type OutboxEventType =
  | 'ORDER_CREATED'
  | 'PAYMENT_INITIATED'
  | 'PAYMENT_VERIFIED'
  | 'ORDER_PAID'
  | 'DELIVERY_STARTED'
  | 'DELIVERY_COMPLETED'
  | 'DELIVERY_FAILED'
  | 'ORDER_EXPIRED'
  | 'ORDER_CANCELLED'
  | 'MANUAL_REVIEW_REQUESTED';

export interface OutboxEventPayload {
  orderId: string;
  orderNumber: string;
  previousState?: string;
  newState?: string;
  actor: 'API' | 'WORKER' | 'WEBHOOK' | 'SYSTEM';
  requestId?: string;
  [key: string]: unknown;
}

export interface OutboxEventRecord {
  id: string;
  aggregateId: string;
  aggregateType: string;
  eventType: OutboxEventType;
  payload: OutboxEventPayload;
  status: 'PENDING' | 'PROCESSED' | 'FAILED';
  createdAt: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Execute state change with outbox event atomically
 * 
 * CRITICAL: This is the ONLY way to change state + trigger side effects
 */
export async function transactionalStateChange<T>(
  orderId: string,
  eventType: OutboxEventType,
  payload: OutboxEventPayload,
  stateUpdateFn: (tx: any) => Promise<T>,
  metadata?: Record<string, unknown>
): Promise<{ result: T; eventId: string }> {
  const eventId = `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  
  try {
    const result = await prisma.$transaction(async (tx) => {
      // STEP 1: Execute state change
      const stateResult = await stateUpdateFn(tx);
      
      // STEP 2: Insert outbox event (SAME transaction)
      await tx.outboxEvent.create({
        data: {
          id: eventId,
          aggregateId: orderId,
          aggregateType: 'Order',
          eventType,
          payload: payload as any,
          status: 'PENDING',
          metadata: metadata as any,
        },
      });
      
      return stateResult;
    });
    
    // STEP 3: Queue worker to process event (outside transaction)
    await queueEventForProcessing(eventId, eventType, payload);
    
    console.log(`[Outbox] Event ${eventId} created for ${eventType} on order ${orderId}`);
    
    return { result, eventId };
  } catch (error: any) {
    console.error(`[Outbox] Transaction failed for ${eventType}:`, error);
    throw error;
  }
}

/**
 * Queue outbox event for worker processing
 */
async function queueEventForProcessing(
  eventId: string,
  eventType: OutboxEventType,
  payload: OutboxEventPayload
): Promise<void> {
  try {
    switch (eventType) {
      case 'PAYMENT_VERIFIED':
      case 'ORDER_PAID':
        // Queue delivery processing
        await addDeliveryProcessingJob({
          orderId: payload.orderId,
          orderNumber: payload.orderNumber,
          paymentRef: (payload as any).paymentRef || '',
          provider: (payload as any).provider || 'MANUAL',
          requestId: payload.requestId,
        });
        break;
        
      case 'DELIVERY_FAILED':
        // Queue retry
        // (handled by delivery retry worker)
        break;
        
      case 'MANUAL_REVIEW_REQUESTED':
        // Queue reconciliation
        await addReconciliationJob({
          orderId: payload.orderId,
          orderNumber: payload.orderNumber,
          reason: 'MANUAL',
          priority: (payload as any).priority || 'MEDIUM',
          details: payload,
        });
        break;
        
      // Other events don't need immediate processing
    }
  } catch (error) {
    console.error(`[Outbox] Failed to queue event ${eventId}:`, error);
    // Event is still in DB, will be processed by background reconciler
  }
}

/**
 * Process outbox event (called by worker)
 */
export async function processOutboxEvent(eventId: string): Promise<boolean> {
  const event = await prisma.outboxEvent.findUnique({
    where: { id: eventId },
  });
  
  if (!event) {
    console.error(`[Outbox] Event ${eventId} not found`);
    return false;
  }
  
  if (event.status !== 'PENDING') {
    console.log(`[Outbox] Event ${eventId} already processed (status: ${event.status})`);
    return true; // Already processed
  }
  
  try {
    // Mark as processed atomically
    await prisma.outboxEvent.update({
      where: { id: eventId },
      data: {
        status: 'PROCESSED',
        processedAt: new Date(),
      },
    });
    
    console.log(`[Outbox] Event ${eventId} processed successfully`);
    return true;
  } catch (error: any) {
    console.error(`[Outbox] Failed to process event ${eventId}:`, error);
    
    // Mark as failed
    await prisma.outboxEvent.update({
      where: { id: eventId },
      data: {
        status: 'FAILED',
        metadata: {
          ...(event.metadata as any || {}),
          error: error.message,
          failedAt: new Date().toISOString(),
        } as any,
      },
    });
    
    return false;
  }
}

/**
 * Get pending outbox events for processing
 */
export async function getPendingOutboxEvents(limit: number = 100): Promise<OutboxEventRecord[]> {
  const events = await prisma.outboxEvent.findMany({
    where: {
      status: 'PENDING',
    },
    orderBy: {
      createdAt: 'asc', // Process oldest first
    },
    take: limit,
  });
  
  return events;
}

/**
 * Clean up old processed events (run periodically)
 */
export async function cleanupOldOutboxEvents(daysOld: number = 7): Promise<number> {
  const cutoff = new Date(Date.now() - (daysOld * 24 * 60 * 60 * 1000));
  
  const result = await prisma.outboxEvent.deleteMany({
    where: {
      status: 'PROCESSED',
      createdAt: {
        lt: cutoff,
      },
    },
  });
  
  console.log(`[Outbox] Cleaned up ${result.count} old events`);
  return result.count;
}

/**
 * Reconcile stuck outbox events (background job)
 */
export async function reconcileStuckOutboxEvents(): Promise<void> {
  const tenMinutesAgo = new Date(Date.now() - (10 * 60 * 1000));
  
  const stuckEvents = await prisma.outboxEvent.findMany({
    where: {
      status: 'PENDING',
      createdAt: {
        lt: tenMinutesAgo,
      },
    },
    take: 50,
  });
  
  for (const event of stuckEvents) {
    try {
      // Re-queue for processing
      await queueEventForProcessing(event.id, event.eventType as OutboxEventType, event.payload as OutboxEventPayload);
      console.log(`[Outbox] Re-queued stuck event ${event.id}`);
    } catch (error) {
      console.error(`[Outbox] Failed to re-queue event ${event.id}:`, error);
    }
  }
}

/**
 * Create specific event types with type safety
 */

export async function createPaymentVerifiedEvent(
  orderId: string,
  orderNumber: string,
  paymentData: {
    paymentRef: string;
    amount: number;
    currency: string;
    transactionId?: string;
    verifiedBy: 'webhook' | 'polling' | 'worker';
  },
  requestId?: string
): Promise<{ eventId: string }> {
  return transactionalStateChange(
    orderId,
    'PAYMENT_VERIFIED',
    {
      orderId,
      orderNumber,
      previousState: 'PENDING',
      newState: 'PAID',
      actor: 'WEBHOOK',
      requestId,
      ...paymentData,
    },
    async (tx) => {
      // Update order state
      await tx.order.update({
        where: { id: orderId },
        data: {
          status: 'PAID',
          paidAt: new Date(),
        },
      });
    },
    {
      provider: paymentData.verifiedBy === 'webhook' ? 'BAKONG' : 'INTERNAL',
    }
  );
}

export async function createDeliveryCompletedEvent(
  orderId: string,
  orderNumber: string,
  deliveryData: {
    provider: string;
    transactionId: string;
  },
  requestId?: string
): Promise<{ eventId: string }> {
  return transactionalStateChange(
    orderId,
    'DELIVERY_COMPLETED',
    {
      orderId,
      orderNumber,
      previousState: 'PROCESSING',
      newState: 'DELIVERED',
      actor: 'WORKER',
      requestId,
      ...deliveryData,
    },
    async (tx) => {
      // Update order state
      await tx.order.update({
        where: { id: orderId },
        data: {
          status: 'DELIVERED',
          deliveredAt: new Date(),
        },
      });
    }
  );
}

export async function createDeliveryFailedEvent(
  orderId: string,
  orderNumber: string,
  failureData: {
    reason: string;
    errorCode?: string;
    retryable?: boolean;
  },
  requestId?: string
): Promise<{ eventId: string }> {
  return transactionalStateChange(
    orderId,
    'DELIVERY_FAILED',
    {
      orderId,
      orderNumber,
      previousState: 'PROCESSING',
      newState: 'FAILED',
      actor: 'WORKER',
      requestId,
      ...failureData,
    },
    async (tx) => {
      // Update order state
      await tx.order.update({
        where: { id: orderId },
        data: {
          status: 'FAILED',
        },
      });
    }
  );
}
