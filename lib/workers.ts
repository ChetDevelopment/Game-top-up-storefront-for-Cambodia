/**
 * BullMQ Workers - Distributed Payment Processing
 * 
 * CRITICAL FEATURES:
 * - Multiple workers can run in parallel
 * - Jobs are processed exactly once
 * - Automatic retry with backoff
 * - Graceful shutdown
 * - Crash recovery
 * 
 * WORKERS:
 * 1. Payment Verification Worker
 * 2. Delivery Processing Worker
 * 3. Delivery Retry Worker
 * 4. Order Expiration Worker
 * 5. Reconciliation Worker
 */

import { Worker, Job } from 'bullmq';
import { prisma } from './prisma';
import { checkBakongPayment } from './payment';
import { markOrderAsPaid, markOrderAsExpired } from './payment-state-machine';
import { processDeliverySafely, processDeliveryRetrySafely } from './delivery-processor';
import {
  addDeliveryProcessingJob,
  addReconciliationJob,
  QUEUE_NAMES,
} from './queue';
import {
  logPaymentVerification,
  logStateTransition,
  logError,
} from './audit-log';
import { notifyTelegram, escapeHtml } from './telegram';

// Worker identification
const WORKER_ID = `worker-${process.env.HOSTNAME || 'unknown'}-${process.pid}`;

// Worker configuration
const WORKER_CONFIG = {
  concurrency: 5, // Process 5 jobs concurrently per worker
  limiter: {
    max: 10, // Max 10 jobs
    duration: 1000, // per second
  },
};

/**
 * Start all workers
 */
export function startAllWorkers(): Worker[] {
  console.log(`[Worker] Starting distributed workers (${WORKER_ID})`);
  
  const workers: Worker[] = [
    startPaymentVerificationWorker(),
    startDeliveryProcessingWorker(),
    startDeliveryRetryWorker(),
    startOrderExpirationWorker(),
    startReconciliationWorker(),
  ];
  
  console.log(`[Worker] Started ${workers.length} workers`);
  return workers;
}

/**
 * Stop all workers gracefully
 */
export async function stopAllWorkers(workers: Worker[]): Promise<void> {
  console.log('[Worker] Stopping all workers...');
  
  await Promise.all(
    workers.map((worker) => worker.close())
  );
  
  console.log('[Worker] All workers stopped');
}

/**
 * Payment Verification Worker
 * - Verifies pending payments via Bakong API
 * - Marks orders as PAID when confirmed
 */
