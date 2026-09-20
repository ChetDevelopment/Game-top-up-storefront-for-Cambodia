export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { checkPendingPayments, processDeliveryQueue } from "@/lib/payment";
import { prisma } from "@/lib/prisma";
import { checkBakongPayment } from "@/lib/payment";
import { markOrderAsPaid } from "@/lib/payment-state-machine";
import { logSecurityEvent } from "@/lib/security";

/**
 * POST /api/cron/reconcile-payments
 * 
 * Payment reconciliation background worker.
 * Checks all PENDING orders against Bakong API.
 * 
 * RELIABILITY FIX: Enhanced to check multiple sources:
 * 1. PENDING orders with bakongMd5
 * 2. PENDING orders with paymentRef but no MD5
 * 3. Recently created orders (last 24 hours)
 * 4. Orders that expired but might have been paid
 * 
 * PURPOSES:
 * 1. Check pending payments every minute
 * 2. Update orders that were paid but not detected
 * 3. Safety net for missed webhooks and polling failures
 * 
 * SECURITY: Protected by CRON_SECRET env var
 * SAFETY: Uses execution lock to prevent overlapping runs
 * 
 * Called by Vercel Cron every minute.
 */

// Simple in-memory lock for single-instance deployments
let isRunning = false;
let lastRunTime = 0;
const LOCK_TIMEOUT_MS = 60000; // 1 minute

