/**
 * Payment Analytics System
 * 
 * Tracks payment metrics for monitoring, dashboards, and business intelligence.
 * Minimal DB overhead - uses aggregation and sampling.
 * 
 * WHY: Production payment systems need:
 * - Success rate monitoring
 * - Latency tracking
 * - Provider performance comparison
 * - Anomaly detection
 * - Revenue analytics
 */

import { prisma } from './prisma';

export interface PaymentMetrics {
  period: '1h' | '24h' | '7d' | '30d';
  totalPayments: number;
  successfulPayments: number;
  failedPayments: number;
  pendingPayments: number;
  successRate: number;
  averageConfirmationTimeMs: number;
  totalRevenue: {
    usd: number;
    khr: number;
  };
  revenueByProvider: Record<string, number>;
  webhookSuccessRate: number;
  duplicateWebhookAttempts: number;
  averageDeliveryTimeMs: number;
  deliverySuccessRate: number;
  retryStatistics: {
    totalRetries: number;
    successfulRetries: number;
    failedAfterRetries: number;
  };
}

export interface ProviderLatencyMetrics {
  provider: string;
  averageLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  successRate: number;
  timeoutRate: number;
  conflictRate: number;
}

/**
 * Get payment metrics for a time period
 */
export async function getPaymentMetrics(
  period: '1h' | '24h' | '7d' | '30d' = '24h'
): Promise<PaymentMetrics> {
  const now = new Date();
  const startTime = getPeriodStart(period);
  
  // Get order counts by status
  const [total, successful, failed, pending] = await Promise.all([
    prisma.order.count({
      where: {
        createdAt: { gte: startTime },
      },
    }),
    prisma.order.count({
      where: {
        createdAt: { gte: startTime },
        status: { in: ['PAID', 'QUEUED', 'DELIVERING', 'DELIVERED'] },
      },
    }),
    prisma.order.count({
      where: {
        createdAt: { gte: startTime },
        status: { in: ['FAILED', 'FAILED_FINAL', 'CANCELLED'] },
      },
    }),
    prisma.order.count({
      where: {
        createdAt: { gte: startTime },
        status: 'PENDING',
      },
    }),
  ]);
  
  // Calculate success rate
  const successRate = total > 0 ? (successful / total) * 100 : 0;
  
  // Get revenue by currency
  const revenue = await prisma.order.aggregate({
    _sum: {
      amountUsd: true,
      amountKhr: true,
    },
    where: {
      createdAt: { gte: startTime },
      status: { in: ['PAID', 'QUEUED', 'DELIVERING', 'DELIVERED'] },
    },
  });
  
  // Get revenue by provider
  const revenueByProvider: Record<string, number> = {};
  const providerRevenue = await prisma.order.groupBy({
    by: ['paymentMethod'],
    _sum: {
      amountUsd: true,
    },
    where: {
      createdAt: { gte: startTime },
      status: { in: ['PAID', 'QUEUED', 'DELIVERING', 'DELIVERED'] },
    },
  });
  
  providerRevenue.forEach(row => {
    revenueByProvider[row.paymentMethod] = row._sum.amountUsd || 0;
  });
  
  // Calculate average confirmation time (paidAt - createdAt)
  const confirmationTimes = await prisma.order.findMany({
    where: {
      createdAt: { gte: startTime },
      paidAt: { not: null },
      status: { in: ['PAID', 'QUEUED', 'DELIVERING', 'DELIVERED'] },
    },
    select: {
      createdAt: true,
      paidAt: true,
    },
    take: 1000, // Sample for performance
  });
  
  const avgConfirmationTime = confirmationTimes.length > 0
    ? confirmationTimes.reduce((acc, order) => {
        const diff = (order.paidAt!.getTime() - order.createdAt.getTime());
        return acc + diff;
      }, 0) / confirmationTimes.length
    : 0;
  
  // Get webhook statistics
  const webhookLogs = await prisma.paymentLog.count({
    where: {
      createdAt: { gte: startTime },
      event: 'WEBHOOK_PROCESSED',
    },
  });
  
  const webhookSuccessLogs = await prisma.paymentLog.count({
    where: {
      createdAt: { gte: startTime },
      event: 'WEBHOOK_PROCESSED',
      status: 'PAID',
    },
  });
  
  const webhookSuccessRate = webhookLogs > 0 ? (webhookSuccessLogs / webhookLogs) * 100 : 0;
  
  // Count duplicate webhook attempts (replay protection triggers)
  const duplicateWebhooks = await prisma.paymentLog.count({
    where: {
      createdAt: { gte: startTime },
      event: 'WEBHOOK_PROCESSED',
      responseMessage: { contains: 'already_processed' },
    },
  });
  
  // Get delivery statistics
  const deliveryJobs = await prisma.deliveryJob.findMany({
    where: {
      createdAt: { gte: startTime },
    },
    select: {
      status: true,
      attempt: true,
      createdAt: true,
      completedAt: true,
    },
    take: 1000,
  });
  
  const deliverySuccess = deliveryJobs.filter(j => j.status === 'SUCCESS').length;
  const deliverySuccessRate = deliveryJobs.length > 0
    ? (deliverySuccess / deliveryJobs.length) * 100
    : 0;
  
  const avgDeliveryTime = deliveryJobs.filter(j => j.completedAt && j.createdAt).length > 0
    ? deliveryJobs
        .filter(j => j.completedAt && j.createdAt)
        .reduce((acc, job) => {
          return acc + (job.completedAt!.getTime() - job.createdAt.getTime());
        }, 0) / deliveryJobs.filter(j => j.completedAt && j.createdAt).length
    : 0;
  
  // Get retry statistics
  const retryStats = await prisma.deliveryJob.aggregate({
    _sum: { attempt: true },
    _count: true,
    where: {
      createdAt: { gte: startTime },
      attempt: { gt: 0 },
    },
  });
  
  const successfulRetries = await prisma.deliveryJob.count({
    where: {
      createdAt: { gte: startTime },
      attempt: { gt: 0 },
      status: 'SUCCESS',
    },
  });
  
  const failedAfterRetries = await prisma.deliveryJob.count({
    where: {
      createdAt: { gte: startTime },
      attempt: { gte: 3 }, // Failed after max retries
      status: { in: ['FAILED', 'FAILED_FINAL'] },
    },
  });
  
  return {
    period,
    totalPayments: total,
    successfulPayments: successful,
    failedPayments: failed,
    pendingPayments: pending,
    successRate: Math.round(successRate * 100) / 100,
    averageConfirmationTimeMs: Math.round(avgConfirmationTime),
    totalRevenue: {
      usd: revenue._sum.amountUsd || 0,
      khr: revenue._sum.amountKhr || 0,
    },
    revenueByProvider,
    webhookSuccessRate: Math.round(webhookSuccessRate * 100) / 100,
    duplicateWebhookAttempts: duplicateWebhooks,
    averageDeliveryTimeMs: Math.round(avgDeliveryTime),
    deliverySuccessRate: Math.round(deliverySuccessRate * 100) / 100,
    retryStatistics: {
      totalRetries: retryStats._sum.attempt || 0,
      successfulRetries,
      failedAfterRetries,
    },
  };
}

