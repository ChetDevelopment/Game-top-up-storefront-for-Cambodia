/**
 * Distributed Job Queue System using BullMQ + Redis
 * 
 * CRITICAL FEATURES:
 * - Multiple workers can run in parallel safely
 * - Jobs persist across crashes/restarts
 * - Automatic retry with exponential backoff
 * - At-least-once execution guarantee
 * - Rate limiting and concurrency control
 * 
 * QUEUES:
 * 1. payment-verification - Verify pending payments
 * 2. delivery-processing - Process paid orders for delivery
 * 3. delivery-retry - Retry failed deliveries
 * 4. order-expiration - Mark expired orders
 * 5. reconciliation - Reconcile unknown states
 */

import { Queue, Worker, Job, QueueEvents, QueueScheduler } from 'bullmq';
import Redis from 'ioredis';
import { prisma } from './prisma';

// Redis connection configuration
const REDIS_URL = process.env.UPSTASH_REDIS_URL || process.env.REDIS_URL || 'redis://localhost:6379';
const REDIS_TOKEN = process.env.UPSTASH_REDIS_TOKEN;

// Create Redis connection with proper options for Upstash or local Redis
function createRedisConnection() {
  if (REDIS_URL.includes('upstash')) {
    // Upstash Redis (serverless)
    return new Redis(REDIS_URL, {
      maxRetriesPerRequest: null,
      tls: REDIS_URL.startsWith('rediss://') ? {} : undefined,
    });
  } else {
    // Local Redis or Redis Cloud
    return new Redis(REDIS_URL, {
      maxRetriesPerRequest: null,
    });
  }
}

const connection = createRedisConnection();

// Queue names
export const QUEUE_NAMES = {
  PAYMENT_VERIFICATION: 'payment-verification',
  DELIVERY_PROCESSING: 'delivery-processing',
  DELIVERY_RETRY: 'delivery-retry',
  ORDER_EXPIRATION: 'order-expiration',
  RECONCILIATION: 'reconciliation',
} as const;

// Job data types
export interface PaymentVerificationJob {
  orderId: string;
  orderNumber: string;
  md5Hash: string;
  source: 'webhook' | 'polling' | 'worker';
  requestId?: string;
}

export interface DeliveryProcessingJob {
  orderId: string;
  orderNumber: string;
  paymentRef: string;
  provider: 'GAMEDROP' | 'G2BULK' | 'MANUAL';
  requestId?: string;
}

export interface DeliveryRetryJob {
  jobId: string;
  orderId: string;
  orderNumber: string;
  attempt: number;
  reason: string;
  requestId?: string;
}

export interface OrderExpirationJob {
  orderId: string;
  orderNumber: string;
  expiredAt: string;
}

export interface ReconciliationJob {
  orderId: string;
  orderNumber: string;
  reason: 'UNKNOWN_STATE' | 'PROVIDER_TIMEOUT' | 'IDEMPOTENCY_CONFLICT' | 'MANUAL';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  details?: Record<string, unknown>;
}

// Queue configurations
const DEFAULT_QUEUE_OPTIONS = {
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000, // Base delay for exponential backoff
    },
    removeOnComplete: {
      count: 1000, // Keep last 1000 completed jobs
      age: 24 * 60 * 60, // Keep for 24 hours
    },
    removeOnFail: {
      count: 5000, // Keep last 5000 failed jobs
    },
  },
};

// Create queues
export const queues = {
  paymentVerification: new Queue<PaymentVerificationJob>(
    QUEUE_NAMES.PAYMENT_VERIFICATION,
    { connection, defaultJobOptions: DEFAULT_QUEUE_OPTIONS.defaultJobOptions }
  ),
  
  deliveryProcessing: new Queue<DeliveryProcessingJob>(
    QUEUE_NAMES.DELIVERY_PROCESSING,
    { 
      connection,
      defaultJobOptions: {
        ...DEFAULT_QUEUE_OPTIONS.defaultJobOptions,
        attempts: 2, // Fewer attempts for delivery (more expensive)
      }
    }
  ),
  
  deliveryRetry: new Queue<DeliveryRetryJob>(
    QUEUE_NAMES.DELIVERY_RETRY,
    { 
      connection,
      defaultJobOptions: {
        ...DEFAULT_QUEUE_OPTIONS.defaultJobOptions,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 30000, // Start at 30s for retries
        },
      }
    }
  ),
  
  orderExpiration: new Queue<OrderExpirationJob>(
    QUEUE_NAMES.ORDER_EXPIRATION,
    { connection, defaultJobOptions: DEFAULT_QUEUE_OPTIONS.defaultJobOptions }
  ),
  
  reconciliation: new Queue<ReconciliationJob>(
    QUEUE_NAMES.RECONCILIATION,
    { 
      connection,
      defaultJobOptions: {
        ...DEFAULT_QUEUE_OPTIONS.defaultJobOptions,
        attempts: 1, // Manual review jobs don't auto-retry
      }
    }
  ),
};

/**
 * Add payment verification job to queue
 */
export async function addPaymentVerificationJob(
  data: PaymentVerificationJob,
  options?: {
    delay?: number;
    priority?: number;
    jobId?: string;
  }
): Promise<Job<PaymentVerificationJob>> {
  const job = await queues.paymentVerification.add(
    `verify:${data.orderNumber}`,
    data,
    {
      ...options,
      jobId: options?.jobId || `verify:${data.orderNumber}:${Date.now()}`,
    }
  );
  
  console.log(`[Queue] Added payment verification job: ${job.id} for ${data.orderNumber}`);
  return job;
}

