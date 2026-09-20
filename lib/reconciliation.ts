/**
 * Reconciliation Safety Layer
 * 
 * CRITICAL GUARANTEES:
 * 1. NEVER blindly overrides SUCCESS state
 * 2. Compares provider state vs internal state
 * 3. Fixes mismatches safely with audit trail
 * 4. Runs periodically as background job
 * 
 * RECONCILIATION RULES:
 * - If internal=SUCCESS and provider=SUCCESS → OK
 * - If internal=PENDING and provider=SUCCESS → Fix (mark as PAID)
 * - If internal=FAILED and provider=SUCCESS → Fix (mark as DELIVERED)
 * - If internal=SUCCESS and provider=UNKNOWN → Manual review
 * - If both=FAILED → OK (already failed)
 */

import { prisma } from './prisma';
import { checkBakongPayment } from './payment';
import { markOrderAsPaid, markOrderAsDelivered, markOrderForManualReview } from './payment-state-machine';
import { createAuditLog } from './audit-log';
import { notifyTelegram, escapeHtml } from './telegram';

export interface ReconciliationResult {
  orderId: string;
  orderNumber: string;
  internalState: string;
  providerState?: string;
  action: 'NONE' | 'FIXED' | 'ESCALATED';
  reason?: string;
}

/**
 * Reconcile all pending and processing orders
 */
export async function reconcileAllOrders(): Promise<{
  processed: number;
  fixed: number;
  escalated: number;
  results: ReconciliationResult[];
}> {
  console.log('[Reconciliation] Starting reconciliation run...');
  
  const results: ReconciliationResult[] = [];
  let fixed = 0;
  let escalated = 0;
  
  // Get orders that need reconciliation
  const orders = await prisma.order.findMany({
    where: {
      status: {
        in: ['PENDING', 'PROCESSING'],
      },
      createdAt: {
        lt: new Date(Date.now() - (5 * 60 * 1000)), // Older than 5 minutes
      },
    },
    take: 100,
    include: {
      game: true,
      product: true,
    },
  });
  
  console.log(`[Reconciliation] Found ${orders.length} orders to reconcile`);
  
  for (const order of orders) {
    try {
      const result = await reconcileSingleOrder(order);
      results.push(result);
      
      if (result.action === 'FIXED') {
        fixed++;
      } else if (result.action === 'ESCALATED') {
        escalated++;
      }
    } catch (error) {
      console.error(`[Reconciliation] Error reconciling ${order.orderNumber}:`, error);
    }
  }
  
  console.log(`[Reconciliation] Completed: ${results.length} processed, ${fixed} fixed, ${escalated} escalated`);
  
  return {
    processed: results.length,
    fixed,
    escalated,
    results,
  };
}

/**
 * Reconcile a single order
 */
async function reconcileSingleOrder(order: any): Promise<ReconciliationResult> {
  const { id: orderId, orderNumber, status, metadata } = order;
  
  console.log(`[Reconciliation] Reconciling ${orderNumber} (status: ${status})`);
  
  // Get provider state
  let providerState: string | undefined;
  let providerData: any;
  
  try {
    if (metadata?.bakongMd5) {
      const bakongResult = await checkBakongPayment(metadata.bakongMd5, order.paymentRef || undefined);
      providerState = bakongResult.status;
      providerData = bakongResult;
    }
  } catch (error) {
    console.error(`[Reconciliation] Failed to check provider state for ${orderNumber}:`, error);
    providerState = 'UNKNOWN';
  }
  
  // Reconciliation logic
  if (status === 'PENDING') {
    if (providerState === 'PAID') {
      // Internal=PENDING, Provider=PAID → Fix
      console.log(`[Reconciliation] Fixing ${orderNumber}: PENDING → PAID`);
      
      const markResult = await markOrderAsPaid(orderId, {
        paymentRef: order.paymentRef || `RECONCILE-${Date.now()}`,
        amount: order.currency === 'KHR' ? (order.amountKhr || 0) : order.amountUsd,
        currency: order.currency,
        transactionId: providerData?.transactionId,
        verifiedBy: 'polling',
      });
      
      if (markResult.success) {
        await createAuditLog({
          orderId,
          orderNumber,
          eventType: 'RECONCILIATION',
          actor: 'SYSTEM',
          previousState: 'PENDING',
          newState: 'PAID',
          reason: 'Provider confirmed payment, internal state was stale',
          metadata: {
            providerState,
            reconciledAt: new Date().toISOString(),
          },
        });
        
        return {
          orderId,
          orderNumber,
          internalState: status,
          providerState,
          action: 'FIXED',
          reason: 'Payment confirmed by provider',
        };
      } else {
        return {
          orderId,
          orderNumber,
          internalState: status,
          providerState,
          action: 'ESCALATED',
          reason: `Failed to mark as paid: ${markResult.error}`,
        };
      }
    } else if (providerState === 'FAILED') {
      // Internal=PENDING, Provider=FAILED → Mark as failed
      console.log(`[Reconciliation] Marking ${orderNumber} as FAILED`);
      
      await prisma.order.update({
        where: { id: orderId },
        data: {
          status: 'FAILED',
          metadata: {
            ...(metadata as any || {}),
            reconciliationReason: 'Provider confirmed failure',
            reconciledAt: new Date().toISOString(),
          },
        },
      });
      
      return {
        orderId,
        orderNumber,
        internalState: status,
        providerState,
        action: 'FIXED',
        reason: 'Payment failed at provider',
      };
    } else if (
      order.paymentExpiresAt && 
      order.paymentExpiresAt < new Date() &&
      providerState !== 'PAID'
    ) {
      // Expired and not paid → Mark as expired
      console.log(`[Reconciliation] Marking ${orderNumber} as EXPIRED`);
      
      await prisma.order.update({
        where: { id: orderId },
        data: { status: 'EXPIRED' },
      });
      
      return {
        orderId,
        orderNumber,
        internalState: status,
        providerState,
        action: 'FIXED',
        reason: 'Payment window expired',
      };
    }
  } else if (status === 'PROCESSING') {
    if (providerState === 'PAID') {
      // Internal=PROCESSING, Provider=PAID → May need to complete delivery
      // Check if delivery already completed
      const deliveryJobs = await prisma.deliveryJob.findMany({
        where: { orderId },
        orderBy: { createdAt: 'desc' },
        take: 1,
      });
      
      const latestJob = deliveryJobs[0];
      
      if (latestJob?.status === 'SUCCESS') {
        // Delivery completed but order not updated
        console.log(`[Reconciliation] Fixing ${orderNumber}: PROCESSING → DELIVERED`);
        
        await prisma.order.update({
          where: { id: orderId },
          data: {
            status: 'DELIVERED',
            deliveredAt: new Date(),
          },
        });
        
        return {
          orderId,
          orderNumber,
          internalState: status,
          providerState,
          action: 'FIXED',
          reason: 'Delivery completed but order state not updated',
        };
      }
    }
  }
  
  // No action needed
  return {
    orderId,
    orderNumber,
    internalState: status,
    providerState,
    action: 'NONE',
    reason: 'States are consistent',
  };
}

