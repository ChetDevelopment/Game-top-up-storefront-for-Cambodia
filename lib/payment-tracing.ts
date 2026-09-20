/**
 * Payment Tracing System
 * 
 * Provides end-to-end payment lifecycle tracing for debugging and audit.
 * Every payment event is tracked with correlation ID.
 * 
 * WHY: Production incidents require:
 * - Complete payment lifecycle visibility
 * - Correlation across webhook → DB → delivery
 * - Audit trail for dispute resolution
 * - Fast root cause analysis
 */

import { prisma } from './prisma';

export interface PaymentTrace {
  traceId: string;
  orderId: string;
  orderNumber: string;
  events: PaymentTraceEvent[];
  currentStatus: string;
  isComplete: boolean;
  totalDurationMs: number;
}

export interface PaymentTraceEvent {
  timestamp: string;
  event: string;
  status: string;
  source: 'webhook' | 'polling' | 'cron' | 'worker' | 'api' | 'system';
  durationMs?: number;
  metadata?: Record<string, unknown>;
  error?: string;
}

/**
 * Generate unique trace ID for payment lifecycle
 */
export function generateTraceId(): string {
  return `trace_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Record payment trace event
 */
export async function recordPaymentTrace(
  orderId: string,
  event: PaymentTraceEvent
): Promise<void> {
  try {
    await prisma.paymentLog.create({
      data: {
        orderId,
        event: `TRACE_${event.event}`,
        status: event.status,
        provider: event.source.toUpperCase(),
        metadata: {
          traceEvent: event,
          timestamp: event.timestamp,
        },
      },
    });
  } catch (error) {
    console.error('[PaymentTrace] Failed to record trace event:', error);
  }
}

/**
 * Get complete payment trace for an order
 */
export async function getPaymentTrace(orderId: string): Promise<PaymentTrace | null> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      createdAt: true,
      paidAt: true,
      deliveredAt: true,
      deliveryStatus: true,
      paymentLogs: {
        orderBy: { createdAt: 'asc' },
        select: {
          event: true,
          status: true,
          provider: true,
          createdAt: true,
          metadata: true,
          responseMessage: true,
        },
      },
    },
  });

  if (!order) {
    return null;
  }

  // Build trace from payment logs
  const events: PaymentTraceEvent[] = order.paymentLogs.map(log => {
    const traceEvent = (log.metadata as any)?.traceEvent as PaymentTraceEvent | undefined;
    
    return {
      timestamp: log.createdAt.toISOString(),
      event: log.event,
      status: log.status,
      source: (log.provider?.toLowerCase() as any) || 'system',
      metadata: traceEvent?.metadata,
      error: log.responseMessage || undefined,
    };
  });

  // Add lifecycle events
  if (order.paidAt) {
    events.push({
      timestamp: order.paidAt.toISOString(),
      event: 'PAYMENT_CONFIRMED',
      status: 'PAID',
      source: 'system',
      durationMs: order.paidAt.getTime() - order.createdAt.getTime(),
    });
  }

  if (order.deliveredAt) {
    events.push({
      timestamp: order.deliveredAt.toISOString(),
      event: 'DELIVERY_COMPLETED',
      status: 'DELIVERED',
      source: 'system',
      durationMs: order.deliveredAt.getTime() - order.createdAt.getTime(),
    });
  }

  // Sort by timestamp
  events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  const totalDurationMs = order.deliveredAt
    ? order.deliveredAt.getTime() - order.createdAt.getTime()
    : order.paidAt
    ? order.paidAt.getTime() - order.createdAt.getTime()
    : Date.now() - order.createdAt.getTime();

  return {
    traceId: generateTraceId(),
    orderId: order.id,
    orderNumber: order.orderNumber,
    events,
    currentStatus: order.status,
    isComplete: order.status === 'DELIVERED' || order.status === 'FAILED',
    totalDurationMs,
  };
}

/**
 * Get payment traces for debugging (recent payments with issues)
 */
export async function getRecentPaymentTraces(
  options: {
    status?: string;
    limit?: number;
    hours?: number;
  } = {}
): Promise<PaymentTrace[]> {
  const {
    status,
    limit = 50,
    hours = 24,
  } = options;

  const where: any = {
    createdAt: {
      gte: new Date(Date.now() - hours * 60 * 60 * 1000),
    },
  };

  if (status) {
    where.status = status;
  }

  const orders = await prisma.order.findMany({
    where,
    select: {
      id: true,
      orderNumber: true,
      status: true,
      createdAt: true,
      paidAt: true,
      deliveredAt: true,
      paymentLogs: {
        orderBy: { createdAt: 'asc' },
        take: 20, // Limit logs per order
        select: {
          event: true,
          status: true,
          provider: true,
          createdAt: true,
          metadata: true,
          responseMessage: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return orders.map(order => {
    const events: PaymentTraceEvent[] = order.paymentLogs.map(log => ({
      timestamp: log.createdAt.toISOString(),
      event: log.event,
      status: log.status,
      source: (log.provider?.toLowerCase() as any) || 'system',
      metadata: (log.metadata as any)?.traceEvent,
      error: log.responseMessage || undefined,
    }));

    const totalDurationMs = order.deliveredAt
      ? order.deliveredAt.getTime() - order.createdAt.getTime()
      : order.paidAt
      ? order.paidAt.getTime() - order.createdAt.getTime()
      : Date.now() - order.createdAt.getTime();

    return {
      traceId: generateTraceId(),
      orderId: order.id,
      orderNumber: order.orderNumber,
      events,
      currentStatus: order.status,
      isComplete: order.status === 'DELIVERED' || order.status === 'FAILED',
      totalDurationMs,
    };
  });
}

/**
 * Analyze payment trace for issues
 */
export function analyzePaymentTrace(trace: PaymentTrace): {
  hasIssues: boolean;
  issues: string[];
  recommendations: string[];
} {
  const issues: string[] = [];
  const recommendations: string[] = [];

  // Check for missing events
  const hasWebhook = trace.events.some(e => e.source === 'webhook');
  const hasPaymentConfirmed = trace.events.some(e => e.event === 'PAYMENT_CONFIRMED' || e.status === 'PAID');
  const hasDelivery = trace.events.some(e => e.event === 'DELIVERY_COMPLETED' || e.status === 'DELIVERED');

  if (!hasWebhook && !hasPaymentConfirmed) {
    issues.push('No webhook received and payment not confirmed');
    recommendations.push('Check BAKONG webhook configuration');
    recommendations.push('Verify webhook URL is publicly accessible');
  }

  if (hasWebhook && !hasPaymentConfirmed) {
    issues.push('Webhook received but payment not confirmed');
    recommendations.push('Check webhook signature verification');
    recommendations.push('Verify Bakong API connectivity');
    recommendations.push('Check order MD5 matching logic');
  }

  if (hasPaymentConfirmed && !hasDelivery && trace.currentStatus === 'PAID') {
    issues.push('Payment confirmed but delivery not triggered');
    recommendations.push('Check delivery queue processing');
    recommendations.push('Verify provider API credentials');
  }

  // Check for errors
  const errorEvents = trace.events.filter(e => e.error);
  if (errorEvents.length > 0) {
    issues.push(`Found ${errorEvents.length} error events`);
    recommendations.push('Review error messages in trace');
  }

  // Check duration
  if (trace.totalDurationMs > 10 * 60 * 1000 && !trace.isComplete) {
    issues.push('Payment taking longer than 10 minutes');
    recommendations.push('Check for system bottlenecks');
    recommendations.push('Verify cron jobs are running');
  }

  return {
    hasIssues: issues.length > 0,
    issues,
    recommendations,
  };
}

/**
 * API endpoint helper: Get payment trace by order number
 */
export async function getPaymentTraceByOrderNumber(
  orderNumber: string
): Promise<PaymentTrace | null> {
  const order = await prisma.order.findUnique({
    where: { orderNumber },
    select: {
      id: true,
    },
  });

  if (!order) {
    return null;
  }

  return getPaymentTrace(order.id);
}
