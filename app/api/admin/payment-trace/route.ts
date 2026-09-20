import { NextRequest, NextResponse } from 'next/server';
import { getPaymentTrace, getPaymentTraceByOrderNumber, getRecentPaymentTraces, analyzePaymentTrace } from '@/lib/payment-tracing';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/payment-trace
 * 
 * Payment tracing API for debugging and audit.
 * Provides end-to-end payment lifecycle visibility.
 * 
 * Query params:
 * - orderNumber: Get trace for specific order
 * - orderId: Get trace by database ID
 * - recent: Get recent traces (last 24h)
 * - status: Filter by status (PENDING, PAID, FAILED, etc.)
 */
export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const orderNumber = searchParams.get('orderNumber');
    const orderId = searchParams.get('orderId');
    const recent = searchParams.get('recent');
    const status = searchParams.get('status');

    // Get trace for specific order
    if (orderNumber) {
      const trace = await getPaymentTraceByOrderNumber(orderNumber);
      
      if (!trace) {
        return NextResponse.json(
          { error: 'Order not found' },
          { status: 404 }
        );
      }

      const analysis = analyzePaymentTrace(trace);

      return NextResponse.json({
        success: true,
        trace,
        analysis,
      });
    }

    // Get trace by database ID
    if (orderId) {
      const trace = await getPaymentTrace(orderId);
      
      if (!trace) {
        return NextResponse.json(
          { error: 'Order not found' },
          { status: 404 }
        );
      }

      const analysis = analyzePaymentTrace(trace);

      return NextResponse.json({
        success: true,
        trace,
        analysis,
      });
    }

    // Get recent traces
    if (recent === 'true') {
      const traces = await getRecentPaymentTraces({
        status: status || undefined,
        limit: 50,
        hours: 24,
      });

      return NextResponse.json({
        success: true,
        traces,
        count: traces.length,
      });
    }

    return NextResponse.json({
      success: false,
      error: 'Missing required parameter: orderNumber, orderId, or ?recent=true',
      usage: {
        orderNumber: '/api/admin/payment-trace?orderNumber=ORDER123',
        orderId: '/api/admin/payment-trace?orderId=database_id',
        recent: '/api/admin/payment-trace?recent=true&status=PENDING',
      },
    });
  } catch (error: any) {
    console.error('[PaymentTrace API] Error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error.message || 'Failed to fetch payment trace' 
      },
      { status: 500 }
    );
  }
}