/**
 * Get provider latency metrics
 */
export async function getProviderLatencyMetrics(
  provider: string,
  period: '1h' | '24h' | '7d' | '30d' = '24h'
): Promise<ProviderLatencyMetrics> {
  const startTime = getPeriodStart(period);
  
  // Get provider health metrics
  const healthMetrics = await prisma.providerHealthMetric.findMany({
    where: {
      provider,
      timestamp: { gte: startTime },
    },
    select: {
      success: true,
      timeout: true,
      conflict: true,
      latencyMs: true,
    },
    orderBy: { timestamp: 'desc' },
    take: 10000,
  });
  
  if (healthMetrics.length === 0) {
    return {
      provider,
      averageLatencyMs: 0,
      p50LatencyMs: 0,
      p95LatencyMs: 0,
      p99LatencyMs: 0,
      successRate: 0,
      timeoutRate: 0,
      conflictRate: 0,
    };
  }
  
  // Calculate latency percentiles
  const latencies = healthMetrics.map(m => m.latencyMs).sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.5)];
  const p95 = latencies[Math.floor(latencies.length * 0.95)];
  const p99 = latencies[Math.floor(latencies.length * 0.99)];
  const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  
  // Calculate rates
  const total = healthMetrics.length;
  const successes = healthMetrics.filter(m => m.success).length;
  const timeouts = healthMetrics.filter(m => m.timeout).length;
  const conflicts = healthMetrics.filter(m => m.conflict).length;
  
  return {
    provider,
    averageLatencyMs: Math.round(avgLatency),
    p50LatencyMs: p50 || 0,
    p95LatencyMs: p95 || 0,
    p99LatencyMs: p99 || 0,
    successRate: Math.round((successes / total) * 100 * 100) / 100,
    timeoutRate: Math.round((timeouts / total) * 100 * 100) / 100,
    conflictRate: Math.round((conflicts / total) * 100 * 100) / 100,
  };
}