export async function POST(req: NextRequest) {
  // Auth check — support multiple auth methods:
  // 1. Vercel's built-in cron header (x-vercel-cron) — proves request from Vercel cron system
  // 2. Authorization: Bearer <CRON_SECRET> header — for manual triggers
  // 3. ?token=<CRON_SECRET> query param — fallback
  const cronSecret = process.env.CRON_SECRET;
  const isVercelCron = req.headers.get("x-vercel-cron") === "1";
  
  if (cronSecret && !isVercelCron) {
    const authHeader = req.headers.get("authorization");
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const queryToken = req.nextUrl.searchParams.get("token");

    if (bearerToken !== cronSecret && queryToken !== cronSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // Prevent overlapping runs
  const now = Date.now();
  if (isRunning && (now - lastRunTime) < LOCK_TIMEOUT_MS) {
    return NextResponse.json({
      success: false,
      reason: "Another instance is running",
      skipped: true,
    });
  }

  isRunning = true;
  lastRunTime = now;
  
  const cronRequestId = `cron_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  console.log(`[cron/reconcile-payments] [${cronRequestId}] Starting payment reconciliation`);

  try {
    const results = {
      checked: 0,
      updated: 0,
      errors: 0,
      notFound: 0,
      alreadyPaid: 0,
    };
    
    // RELIABILITY FIX 1: Check standard pending orders with MD5
    console.log(`[cron/reconcile-payments] [${cronRequestId}] Checking pending orders with MD5...`);
    const pendingWithMd5 = await checkPendingPayments();
    results.checked += pendingWithMd5.checked;
    results.updated += pendingWithMd5.updated;
    results.errors += pendingWithMd5.errors;
    
    // RELIABILITY FIX 2: Check pending orders WITHOUT MD5 (fallback lookup)
    console.log(`[cron/reconcile-payments] [${cronRequestId}] Checking pending orders without MD5...`);
    const pendingWithoutMd5 = await prisma.order.findMany({
      where: {
        status: 'PENDING',
        paymentMethod: 'BAKONG',
        OR: [
          { metadata: { path: ['bakongMd5'], equals: null } },
          { metadata: { path: ['bakongMd5'], equals: '' } },
        ],
        paymentRef: { not: null },
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
        },
      },
      select: {
        id: true,
        orderNumber: true,
        paymentRef: true,
        amountUsd: true,
        amountKhr: true,
        currency: true,
        createdAt: true,
      },
      take: 100,
    });
    
    for (const order of pendingWithoutMd5) {
      try {
        // Try to verify by paymentRef (no MD5 available)
        if (order.paymentRef) {
          const bakongResult = await checkBakongPayment("", order.paymentRef);
          
          if (bakongResult.paid && (bakongResult.status as any) === 'PAID') {
            console.log(`[cron/reconcile-payments] [${cronRequestId}] Payment confirmed for order ${order.orderNumber} (no MD5)`);
            
            const markResult = await markOrderAsPaid(order.id, {
              paymentRef: order.paymentRef,
              amount: order.currency === 'KHR' ? (order.amountKhr || 0) : order.amountUsd,
              currency: order.currency,
              transactionId: bakongResult.transactionId,
              verifiedBy: 'cron',
            });
            
            if (markResult.success) {
              results.updated++;
              console.log(`[cron/reconcile-payments] [${cronRequestId}] Order ${order.orderNumber} marked as PAID`);
              
              // Trigger delivery
              processDeliveryQueue(5).catch(err => {
                console.error(`[cron/reconcile-payments] [${cronRequestId}] Delivery error:`, err);
              });
            } else {
              results.errors++;
              console.error(`[cron/reconcile-payments] [${cronRequestId}] Failed to mark order ${order.orderNumber}:`, markResult.error);
            }
          }
        }
      } catch (err: any) {
        results.errors++;
        console.error(`[cron/reconcile-payments] [${cronRequestId}] Error checking order ${order.orderNumber}:`, err.message);
      }
    }
    
    // RELIABILITY FIX 3: Check recently expired orders (might have been paid before expiry)
    console.log(`[cron/reconcile-payments] [${cronRequestId}] Checking recently expired orders...`);
    const recentlyExpired = await prisma.order.findMany({
      where: {
        status: 'EXPIRED',
        paymentMethod: 'BAKONG',
        paidAt: null, // Not marked as paid
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
        },
      },
      select: {
        id: true,
        orderNumber: true,
        paymentRef: true,
        metadata: true,
        createdAt: true,
        paymentExpiresAt: true,
      },
      take: 50,
    });
    
    for (const order of recentlyExpired) {
      try {
        const md5Hash = (order.metadata as any)?.bakongMd5;
        const identifier = md5Hash || order.paymentRef;
        
        if (identifier) {
          const bakongResult = await checkBakongPayment(md5Hash || "", order.paymentRef || undefined);
          
          if (bakongResult.paid && (bakongResult.status as any) === 'PAID') {
            console.log(`[cron/reconcile-payments] [${cronRequestId}] Payment confirmed for EXPIRED order ${order.orderNumber}`);
            
            const markResult = await markOrderAsPaid(order.id, {
              paymentRef: order.paymentRef || `WEBHOOK-${md5Hash.slice(0, 16)}`,
              amount: order.currency === 'KHR' ? 0 : 0, // Amount unknown, will be filled by markOrderAsPaid
              currency: order.currency || 'USD',
              transactionId: bakongResult.transactionId,
              verifiedBy: 'cron',
            });
            
            if (markResult.success) {
              results.updated++;
              console.log(`[cron/reconcile-payments] [${cronRequestId}] EXPIRED order ${order.orderNumber} marked as PAID (late payment)`);
              
              // Trigger delivery
              processDeliveryQueue(5).catch(err => {
                console.error(`[cron/reconcile-payments] [${cronRequestId}] Delivery error:`, err);
              });
            }
          }
        }
      } catch (err: any) {
        results.errors++;
        console.error(`[cron/reconcile-payments] [${cronRequestId}] Error checking expired order ${order.orderNumber}:`, err.message);
      }
    }
    
    // RELIABILITY FIX 4: Check orders stuck in PAID status without delivery
    console.log(`[cron/reconcile-payments] [${cronRequestId}] Checking stuck PAID orders...`);
    const stuckPaidOrders = await prisma.order.findMany({
      where: {
        status: 'PAID',
        deliveryStatus: { in: [null, 'PENDING'] },
        paidAt: {
          gte: new Date(Date.now() - 60 * 60 * 1000), // Last hour
        },
      },
      select: {
        id: true,
        orderNumber: true,
      },
      take: 50,
    });
    
    if (stuckPaidOrders.length > 0) {
      console.log(`[cron/reconcile-payments] [${cronRequestId}] Found ${stuckPaidOrders.length} stuck PAID orders, triggering delivery...`);
      
      for (const order of stuckPaidOrders) {
        try {
          processDeliveryQueue(5).then(result => {
            console.log(`[cron/reconcile-payments] [${cronRequestId}] Delivery processing for ${order.orderNumber}:`, result);
          }).catch(err => {
            console.error(`[cron/reconcile-payments] [${cronRequestId}] Delivery error for ${order.orderNumber}:`, err);
          });
        } catch (err: any) {
          results.errors++;
          console.error(`[cron/reconcile-payments] [${cronRequestId}] Error triggering delivery for ${order.orderNumber}:`, err.message);
        }
      }
    }
    
    console.log(`[cron/reconcile-payments] [${cronRequestId}] Reconciliation completed:`, results);

    return NextResponse.json({
      success: true,
      results,
      timestamp: new Date().toISOString(),
      requestId: cronRequestId,
    });
  } catch (error) {
    console.error('[cron/reconcile-payments] Error:', error);
    await logSecurityEvent("CRON_RECONCILIATION_ERROR", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    }, req);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }, { status: 500 });
  } finally {
    isRunning = false;
  }
}

// Health check
export async function GET() {
  return NextResponse.json({
    status: "ok",
    endpoint: "/api/cron/reconcile-payments",
    description: "Payment reconciliation worker - checks PENDING orders every 5 minutes",
    usage: "POST with Authorization: Bearer <CRON_SECRET> or ?token=<CRON_SECRET>",
  });
}