function startPaymentVerificationWorker(): Worker {
  const worker = new Worker(
    QUEUE_NAMES.PAYMENT_VERIFICATION,
    async (job: Job) => {
      const { orderId, orderNumber, md5Hash, source } = job.data;
      const requestId = job.data.requestId || `verify-${job.id}`;
      
      console.log(`[Worker] Verifying payment for ${orderNumber} (source: ${source})`);
      
      try {
        // Re-check order state (webhook may have updated it)
        const order = await prisma.order.findUnique({
          where: { id: orderId },
          select: {
            status: true,
            amountUsd: true,
            amountKhr: true,
            currency: true,
            paymentRef: true,
          },
        });
        
        if (!order) {
          throw new Error(`Order ${orderNumber} not found`);
        }
        
        // Skip if already paid (webhook may have processed it)
        if (['PAID', 'PROCESSING', 'DELIVERED'].includes(order.status)) {
          console.log(`[Worker] Order ${orderNumber} already paid - skipping verification`);
          return;
        }
        
        // Verify with Bakong API
        const result = await checkBakongPayment(md5Hash, order.paymentRef || undefined);
        
        if (result.paid && result.status === 'PAID') {
          // Mark as paid
          const markResult = await markOrderAsPaid(orderId, {
            paymentRef: order.paymentRef || `WEBHOOK-${md5Hash.slice(0, 16)}`,
            amount: order.currency === 'KHR' ? (order.amountKhr || 0) : order.amountUsd,
            currency: order.currency,
            transactionId: result.transactionId,
            verifiedBy: source,
          });
          
          if (!markResult.success) {
            throw new Error(`Failed to mark order as paid: ${markResult.error}`);
          }
          
          // Log verification
          await logPaymentVerification(orderId, orderNumber, {
            verifiedBy: source,
            bakongTransactionId: result.transactionId,
            amount: order.currency === 'KHR' ? (order.amountKhr || 0) : order.amountUsd,
            currency: order.currency,
          }, requestId);
          
          // Queue delivery processing
          const provider = await determineProvider(orderId);
          await addDeliveryProcessingJob({
            orderId,
            orderNumber,
            paymentRef: order.paymentRef || '',
            provider,
            requestId,
          });
          
          console.log(`[Worker] Payment verified for ${orderNumber}`);
        } else {
          console.log(`[Worker] Payment not confirmed for ${orderNumber}`);
        }
      } catch (error: any) {
        console.error(`[Worker] Payment verification error for ${orderNumber}:`, error);
        
        await logError(orderId, orderNumber, {
          errorType: error.name || 'VerificationError',
          errorMessage: error.message,
          stack: error.stack,
          context: { source, requestId },
        }, requestId);
        
        throw error; // Trigger retry
      }
    },
    {
      connection: (worker as any).connection,
      concurrency: WORKER_CONFIG.concurrency,
    }
  );
  
  setupWorkerEventHandlers(worker, 'Payment Verification');
  return worker;
}

/**
 * Delivery Processing Worker
 * - Processes paid orders for delivery
 * - Calls GameDrop/G2Bulk APIs
 */
function startDeliveryProcessingWorker(): Worker {
  const worker = new Worker(
    QUEUE_NAMES.DELIVERY_PROCESSING,
    async (job: Job) => {
      await processDeliverySafely(job);
    },
    {
      connection: (worker as any).connection,
      concurrency: WORKER_CONFIG.concurrency,
      limiter: WORKER_CONFIG.limiter,
    }
  );
  
  setupWorkerEventHandlers(worker, 'Delivery Processing');
  return worker;
}

/**
 * Delivery Retry Worker
 * - Retries failed deliveries with backoff
 */
function startDeliveryRetryWorker(): Worker {
  const worker = new Worker(
    QUEUE_NAMES.DELIVERY_RETRY,
    async (job: Job) => {
      await processDeliveryRetrySafely(job);
    },
    {
      connection: (worker as any).connection,
      concurrency: WORKER_CONFIG.concurrency,
    }
  );
  
  setupWorkerEventHandlers(worker, 'Delivery Retry');
  return worker;
}

/**
 * Order Expiration Worker
 * - Marks unpaid orders as expired
 */
function startOrderExpirationWorker(): Worker {
  const worker = new Worker(
    QUEUE_NAMES.ORDER_EXPIRATION,
    async (job: Job) => {
      const { orderId, orderNumber } = job.data;
      
      console.log(`[Worker] Expiring order ${orderNumber}`);
      
      try {
        const order = await prisma.order.findUnique({
          where: { id: orderId },
          select: { status: true, paymentExpiresAt: true },
        });
        
        if (!order) {
          throw new Error(`Order ${orderNumber} not found`);
        }
        
        // Only expire if still pending
        if (order.status !== 'PENDING') {
          console.log(`[Worker] Order ${orderNumber} not in PENDING state - skipping`);
          return;
        }
        
        // Check if actually expired
        if (order.paymentExpiresAt && order.paymentExpiresAt > new Date()) {
          console.log(`[Worker] Order ${orderNumber} not yet expired - skipping`);
          return;
        }
        
        // Mark as expired
        await prisma.order.update({
          where: { id: orderId },
          data: { status: 'EXPIRED' },
        });
        
        await logStateTransition(
          orderId,
          orderNumber,
          'PENDING',
          'EXPIRED',
          'WORKER',
          'Payment window expired',
          {},
          `expire-${job.id}`
        );
        
        console.log(`[Worker] Order ${orderNumber} marked as expired`);
      } catch (error: any) {
        console.error(`[Worker] Expiration error for ${orderNumber}:`, error);
        throw error;
      }
    },
    {
      connection: (worker as any).connection,
      concurrency: WORKER_CONFIG.concurrency,
    }
  );
  
  setupWorkerEventHandlers(worker, 'Order Expiration');
  return worker;
}