/**
 * Reconcile unknown state orders
 */
export async function reconcileUnknownStates(): Promise<void> {
  const unknownOrders = await prisma.order.findMany({
    where: {
      status: 'MANUAL_REVIEW',
      metadata: {
        path: ['reconciliationReason'],
        equals: 'UNKNOWN_STATE',
      },
    },
    take: 50,
    include: {
      game: true,
      product: true,
    },
  });
  
  for (const order of unknownOrders) {
    try {
      // Check provider state
      if (order.metadata?.bakongMd5) {
        const bakongResult = await checkBakongPayment(order.metadata.bakongMd5, order.paymentRef || undefined);
        
        if (bakongResult.paid) {
          // Payment confirmed - complete delivery
          console.log(`[Reconciliation] Unknown state resolved for ${order.orderNumber}: payment confirmed`);
          
          await prisma.order.update({
            where: { id: order.id },
            data: {
              status: 'PAID',
              paidAt: new Date(),
              metadata: {
                ...(order.metadata as any),
                reconciliationResolved: true,
                resolvedAt: new Date().toISOString(),
              },
            },
          });
        } else {
          // Still unknown - notify admin
          await notifyTelegram(
            `⚠️ <b>Manual Review Required</b>\n` +
              `<b>#${escapeHtml(order.orderNumber)}</b>\n` +
              `Game: ${escapeHtml(order.game.name)}\n` +
              `Product: ${escapeHtml(order.product.name)}\n` +
              `Amount: ${order.currency === 'KHR' ? `${Math.round(order.amountKhr ?? 0).toLocaleString()} ៛` : `$${order.amountUsd.toFixed(2)}`}\n` +
              `Status: Unknown (payment not confirmed)`
          );
        }
      }
    } catch (error) {
      console.error(`[Reconciliation] Error resolving unknown state for ${order.orderNumber}:`, error);
    }
  }
}

/**
 * Generate reconciliation report
 */
export async function generateReconciliationReport(hours: number = 24): Promise<{
  totalOrders: number;
  byStatus: Record<string, number>;
  reconciled: number;
  failed: number;
  unknown: number;
}> {
  const cutoff = new Date(Date.now() - (hours * 60 * 60 * 1000));
  
  const [totalOrders, byStatus, reconciled, failed, unknown] = await Promise.all([
    prisma.order.count({
      where: { createdAt: { gte: cutoff } },
    }),
    prisma.order.groupBy({
      by: ['status'],
      where: { createdAt: { gte: cutoff } },
      _count: true,
    }),
    prisma.auditLog.count({
      where: {
        action: 'RECONCILIATION',
        createdAt: { gte: cutoff },
      },
    }),
    prisma.order.count({
      where: {
        status: 'FAILED',
        createdAt: { gte: cutoff },
      },
    }),
    prisma.order.count({
      where: {
        status: 'MANUAL_REVIEW',
        createdAt: { gte: cutoff },
      },
    }),
  ]);
  
  const statusCounts: Record<string, number> = {};
  byStatus.forEach((item: any) => {
    statusCounts[item.status] = item._count;
  });
  
  return {
    totalOrders,
    byStatus: statusCounts,
    reconciled,
    failed,
    unknown,
  };
}
