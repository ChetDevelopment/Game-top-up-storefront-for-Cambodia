/**
 * Heartbeat-Based Distributed Lock with Fencing Tokens
 * 
 * CRITICAL IMPROVEMENTS over simple TTL lock:
 * 1. Heartbeat mechanism - lock doesn't expire while worker is alive
 * 2. Fencing tokens - stale workers cannot act after lock loss
 * 3. Automatic cleanup - locks released when worker dies
 * 
 * USAGE:
 * const session = await acquireLockWithHeartbeat(`order:${orderId}`, workerId);
 * if (session) {
 *   try {
 *     // Check fencing token before each operation
 *     if (!session.isValid()) {
 *       throw new Error('Lock lost');
 *     }
 *     // Process order
 *   } finally {
 *     await session.release();
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
const INITIAL_LOCK_TTL_MS = 30_000; // 30 seconds
const HEARTBEAT_INTERVAL_MS = 10_000; // Heartbeat every 10 seconds
const MAX_HEARTBEAT_RETRIES = 3;

export interface LockSession {
  resource: string;
  ownerId: string;
  fencingToken: number;
  expiresAt: number;
  heartbeatInterval?: NodeJS.Timeout;
  isReleased: boolean;
}

/**
 * Get next fencing token (monotonically increasing)
 */
async function getNextFencingToken(resource: string): Promise<number> {
  const key = `fencing:${resource}`;
  const token = await redis.incr(key);
  await redis.expire(key, 3600); // Expire after 1 hour
  return token;
}

/**
 * Acquire lock with heartbeat mechanism
 */
export async function acquireLockWithHeartbeat(
  resource: string,
  ownerId: string,
  ttlMs: number = INITIAL_LOCK_TTL_MS
): Promise<LockSession | null> {
  const lockKey = `lock:${resource}`;
  const fencingToken = await getNextFencingToken(resource);
  const lockValue = JSON.stringify({
    ownerId,
    fencingToken,
    acquiredAt: Date.now(),
  });
  
  let retries = 0;
  while (retries < 3) {
    try {
      // Try to acquire lock
      const result = await redis.set(lockKey, lockValue, 'PX', ttlMs, 'NX');
      
      if (result === 'OK') {
        const session: LockSession = {
          resource,
          ownerId,
          fencingToken,
          expiresAt: Date.now() + ttlMs,
          isReleased: false,
        };
        
        // Start heartbeat
        startHeartbeat(session, ttlMs);
        
        console.log(`[Lock] Acquired lock for ${resource} with fencing token ${fencingToken}`);
        return session;
      }
      
      // Lock already exists
      retries++;
      if (retries < 3) {
        await sleep(100 * retries);
      }
    } catch (error) {
      console.error(`[Lock] Error acquiring lock for ${resource}:`, error);
      retries++;
    }
  }
  
  console.log(`[Lock] Failed to acquire lock for ${resource} after 3 retries`);
  return null;
}

/**
 * Start automatic heartbeat to keep lock alive
 */
function startHeartbeat(session: LockSession, ttlMs: number): void {
  if (session.heartbeatInterval) {
    clearInterval(session.heartbeatInterval);
  }
  
  session.heartbeatInterval = setInterval(async () => {
    if (session.isReleased) {
      clearInterval(session.heartbeatInterval!);
      return;
    }
    
    try {
      const lockKey = `lock:${session.resource}`;
      const currentValue = await redis.get(lockKey);
      
      if (!currentValue) {
        console.warn(`[Lock] Lock ${session.resource} expired despite heartbeat`);
        clearInterval(session.heartbeatInterval!);
        return;
      }
      
      const lockData = JSON.parse(currentValue);
      if (lockData.ownerId !== session.ownerId) {
        console.warn(`[Lock] Lock ${session.resource} stolen by ${lockData.ownerId}`);
        clearInterval(session.heartbeatInterval!);
        return;
      }
      
      // Renew lock
      await redis.pexpire(lockKey, ttlMs);
      session.expiresAt = Date.now() + ttlMs;
      
      console.log(`[Lock] Heartbeat for ${session.resource} (token: ${session.fencingToken})`);
    } catch (error) {
      console.error(`[Lock] Heartbeat failed for ${session.resource}:`, error);
    }
  }, HEARTBEAT_INTERVAL_MS);
}

/**
 * Check if lock session is still valid
 */
export function isLockValid(session: LockSession): boolean {
  if (session.isReleased) {
    return false;
  }
  
  if (session.expiresAt < Date.now()) {
    return false;
  }
  
  return true;
}

/**
 * Validate fencing token before operation
 * Returns false if worker has lost lock
 */
export async function validateFencingToken(
  resource: string,
  expectedToken: number
): Promise<boolean> {
  const lockKey = `lock:${resource}`;
  const currentValue = await redis.get(lockKey);
  
  if (!currentValue) {
    return false; // Lock doesn't exist
  }
  
  try {
    const lockData = JSON.parse(currentValue);
    return lockData.fencingToken === expectedToken;
  } catch {
    return false;
  }
}

/**
 * Release lock
 */
export async function releaseLock(session: LockSession): Promise<boolean> {
  if (session.isReleased) {
    return false; // Already released
  }
  
  // Stop heartbeat
  if (session.heartbeatInterval) {
    clearInterval(session.heartbeatInterval);
  }
  
  const lockKey = `lock:${session.resource}`;
  const currentValue = await redis.get(lockKey);
  
  if (!currentValue) {
    session.isReleased = true;
    return false; // Lock already expired
  }
  
  try {
    const lockData = JSON.parse(currentValue);
    
    if (lockData.ownerId !== session.ownerId) {
      session.isReleased = true;
      return false; // Lock owned by different worker
    }
    
    if (lockData.fencingToken !== session.fencingToken) {
      session.isReleased = true;
      return false; // Fencing token mismatch (newer owner)
    }
    
    // Release lock
    await redis.del(lockKey);
    session.isReleased = true;
    
    console.log(`[Lock] Released lock for ${session.resource} (token: ${session.fencingToken})`);
    return true;
  } catch {
    session.isReleased = true;
    return false;
  }
}

/**
 * Execute function with lock (automatic acquire/release)
 */
export async function withLockSession<T>(
  resource: string,
  ownerId: string,
  fn: (session: LockSession) => Promise<T>,
  options?: {
    ttlMs?: number;
    onLockFailed?: () => Promise<T | null>;
  }
): Promise<T | null> {
  const session = await acquireLockWithHeartbeat(resource, ownerId, options?.ttlMs);
  
  if (!session) {
    if (options?.onLockFailed) {
      return await options.onLockFailed();
    }
    return null;
  }
  
  try {
    const result = await fn(session);
    return result;
  } finally {
    await releaseLock(session);
  }
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