/**
 * Reconciliation Worker
 * - Handles unknown states and manual review
 */
function startReconciliationWorker(): Worker {
  const worker = new Worker(
    QUEUE_NAMES.RECONCILIATION,
    async (job: Job) => {
      const { orderId, orderNumber, reason, priority } = job.data;
      
      console.log(`[Worker] Reconciling order ${orderNumber} (reason: ${reason})`);
      
      try {
        const order = await prisma.order.findUnique({
          where: { id: orderId },
          include: { game: true, product: true },
        });
        
        if (!order) {
          throw new Error(`Order ${orderNumber} not found`);
        }
        
        // Mark for manual review
        await prisma.order.update({
          where: { id: orderId },
          data: {
            status: 'MANUAL_REVIEW',
            metadata: {
              ...(order.metadata as any || {}),
              reconciliationReason: reason,
              reconciliationPriority: priority,
              reconciliationAt: new Date().toISOString(),
            },
          },
        });
        
        // Notify Telegram for high priority
        if (priority === 'HIGH' || priority === 'CRITICAL') {
          await notifyTelegram(
            `⚠️ <b>Manual Review Required</b>\n` +
              `<b>#${escapeHtml(orderNumber)}</b>\n` +
              `Reason: ${reason}\n` +
              `Priority: ${priority}\n` +
              `${escapeHtml(order.game.name)} — ${escapeHtml(order.product.name)}\n` +
              `Amount: ${order.currency === 'KHR' ? `${Math.round(order.amountKhr ?? 0).toLocaleString()} ៛` : `$${order.amountUsd.toFixed(2)}`}`
          );
        }
        
        console.log(`[Worker] Order ${orderNumber} marked for manual review`);
      } catch (error: any) {
        console.error(`[Worker] Reconciliation error for ${orderNumber}:`, error);
        throw error;
      }
    },
    {
      connection: (worker as any).connection,
      concurrency: 2, // Lower concurrency for reconciliation
    }
  );
  
  setupWorkerEventHandlers(worker, 'Reconciliation');
  return worker;
}

/**
 * Setup common event handlers for workers
 */
function setupWorkerEventHandlers(worker: Worker, workerName: string) {
  worker.on('completed', (job: Job) => {
    console.log(`[Worker] ${workerName} completed job ${job.id}`);
  });
  
  worker.on('failed', (job: Job | undefined, error: Error) => {
    console.error(`[Worker] ${workerName} failed job ${job?.id}:`, error.message);
  });
  
  worker.on('error', (error: Error) => {
    console.error(`[Worker] ${workerName} error:`, error.message);
  });
  
  worker.on('stalled', (jobId: string) => {
    console.warn(`[Worker] ${workerName} job ${jobId} stalled - will be retried`);
  });
}

/**
 * Determine provider for an order
 */
async function determineProvider(orderId: string): Promise<'GAMEDROP' | 'G2BULK' | 'MANUAL'> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      product: {
        select: {
          gameDropOfferId: true,
          g2bulkCatalogueName: true,
        },
      },
    },
  });
  
  if (!order) {
    return 'MANUAL';
  }
  
  if (order.product.gameDropOfferId) {
    return 'GAMEDROP';
  } else if (order.product.g2bulkCatalogueName) {
    return 'G2BULK';
  } else {
    return 'MANUAL';
  }
}
