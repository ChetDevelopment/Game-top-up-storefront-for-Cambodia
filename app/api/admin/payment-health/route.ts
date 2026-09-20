import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isRedisConfigured } from '@/lib/redis';
import { getPaymentMetrics } from '@/lib/payment-analytics';
import { getWebhookCacheStats } from '@/lib/webhook-cache';
import { getCircuitBreakerDashboard } from '@/lib/circuit-breaker';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/payment-health
 * 
 * Comprehensive payment system health check.
 * Monitors all critical components for reliability.
 */
export async function GET(req: NextRequest) {
  const checks: {
    component: string;
    status: 'healthy' | 'degraded' | 'unhealthy';
    details: Record<string, any>;
    issues: string[];
  }[] = [];

  const issues: string[] = [];

  // 1. Database Health
  try {
    const dbCheck = await prisma.$queryRaw`SELECT 1`;
    const pendingOrders = await prisma.order.count({
      where: { status: 'PENDING' },
    });
    const stuckPaidOrders = await prisma.order.count({
      where: {
        status: 'PAID',
        deliveryStatus: { in: [null, 'PENDING'] },
        paidAt: {
          lt: new Date(Date.now() - 10 * 60 * 1000), // Paid more than 10 min ago
        },
      },
    });

    checks.push({
      component: 'Database',
      status: stuckPaidOrders > 10 ? 'degraded' : 'healthy',
      details: {
        pendingOrders,
        stuckPaidOrders,
        connection: 'ok',
      },
      issues: stuckPaidOrders > 10 ? [`${stuckPaidOrders} orders stuck in PAID status`] : [],
    });

    if (stuckPaidOrders > 10) {
      issues.push(`Database: ${stuckPaidOrders} orders stuck in PAID status`);
    }
  } catch (error: any) {
    checks.push({
      component: 'Database',
      status: 'unhealthy',
      details: { error: error.message },
      issues: ['Database connection failed'],
    });
    issues.push('Database: Connection failed');
  }

  // 2. Redis Health
  try {
    const redisConfigured = isRedisConfigured();
    const webhookCacheStats = await getWebhookCacheStats();

    checks.push({
      component: 'Redis',
      status: redisConfigured ? 'healthy' : 'degraded',
      details: {
        configured: redisConfigured,
        webhookCacheEntries: webhookCacheStats.totalEntries,
      },
      issues: redisConfigured ? [] : ['Redis not configured - replay protection disabled'],
    });

    if (!redisConfigured) {
      issues.push('Redis: Not configured - replay protection disabled');
    }
  } catch (error: any) {
    checks.push({
      component: 'Redis',
      status: 'degraded',
      details: { error: error.message },
      issues: ['Redis connection failed'],
    });
    issues.push('Redis: Connection failed');
  }

  // 3. Webhook Health
  try {
    const recentWebhooks = await prisma.paymentLog.count({
      where: {
        event: 'WEBHOOK_PROCESSED',
        createdAt: {
          gte: new Date(Date.now() - 60 * 60 * 1000), // Last hour
        },
      },
    });

    const webhookErrors = await prisma.paymentLog.count({
      where: {
        event: { in: ['WEBHOOK_ERROR', 'WEBHOOK_ORDER_NOT_FOUND', 'WEBHOOK_MD5_MISMATCH'] },
        createdAt: {
          gte: new Date(Date.now() - 60 * 60 * 1000),
        },
      },
    });

    const webhookSuccessRate = recentWebhooks > 0
      ? ((recentWebhooks - webhookErrors) / recentWebhooks) * 100
      : 100;

    checks.push({
      component: 'Webhooks',
      status: webhookSuccessRate >= 95 ? 'healthy' : webhookSuccessRate >= 80 ? 'degraded' : 'unhealthy',
      details: {
        webhooksLastHour: recentWebhooks,
        errorsLastHour: webhookErrors,
        successRate: `${webhookSuccessRate.toFixed(1)}%`,
      },
      issues: webhookSuccessRate < 95 ? [`Webhook success rate: ${webhookSuccessRate.toFixed(1)}%`] : [],
    });

    if (webhookSuccessRate < 95) {
      issues.push(`Webhooks: Success rate ${webhookSuccessRate.toFixed(1)}% (target: 95%)`);
    }
  } catch (error: any) {
    checks.push({
      component: 'Webhooks',
      status: 'degraded',
      details: { error: error.message },
      issues: ['Failed to check webhook health'],
    });
    issues.push('Webhooks: Health check failed');
  }

  // 4. Cron Job Health
  try {
    const recentCronRuns = await prisma.paymentLog.count({
      where: {
        event: { contains: 'CRON' },
        createdAt: {
          gte: new Date(Date.now() - 5 * 60 * 1000), // Last 5 minutes
        },
      },
    });

    checks.push({
      component: 'Cron Jobs',
      status: recentCronRuns > 0 ? 'healthy' : 'degraded',
      details: {
        runsLast5Min: recentCronRuns,
        expectedRuns: 5, // Should run every minute
      },
      issues: recentCronRuns === 0 ? ['No cron runs in last 5 minutes'] : [],
    });

    if (recentCronRuns === 0) {
      issues.push('Cron Jobs: No runs in last 5 minutes');
    }
  } catch (error: any) {
    checks.push({
      component: 'Cron Jobs',
      status: 'degraded',
      details: { error: error.message },
      issues: ['Failed to check cron health'],
    });
    issues.push('Cron Jobs: Health check failed');
  }

  // 5. Payment Metrics
  try {
    const metrics = await getPaymentMetrics('1h');

    checks.push({
      component: 'Payment Processing',
      status: metrics.successRate >= 95 ? 'healthy' : 'degraded',
      details: {
        totalPayments: metrics.totalPayments,
        successRate: `${metrics.successRate}%`,
        avgConfirmationTime: `${Math.round(metrics.averageConfirmationTimeMs / 1000)}s`,
        pendingPayments: metrics.pendingPayments,
      },
      issues: metrics.successRate < 95 ? [`Payment success rate: ${metrics.successRate}%`] : [],
    });

    if (metrics.successRate < 95) {
      issues.push(`Payment Processing: Success rate ${metrics.successRate}%`);
    }

    if (metrics.pendingPayments > 50) {
      issues.push(`Payment Processing: ${metrics.pendingPayments} pending payments`);
      checks[checks.length - 1].issues.push(`${metrics.pendingPayments} pending payments`);
    }
  } catch (error: any) {
    checks.push({
      component: 'Payment Processing',
      status: 'degraded',
      details: { error: error.message },
      issues: ['Failed to fetch payment metrics'],
    });
    issues.push('Payment Processing: Metrics unavailable');
  }

  // 6. Circuit Breaker Health
  try {
    const circuitBreaker = await getCircuitBreakerDashboard();
    const openCircuits = Object.values(circuitBreaker.states).filter(s => s.state === 'OPEN').length;

    checks.push({
      component: 'Circuit Breakers',
      status: openCircuits === 0 ? 'healthy' : 'degraded',
      details: {
        openCircuits,
        providers: circuitBreaker.states,
        healthScores: circuitBreaker.healthScores,
      },
      issues: openCircuits > 0 ? [`${openCircuits} circuit breakers OPEN`] : [],
    });

    if (openCircuits > 0) {
      issues.push(`Circuit Breakers: ${openCircuits} providers blocked`);
    }
  } catch (error: any) {
    checks.push({
      component: 'Circuit Breakers',
      status: 'degraded',
      details: { error: error.message },
      issues: ['Failed to check circuit breakers'],
    });
    issues.push('Circuit Breakers: Health check failed');
  }

  // Overall system health
  const unhealthyComponents = checks.filter(c => c.status === 'unhealthy').length;
  const degradedComponents = checks.filter(c => c.status === 'degraded').length;

  const overallStatus = unhealthyComponents > 0 ? 'unhealthy' : degradedComponents > 0 ? 'degraded' : 'healthy';

  return NextResponse.json({
    success: true,
    timestamp: new Date().toISOString(),
    overallStatus,
    issues,
    checks,
    recommendations: generateRecommendations(checks),
  });
}

function generateRecommendations(checks: any[]): string[] {
  const recommendations: string[] = [];

  for (const check of checks) {
    if (check.status === 'unhealthy') {
      recommendations.push(`CRITICAL: Investigate ${check.component} immediately`);
    } else if (check.status === 'degraded') {
      if (check.component === 'Redis') {
        recommendations.push('Configure Upstash Redis for replay protection');
      } else if (check.component === 'Cron Jobs') {
        recommendations.push('Check Vercel cron job configuration');
      } else if (check.component === 'Webhooks') {
        recommendations.push('Review webhook error logs');
      }
    }
  }

  return recommendations;
}
