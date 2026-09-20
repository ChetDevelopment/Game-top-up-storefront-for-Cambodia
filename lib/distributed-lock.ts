/**
 * Distributed Locking System using Redis
 * 
 * CRITICAL FEATURES:
 * - Prevents multiple workers from processing same order
 * - Automatic lock expiration (prevents deadlocks)
 * - Lock renewal for long-running operations
 * - Works across multiple worker processes
 * 
 * USAGE:
 * const lock = await acquireLock(`order:${orderId}`, 'worker-1');
 * if (lock) {
 *   try {
 *     // Process order
 *   } finally {
 *     await releaseLock(lock);
 *   }
 * }
 */

import Redis from 'ioredis';
import { v4 as uuidv4 } from 'crypto';

const REDIS_URL = process.env.UPSTASH_REDIS_URL || process.env.REDIS_URL || 'redis://localhost:6379';

function createRedisConnection() {
  if (REDIS_URL.includes('upstash')) {
    return new Redis(REDIS_URL, {
      maxRetriesPerRequest: null,
      tls: REDIS_URL.startsWith('rediss://') ? {} : undefined,
    });
  } else {
    return new Redis(REDIS_URL, {
      maxRetriesPerRequest: null,
    });
  }
}

const redis = createRedisConnection();

// Lock configuration
const DEFAULT_LOCK_TTL_MS = 30_000; // 30 seconds
const LOCK_RENEWAL_INTERVAL_MS = 10_000; // Renew every 10 seconds
const MAX_LOCK_RETRIES = 3;

export interface Lock {
  key: string;
  value: string;
  expiresAt: number;
  renewalInterval?: NodeJS.Timeout;
}

/**
 * Acquire a distributed lock
 * Returns null if lock cannot be acquired (already held by another worker)
 */
export async function acquireLock(
  resource: string,
  ownerId: string,
  ttlMs: number = DEFAULT_LOCK_TTL_MS
): Promise<Lock | null> {
  const lockKey = `lock:${resource}`;
  const lockValue = `${ownerId}:${Date.now()}:${uuidv4()}`;
  
  let retries = 0;
  while (retries < MAX_LOCK_RETRIES) {
    try {
      // Try to set lock with NX (only if not exists)
      const result = await redis.set(lockKey, lockValue, 'PX', ttlMs, 'NX');
      
      if (result === 'OK') {
        const lock: Lock = {
          key: lockKey,
          value: lockValue,
          expiresAt: Date.now() + ttlMs,
        };
        
        console.log(`[Lock] Acquired lock for ${resource} (owner: ${ownerId})`);
        return lock;
      }
      
      // Lock already exists
      retries++;
      if (retries < MAX_LOCK_RETRIES) {
        // Wait a bit before retrying
        await sleep(100 * retries);
      }
    } catch (error) {
      console.error(`[Lock] Error acquiring lock for ${resource}:`, error);
      retries++;
    }
  }
  
  console.log(`[Lock] Failed to acquire lock for ${resource} after ${MAX_LOCK_RETRIES} retries`);
  return null;
}

/**
 * Release a distributed lock
 * IMPORTANT: Only the owner can release the lock
 */
export async function releaseLock(lock: Lock): Promise<boolean> {
  try {
    // Clear renewal interval if exists
    if (lock.renewalInterval) {
      clearInterval(lock.renewalInterval);
    }
    
    // Use Lua script to ensure atomicity (check value before deleting)
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    
    const result = await redis.eval(script, 1, lock.key, lock.value);
    
    if (result === 1) {
      console.log(`[Lock] Released lock for ${lock.key}`);
      return true;
    } else {
      console.warn(`[Lock] Lock ${lock.key} was not released (may have expired or stolen)`);
      return false;
    }
  } catch (error) {
    console.error(`[Lock] Error releasing lock ${lock.key}:`, error);
    return false;
  }
}

/**
 * Start automatic lock renewal
 * Prevents lock from expiring during long operations
 */
export function startLockRenewal(
  lock: Lock,
  ttlMs: number = DEFAULT_LOCK_TTL_MS
): void {
  if (lock.renewalInterval) {
    clearInterval(lock.renewalInterval);
  }
  
  lock.renewalInterval = setInterval(async () => {
    try {
      // Only renew if lock is still valid
      const remaining = lock.expiresAt - Date.now();
      if (remaining < ttlMs / 2) {
        // Extend lock
        const script = `
          if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("pexpire", KEYS[1], ARGV[2])
          else
            return 0
          end
        `;
        
        const result = await redis.eval(script, 1, lock.key, lock.value, ttlMs.toString());
        
        if (result === 1) {
          lock.expiresAt = Date.now() + ttlMs;
          console.log(`[Lock] Renewed lock for ${lock.key}`);
        } else {
          // Lock was lost
          console.warn(`[Lock] Lost lock for ${lock.key} during renewal`);
          if (lock.renewalInterval) {
            clearInterval(lock.renewalInterval);
          }
        }
      }
    } catch (error) {
      console.error(`[Lock] Error renewing lock ${lock.key}:`, error);
    }
  }, LOCK_RENEWAL_INTERVAL_MS);
}

/**
 * Check if a resource is currently locked
 */
export async function isLocked(resource: string): Promise<boolean> {
  const lockKey = `lock:${resource}`;
  const exists = await redis.exists(lockKey);
  return exists === 1;
}

/**
 * Get lock owner (for debugging)
 */
export async function getLockOwner(resource: string): Promise<string | null> {
  const lockKey = `lock:${resource}`;
  const value = await redis.get(lockKey);
  return value;
}

/**
 * Force release a lock (admin operation - use with caution!)
 */
export async function forceReleaseLock(resource: string): Promise<boolean> {
  const lockKey = `lock:${resource}`;
  const result = await redis.del(lockKey);
  return result === 1;
}

/**
 * Execute a function with a lock (automatic acquire/release)
 */
export async function withLock<T>(
  resource: string,
  ownerId: string,
  fn: () => Promise<T>,
  options?: {
    ttlMs?: number;
    onLockFailed?: () => Promise<T | null>;
  }
): Promise<T | null> {
  const lock = await acquireLock(resource, ownerId, options?.ttlMs);
  
  if (!lock) {
    if (options?.onLockFailed) {
      return await options.onLockFailed();
    }
    return null;
  }
  
  try {
    // Start lock renewal for long operations
    startLockRenewal(lock, options?.ttlMs);
    
    // Execute the function
    const result = await fn();
    return result;
  } finally {
    // Always release lock
    await releaseLock(lock);
  }
}

/**
 * Clean up expired locks (run periodically)
 */
export async function cleanupExpiredLocks(): Promise<number> {
  // Redis automatically expires locks with TTL
  // This function is for manual cleanup if needed
  const keys = await redis.keys('lock:*');
  let cleaned = 0;
  
  for (const key of keys) {
    const ttl = await redis.pttl(key);
    if (ttl === -2) { // Key doesn't exist
      cleaned++;
    }
  }
  
  return cleaned;
}

/**
 * Gracefully shutdown lock system
 */
export async function shutdownLockSystem(): Promise<void> {
  console.log('[Lock] Shutting down lock system...');
  await redis.quit();
  console.log('[Lock] Lock system shut down');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
