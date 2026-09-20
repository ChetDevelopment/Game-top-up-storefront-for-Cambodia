/**
 * Async Payment Worker
 * 
 * Handles all background processing:
 * - Payment verification
 * - Provider API calls (GameDrop, G2Bulk)
 * - Retries with exponential backoff
 * - Reconciliation
 * 
 * CRITICAL: This worker runs OUTSIDE the API request path.
 * API only creates order and returns QR. Worker handles everything else.
 */

import { prisma } from "./prisma";
import { createGameDropOrder } from "./gamedrop";
import { createG2BulkOrder } from "./g2bulk";
import { checkBakongPayment } from "./payment";
import {
  transitionOrderState,
  markOrderAsPaid,
  markOrderAsProcessing,
  markOrderAsDelivered,
  markOrderAsFailed,
  markOrderForManualReview,
} from "./payment-state-machine";
import { generateIdempotencyKey } from "./idempotency";
import { notifyTelegram, escapeHtml } from "./telegram";

// Configuration
const MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 30_000; // 30 seconds
const MAX_RETRY_DELAY_MS = 300_000; // 5 minutes
const PAYMENT_CHECK_INTERVAL_MS = 5_000; // 5 seconds
const ORDER_BATCH_SIZE = 20;

// Worker state
let isRunning = false;
let workerId = `worker_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export interface WorkerStats {
  processed: number;
  succeeded: number;
  failed: number;
  retried: number;
  expired: number;
  manualReview: number;
  lastRun?: Date;
}

let stats: WorkerStats = {
  processed: 0,
  succeeded: 0,
  failed: 0,
  retried: 0,
  expired: 0,
  manualReview: 0,
};

/**
 * Start the payment worker
 * Runs continuously, processing orders in batches
 */
export async function startPaymentWorker(): Promise<void> {
  if (isRunning) {
    console.log("[Worker] Already running");
    return;
  }

  isRunning = true;
  console.log(`[Worker] Starting payment worker (${workerId})`);

  while (isRunning) {
    try {
      await processBatch();
      stats.lastRun = new Date();
      
      // Wait before next batch
      await sleep(5000);
    } catch (error) {
      console.error("[Worker] Batch processing error:", error);
      await sleep(10000); // Wait longer on error
    }
  }
}

/**
 * Stop the payment worker
 */
export function stopPaymentWorker(): void {
  isRunning = false;
  console.log("[Worker] Stopping...");
}

/**
 * Get worker statistics
 */
export function getWorkerStats(): WorkerStats {
  return { ...stats };
}

/**
 * Process a batch of orders
 */
async function processBatch(): Promise<void> {
  const batchStartTime = Date.now();
  console.log(`[Worker] Processing batch...`);

  // 1. Process paid orders awaiting delivery
  await processPaidOrders();

  // 2. Check pending orders for payment confirmation
  await checkPendingPayments();

  // 3. Handle expired orders
  await processExpiredOrders();

  // 4. Retry failed deliveries
  await retryFailedDeliveries();

  console.log(
    `[Worker] Batch completed in ${Date.now() - batchStartTime}ms`,
    stats
  );
}

/**
 * Process orders that are PAID and ready for delivery
 */
async function processPaidOrders(): Promise<void> {
  const paidOrders = await prisma.order.findMany({
    where: {
      status: "PAID",
      deliveryStatus: {
        in: [null, "PENDING", "QUEUED"],
      },
    },
    take: ORDER_BATCH_SIZE,
    include: {
      game: true,
      product: true,
      deliveryJobs: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  for (const order of paidOrders) {
    try {
      await processDeliveryForOrder(order);
      stats.processed++;
    } catch (error: any) {
      console.error(`[Worker] Error processing order ${order.orderNumber}:`, error);
      stats.failed++;
    }
  }
}

/**
 * Process delivery for a single order
 */
async function processDeliveryForOrder(order: any): Promise<void> {
  const orderId = order.id;
  const orderNumber = order.orderNumber;

  console.log(`[Worker] Processing delivery for ${orderNumber}`);

  // Check if already delivered (idempotency)
  if (order.status === "DELIVERED") {
    console.log(`[Worker] Order ${orderNumber} already delivered, skipping`);
    return;
  }

  // Create delivery job if not exists
  let deliveryJob = order.deliveryJobs[0];
  if (!deliveryJob) {
    deliveryJob = await prisma.deliveryJob.create({
      data: {
        orderId,
        status: "PENDING",
        maxAttempts: MAX_RETRIES,
        nextAttemptAt: new Date(),
      },
    });
  }

  // Check if job is already being processed
  if (deliveryJob.status === "PROCESSING" || deliveryJob.status === "DISPATCHED") {
    console.log(`[Worker] Job ${deliveryJob.id} already processing, skipping`);
    return;
  }

  // Mark job as processing
  await prisma.deliveryJob.update({
    where: { id: deliveryJob.id },
    data: {
      status: "PROCESSING",
      startedAt: new Date(),
      workerId,
    },
  });

  try {
    // Transition order to PROCESSING
    const transitionResult = await markOrderAsProcessing(orderId, {
      provider: order.product.gameDropOfferId ? "GAMEDROP" : order.product.g2bulkCatalogueName ? "G2BULK" : "MANUAL",
      deliveryJobId: deliveryJob.id,
    });

    if (!transitionResult.success) {
      throw new Error(`State transition failed: ${transitionResult.error}`);
    }

    // Determine delivery provider
    if (order.product.gameDropOfferId) {
      await deliverViaGameDrop(order, deliveryJob);
    } else if (order.product.g2bulkCatalogueName) {
      await deliverViaG2Bulk(order, deliveryJob);
    } else {
      // Manual fulfillment
      await markOrderAsDelivered(orderId, {
        provider: "MANUAL",
        transactionId: `MANUAL-${Date.now()}`,
        deliveredAt: new Date().toISOString(),
      });

      await prisma.deliveryJob.update({
        where: { id: deliveryJob.id },
        data: {
          status: "SUCCESS",
          completedAt: new Date(),
          providerResponse: JSON.stringify({ manual: true }),
        },
      });

      stats.succeeded++;
      console.log(`[Worker] Order ${orderNumber} marked for manual fulfillment`);
    }
  } catch (error: any) {
    console.error(`[Worker] Delivery error for ${orderNumber}:`, error);

    // Mark job as failed
    await prisma.deliveryJob.update({
      where: { id: deliveryJob.id },
      data: {
        status: "FAILED",
        errorMessage: error.message,
        workerId: null,
      },
    });

    // Mark order as failed
    await markOrderAsFailed(orderId, "PROCESSING", {
      reason: error.message,
      errorCode: "DELIVERY_FAILED",
      retryable: true,
    });

    stats.failed++;
  }
}

/**
 * Deliver via GameDrop API
 */
async function deliverViaGameDrop(order: any, deliveryJob: any): Promise<void> {
  const GAMEDROP_TOKEN = process.env.GAMEDROP_TOKEN || "";
  
  if (!GAMEDROP_TOKEN) {
    throw new Error("GameDrop token not configured");
  }

  const idempotencyKey = generateIdempotencyKey({
    orderNumber: order.orderNumber,
    payload: {
      playerUid: order.playerUid,
      serverId: order.serverId,
      amount: order.amountUsd,
    },
  });

  try {
    const result = await createGameDropOrder(
      GAMEDROP_TOKEN,
      order.product.gameDropOfferId,
      order.playerUid,
      order.serverId,
      idempotencyKey
    );

    if (result.status === "SUCCESS" || result.status === "PENDING") {
      // Success
      await markOrderAsDelivered(order.id, {
        provider: "GAMEDROP",
        transactionId: result.transactionId || idempotencyKey,
        deliveredAt: new Date().toISOString(),
      });

      await prisma.deliveryJob.update({
        where: { id: deliveryJob.id },
        data: {
          status: "SUCCESS",
          completedAt: new Date(),
          providerResponse: JSON.stringify(result),
        },
      });

      stats.succeeded++;
      console.log(`[Worker] GameDrop delivery successful for ${order.orderNumber}`);

      // Notify Telegram
      notifyTelegramDelivery(order, "SUCCESS").catch(() => {});
    } else {
      // Failure
      throw new Error(result.message || "GameDrop delivery failed");
    }
  } catch (error: any) {
    // Handle timeout/network errors as unknown state
    if (error.message.includes("timeout") || error.message.includes("network")) {
      await prisma.deliveryJob.update({
        where: { id: deliveryJob.id },
        data: {
          status: "UNKNOWN_EXTERNAL_STATE",
          errorMessage: "Provider timeout - status unclear",
          workerId: null,
        },
      });

      await markOrderForManualReview(order.id, "PROCESSING", {
        reason: "PROVIDER_TIMEOUT",
        priority: "HIGH",
        details: { error: error.message },
      });

      stats.manualReview++;
    } else {
      throw error;
    }
  }
}

/**
 * Deliver via G2Bulk API
 */
async function deliverViaG2Bulk(order: any, deliveryJob: any): Promise<void> {
  const G2BULK_TOKEN = process.env.G2BULK_TOKEN || "";
  
  if (!G2BULK_TOKEN) {
    throw new Error("G2Bulk token not configured");
  }

  const idempotencyKey = generateIdempotencyKey({
    orderNumber: order.orderNumber,
    payload: {
      playerUid: order.playerUid,
      serverId: order.serverId,
      amount: order.amountUsd,
    },
  });

  try {
    const result = await createG2BulkOrder(
      G2BULK_TOKEN,
      order.product.g2bulkCatalogueName,
      order.playerUid,
      order.serverId,
      idempotencyKey
    );

    if (result.success) {
      // Success
      await markOrderAsDelivered(order.id, {
        provider: "G2BULK",
        transactionId: result.orderId?.toString() || idempotencyKey,
        deliveredAt: new Date().toISOString(),
      });

      await prisma.deliveryJob.update({
        where: { id: deliveryJob.id },
        data: {
          status: "SUCCESS",
          completedAt: new Date(),
          providerResponse: JSON.stringify(result),
        },
      });

      stats.succeeded++;
      console.log(`[Worker] G2Bulk delivery successful for ${order.orderNumber}`);

      // Notify Telegram
      notifyTelegramDelivery(order, "SUCCESS").catch(() => {});
    } else {
      // Failure
      throw new Error(result.message || "G2Bulk delivery failed");
    }
  } catch (error: any) {
    // Handle timeout/network errors as unknown state
    if (error.message.includes("timeout") || error.message.includes("network")) {
      await prisma.deliveryJob.update({
        where: { id: deliveryJob.id },
        data: {
          status: "UNKNOWN_EXTERNAL_STATE",
          errorMessage: "Provider timeout - status unclear",
          workerId: null,
        },
      });

      await markOrderForManualReview(order.id, "PROCESSING", {
        reason: "PROVIDER_TIMEOUT",
        priority: "HIGH",
        details: { error: error.message },
      });

      stats.manualReview++;
    } else {
      throw error;
    }
  }
}

/**
 * Check pending orders for payment confirmation
 */
export async function checkPendingPayments(): Promise<{ checked: number; updated: number; errors: number }> {
  const pendingOrders = await prisma.order.findMany({
    where: {
      status: "PENDING",
      paymentExpiresAt: {
        gt: new Date(), // Not expired
      },
      metadata: {
        path: ["bakongMd5"],
        not: null,
      },
    },
    take: ORDER_BATCH_SIZE,
  });

  let checked = 0;
  let updated = 0;
  let errors = 0;

  for (const order of pendingOrders) {
    try {
      const md5Hash = (order.metadata as any).bakongMd5;
      const result = await checkBakongPayment(md5Hash, order.paymentRef || undefined);

      if (result.paid && result.status === "PAID") {
        // Payment confirmed
        await markOrderAsPaid(order.id, {
          paymentRef: order.paymentRef || `WEBHOOK-${md5Hash.slice(0, 16)}`,
          amount: order.currency === "KHR" ? (order.amountKhr || 0) : order.amountUsd,
          currency: order.currency,
          transactionId: result.transactionId,
          verifiedBy: "polling",
        });

        console.log(`[Worker] Payment confirmed via polling for ${order.orderNumber}`);
        updated++;
      }
      checked++;
    } catch (error) {
      console.error(`[Worker] Error checking order ${order.orderNumber}:`, error);
      errors++;
    }
  }

  return { checked, updated, errors };
}

/**
 * Process expired orders
 */
async function processExpiredOrders(): Promise<void> {
  const expiredOrders = await prisma.order.findMany({
    where: {
      status: "PENDING",
      paymentExpiresAt: {
        lt: new Date(),
      },
    },
    take: ORDER_BATCH_SIZE,
  });

  for (const order of expiredOrders) {
    try {
      await prisma.order.update({
        where: { id: order.id },
        data: { status: "EXPIRED" },
      });

      console.log(`[Worker] Order ${order.orderNumber} marked as expired`);
      stats.expired++;
    } catch (error) {
      console.error(`[Worker] Error expiring order ${order.orderNumber}:`, error);
    }
  }
}

/**
 * Retry failed deliveries
 */
async function retryFailedDeliveries(): Promise<void> {
  const failedJobs = await prisma.deliveryJob.findMany({
    where: {
      status: "FAILED",
      attempt: {
        lt: MAX_RETRIES,
      },
      nextAttemptAt: {
        lte: new Date(),
      },
    },
    take: ORDER_BATCH_SIZE,
    include: {
      order: {
        include: {
          game: true,
          product: true,
        },
      },
    },
  });

  for (const job of failedJobs) {
    try {
      // Calculate exponential backoff with jitter
      const attempt = job.attempt || 0;
      const baseDelay = Math.min(
        BASE_RETRY_DELAY_MS * Math.pow(2, attempt),
        MAX_RETRY_DELAY_MS
      );
      
      // Add jitter (±30%) to prevent thundering herd
      const jitter = (Math.random() - 0.5) * 0.6 * baseDelay;
      const delayWithJitter = baseDelay + jitter;

      await prisma.deliveryJob.update({
        where: { id: job.id },
        data: {
          status: "RETRYING",
          nextAttemptAt: new Date(Date.now() + delayWithJitter),
          attempt: attempt + 1,
        },
      });

      console.log(`[Worker] Scheduled retry for job ${job.id} (attempt ${attempt + 1}, delay ${Math.round(delayWithJitter)}ms)`);
      stats.retried++;
    } catch (error) {
      console.error(`[Worker] Error scheduling retry for job ${job.id}:`, error);
    }
  }
}

/**
 * Notify Telegram about delivery
 */
async function notifyTelegramDelivery(order: any, status: string): Promise<void> {
  const baseUrl = process.env.PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || "";
  const link = baseUrl ? `\n<a href="${baseUrl}/admin/orders/${order.orderNumber}">Open in admin</a>` : "";

  const emoji = status === "SUCCESS" ? "✅" : "❌";
  
  await notifyTelegram(
    `${emoji} <b>Delivery ${status}</b>\n` +
      `<b>#${escapeHtml(order.orderNumber)}</b>\n` +
      `${escapeHtml(order.game.name)} — ${escapeHtml(order.product.name)}\n` +
      `UID: <code>${escapeHtml(order.playerUid)}</code>\n` +
      `Amount: ${order.currency === "KHR" ? `${Math.round(order.amountKhr ?? 0).toLocaleString()} ៛` : `$${order.amountUsd.toFixed(2)}`}${link}`
  );
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