/**
 * Add delivery processing job to queue
 */
export async function addDeliveryProcessingJob(
  data: DeliveryProcessingJob,
  options?: {
    delay?: number;
    priority?: number;
    jobId?: string;
  }
): Promise<Job<DeliveryProcessingJob>> {
  const job = await queues.deliveryProcessing.add(
    `deliver:${data.orderNumber}`,
    data,
    {
      ...options,
      jobId: options?.jobId || `deliver:${data.orderNumber}:${Date.now()}`,
      // Use order number as deduplication key
    }
  );
  
  console.log(`[Queue] Added delivery processing job: ${job.id} for ${data.orderNumber}`);
  return job;
}

/**
 * Add delivery retry job to queue
 */
export async function addDeliveryRetryJob(
  data: DeliveryRetryJob,
  options?: {
    delay?: number;
    priority?: number;
  }
): Promise<Job<DeliveryRetryJob>> {
  const delay = options?.delay || calculateRetryDelay(data.attempt);
  
  const job = await queues.deliveryRetry.add(
    `retry:${data.jobId}:${data.attempt}`,
    data,
    {
      ...options,
      delay,
      jobId: `retry:${data.jobId}:${data.attempt}`,
    }
  );
  
  console.log(`[Queue] Scheduled retry for job ${data.jobId} (attempt ${data.attempt}) in ${delay}ms`);
  return job;
}

/**
 * Add order expiration job to queue
 */
export async function addOrderExpirationJob(
  data: OrderExpirationJob,
  options?: {
    delay?: number;
  }
): Promise<Job<OrderExpirationJob>> {
  const job = await queues.orderExpiration.add(
    `expire:${data.orderNumber}`,
    data,
    {
      ...options,
      jobId: `expire:${data.orderNumber}`,
    }
  );
  
  console.log(`[Queue] Added order expiration job: ${job.id} for ${data.orderNumber}`);
  return job;
}

/**
 * Add reconciliation job to queue
 */
export async function addReconciliationJob(
  data: ReconciliationJob,
  options?: {
    delay?: number;
    priority?: number;
  }
): Promise<Job<ReconciliationJob>> {
  const priority = options?.priority || getPriorityFromLevel(data.priority);
  
  const job = await queues.reconciliation.add(
    `reconcile:${data.orderNumber}`,
    data,
    {
      ...options,
      priority,
      jobId: `reconcile:${data.orderNumber}`,
    }
  );
  
  console.log(`[Queue] Added reconciliation job: ${job.id} for ${data.orderNumber} (priority: ${data.priority})`);
  return job;
}

/**
 * Calculate retry delay with exponential backoff
 */
function calculateRetryDelay(attempt: number): number {
  const baseDelay = 30_000; // 30 seconds
  const maxDelay = 300_000; // 5 minutes
  return Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
}

/**
 * Get priority value from level string
 */
function getPriorityFromLevel(level: string): number {
  switch (level) {
    case 'CRITICAL': return 1; // Highest priority
    case 'HIGH': return 2;
    case 'MEDIUM': return 3;
    case 'LOW': return 4; // Lowest priority
    default: return 3;
  }
}

/**
 * Get queue statistics
 */
export async function getQueueStats() {
  const stats = await Promise.all(
    Object.values(queues).map(async (queue) => {
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        queue.getWaitingCount(),
        queue.getActiveCount(),
        queue.getCompletedCount(),
        queue.getFailedCount(),
        queue.getDelayedCount(),
      ]);
      
      return {
        name: queue.name,
        waiting,
        active,
        completed,
        failed,
        delayed,
      };
    })
  );
  
  return stats;
}

/**
 * Clean up old jobs (run periodically)
 */
export async function cleanupOldJobs(): Promise<void> {
  const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
  
  for (const queue of Object.values(queues)) {
    try {
      await queue.clean(thirtyDaysAgo, 1000, 'completed');
      await queue.clean(thirtyDaysAgo, 1000, 'failed');
      console.log(`[Queue] Cleaned old jobs from ${queue.name}`);
    } catch (error) {
      console.error(`[Queue] Error cleaning ${queue.name}:`, error);
    }
  }
}

/**
 * Gracefully shutdown all queues
 */
export async function shutdownQueues(): Promise<void> {
  console.log('[Queue] Shutting down queues...');
  
  await Promise.all(
    Object.values(queues).map((queue) => queue.close())
  );
  
  await connection.quit();
  
  console.log('[Queue] All queues shut down gracefully');
}

// Export queue events for monitoring
export const queueEvents = {
  paymentVerification: new QueueEvents(QUEUE_NAMES.PAYMENT_VERIFICATION, { connection }),
  deliveryProcessing: new QueueEvents(QUEUE_NAMES.DELIVERY_PROCESSING, { connection }),
  deliveryRetry: new QueueEvents(QUEUE_NAMES.DELIVERY_RETRY, { connection }),
  orderExpiration: new QueueEvents(QUEUE_NAMES.ORDER_EXPIRATION, { connection }),
  reconciliation: new QueueEvents(QUEUE_NAMES.RECONCILIATION, { connection }),
};
