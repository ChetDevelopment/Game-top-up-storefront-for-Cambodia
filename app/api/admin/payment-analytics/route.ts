import { NextRequest, NextResponse } from 'next/server';
import { getPaymentDashboard, getPaymentMetrics, getProviderLatencyMetrics } from '@/lib/payment-analytics';
import { getWebhookCacheStats } from '@/lib/webhook-cache';
import { getSecretRotationStatus } from '@/lib/webhook-secret-rotation';
import { getCircuitBreakerDashboard } from '@/lib/circuit-breaker';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/payment-analytics
 * 
 * Payment analytics dashboard data
 * Requires admin authentication (add your auth middleware)
 */
export async function GET(req: NextRequest) {
  try {
    const period = req.nextUrl.searchParams.get('period') || '24h';
    const validPeriods = ['1h', '24h', '7d', '30d'];
    const safePeriod = validPeriods.includes(period) ? (period as any) : '24h';
    
    const [dashboard, metrics, webhookStats, circuitBreaker] = await Promise.all([
      getPaymentDashboard(),
      getPaymentMetrics(safePeriod),
      getWebhookCacheStats(),
      getCircuitBreakerDashboard(),
    ]);
    
    return NextResponse.json({
      success: true,
      data: {
        dashboard,
        metrics,
        webhookStats,
        circuitBreaker,
        secretRotation: {
          bakong: getSecretRotationStatus('BAKONG'),
          aba: getSecretRotationStatus('ABA'),
        },
      },
    });
  } catch (error: any) {
    console.error('[Payment Analytics] Error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error.message || 'Failed to fetch analytics' 
      },
      { status: 500 }
    );
  }
}