/**
 * Get period start date
 */
function getPeriodStart(period: string): Date {
  const now = new Date();
  
  switch (period) {
    case '1h':
      return new Date(now.getTime() - 60 * 60 * 1000);
    case '24h':
      return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    case '7d':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case '30d':
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    default:
      return new Date(now.getTime() - 24 * 60 * 60 * 1000);
  }
}

/**
 * Track payment event for analytics
 */
export async function trackPaymentEvent(
  eventType: 'PAYMENT_INITIATED' | 'PAYMENT_CONFIRMED' | 'PAYMENT_FAILED' | 'DELIVERY_COMPLETED' | 'DELIVERY_FAILED',
  data: {
    orderId: string;
    orderNumber: string;
    provider: string;
    amount: number;
    currency: string;
    durationMs?: number;
    attempt?: number;
    error?: string;
  }
): Promise<void> {
  try {
    await prisma.paymentLog.create({
      data: {
        orderId: data.orderId,
        event: eventType,
        status: eventType.includes('FAILED') ? 'FAILED' : 'SUCCESS',
        provider: data.provider,
        amount: data.amount,
        currency: data.currency,
        metadata: {
          orderNumber: data.orderNumber,
          durationMs: data.durationMs,
          attempt: data.attempt,
          error: data.error,
        },
      },
    });
  } catch (error) {
    console.error('[Analytics] Failed to track event:', error);
  }
}

/**
 * Get real-time payment dashboard data
 */
export async function getPaymentDashboard(): Promise<{
  metrics24h: PaymentMetrics;
  topProviders: ProviderLatencyMetrics[];
  recentActivity: Array<{
    orderNumber: string;
    status: string;
    amount: number;
    currency: string;
    createdAt: string;
  }>;
}> {
  const [metrics24h, gamedropLatency, bakongLatency] = await Promise.all([
    getPaymentMetrics('24h'),
    getProviderLatencyMetrics('GAMEDROP', '24h'),
    getProviderLatencyMetrics('BAKONG', '24h'),
  ]);
  
  const recentActivity = await prisma.order.findMany({
    where: {
      createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) }, // Last hour
    },
    select: {
      orderNumber: true,
      status: true,
      amountUsd: true,
      currency: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  
  return {
    metrics24h,
    topProviders: [gamedropLatency, bakongLatency].filter(p => p.averageLatencyMs > 0),
    recentActivity: recentActivity.map(a => ({
      orderNumber: a.orderNumber,
      status: a.status,
      amount: a.currency === 'KHR' ? a.amountUsd * 4100 : a.amountUsd,
      currency: a.currency,
      createdAt: a.createdAt.toISOString(),
    })),
  };
}
