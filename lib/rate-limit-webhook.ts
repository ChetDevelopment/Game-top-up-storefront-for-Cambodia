/**
 * Rate Limiting Middleware
 * 
 * Protects webhook endpoints from abuse using sliding window algorithm.
 * Uses Upstash Redis for distributed rate limiting.
 * 
 * WHY: Prevent:
 * - DDoS attacks on webhook endpoints
 * - Resource exhaustion from malicious actors
 * - Accidental webhook loops
 * 
 * BEFORE: No rate limiting on webhooks
 * AFTER: 100 requests/minute per IP with automatic blocking
 */

import { NextRequest, NextResponse } from 'next/server';
import { getRedisClient, isRedisConfigured, withRedisFallback } from './redis';

export interface RateLimitConfig {
  intervalMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
  blockDurationMs?: number; // How long to block after exceeding limit
}

const DEFAULT_CONFIG: RateLimitConfig = {
  intervalMs: 60 * 1000, // 1 minute
  maxRequests: 100, // 100 requests per minute
  blockDurationMs: 5 * 60 * 1000, // 5 minute block on abuse
};

/**
 * Get client IP from request headers (handles proxies)
 */
function getClientIP(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  const realIP = req.headers.get('x-real-ip');
  
  if (forwarded) {
    // x-forwarded-for can contain multiple IPs: client, proxy1, proxy2
    return forwarded.split(',')[0].trim();
  }
  
  if (realIP) {
    return realIP;
  }
  
  // Fallback to socket address (may be Vercel edge IP)
  return req.headers.get('x-vercel-forwarded-for') || 'unknown';
}

/**
 * Sliding window rate limiter using Redis
 * 
 * Algorithm:
 * 1. Create a sorted set with timestamp as score
 * 2. Remove old entries outside the window
 * 3. Count remaining entries
 * 4. Add current request
 * 5. Set TTL to auto-cleanup
 */
export async function checkRateLimit(
  identifier: string,
  config: Partial<RateLimitConfig> = {}
): Promise<{
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfter?: number;
  blocked: boolean;
}> {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  const now = Date.now();
  const windowStart = now - finalConfig.intervalMs;
  
  const redisKey = `ratelimit:${identifier}`;
  const blockKey = `ratelimit:blocked:${identifier}`;
  
  // Check if currently blocked
  if (finalConfig.blockDurationMs) {
    const isBlocked = await withRedisFallback(async () => {
      const redis = getRedisClient();
      return await redis.exists(blockKey);
    }, false);
    
    if (isBlocked) {
      const ttl = await withRedisFallback(async () => {
        const redis = getRedisClient();
        return await redis.pttl(blockKey);
      }, 0);
      
      return {
        allowed: false,
        remaining: 0,
        resetAt: now + (ttl || finalConfig.blockDurationMs),
        retryAfter: Math.ceil((ttl || finalConfig.blockDurationMs) / 1000),
        blocked: true,
      };
    }
  }
  
  // If Redis not configured, allow all (degraded mode)
  if (!isRedisConfigured()) {
    return {
      allowed: true,
      remaining: finalConfig.maxRequests,
      resetAt: now + finalConfig.intervalMs,
      blocked: false,
    };
  }
  
  try {
    const redis = getRedisClient();
    
    // Use Redis pipeline for atomic operations
    const pipeline = redis.pipeline();
    
    // Remove old entries
    pipeline.zremrangebyscore(redisKey, 0, windowStart);
    
    // Count current entries
    pipeline.zcard(redisKey);
    
    // Add current request with timestamp as score
    pipeline.zadd(redisKey, { score: now, member: `${now}-${Math.random()}` });
    
    // Set TTL for auto-cleanup
    pipeline.expire(redisKey, Math.ceil(finalConfig.intervalMs / 1000) + 1);
    
    // Execute pipeline
    const results = await pipeline.exec();
    
    // Results: [zremrangebyscore, zcard, zadd, expire]
    const requestCount = (results[1] as number);
    
    const remaining = Math.max(0, finalConfig.maxRequests - requestCount - 1);
    const resetAt = now + finalConfig.intervalMs;
    
    // Check if limit exceeded
    if (requestCount >= finalConfig.maxRequests) {
      // Block the IP
      if (finalConfig.blockDurationMs) {
        await redis.setex(blockKey, Math.ceil(finalConfig.blockDurationMs / 1000), 'blocked');
      }
      
      return {
        allowed: false,
        remaining: 0,
        resetAt: now + finalConfig.blockDurationMs,
        retryAfter: Math.ceil(finalConfig.blockDurationMs / 1000),
        blocked: true,
      };
    }
    
    return {
      allowed: true,
      remaining,
      resetAt,
      blocked: false,
    };
  } catch (error) {
    console.error('[RateLimit] Redis error:', error);
    // Fail open - allow request but log error
    return {
      allowed: true,
      remaining: finalConfig.maxRequests,
      resetAt: now + finalConfig.intervalMs,
      blocked: false,
    };
  }
}

/**
 * Rate limit middleware for Next.js API routes
 */
export function createRateLimitMiddleware(config: Partial<RateLimitConfig> = {}) {
  return async function rateLimitMiddleware(req: NextRequest): Promise<NextResponse | null> {
    const clientIP = getClientIP(req);
    const result = await checkRateLimit(clientIP, config);
    
    if (!result.allowed) {
      const response = NextResponse.json(
        {
          error: 'Too Many Requests',
          message: result.blocked 
            ? 'IP temporarily blocked due to excessive requests' 
            : 'Rate limit exceeded',
          retryAfter: result.retryAfter,
        },
        { status: 429 }
      );
      
      // Add rate limit headers
      response.headers.set('Retry-After', String(result.retryAfter || 60));
      response.headers.set('X-RateLimit-Limit', String(config.maxRequests || DEFAULT_CONFIG.maxRequests));
      response.headers.set('X-RateLimit-Remaining', '0');
      response.headers.set('X-RateLimit-Reset', String(result.resetAt));
      
      return response;
    }
    
    // Add rate limit headers to successful responses
    const response = NextResponse.next();
    response.headers.set('X-RateLimit-Limit', String(config.maxRequests || DEFAULT_CONFIG.maxRequests));
    response.headers.set('X-RateLimit-Remaining', String(result.remaining));
    response.headers.set('X-RateLimit-Reset', String(result.resetAt));
    
    return response;
  };
}

/**
 * Rate limit decorator for API route handlers
 */
export async function withRateLimit<T>(
  handler: () => Promise<T>,
  identifier: string,
  config: Partial<RateLimitConfig> = {}
): Promise<{ result: T; headers: Record<string, string> } | { error: string; status: number; headers: Record<string, string> }> {
  const result = await checkRateLimit(identifier, config);
  
  const headers: Record<string, string> = {
    'X-RateLimit-Limit': String(config.maxRequests || DEFAULT_CONFIG.maxRequests),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(result.resetAt),
  };
  
  if (!result.allowed) {
    headers['Retry-After'] = String(result.retryAfter || 60);
    return {
      error: result.blocked ? 'IP blocked' : 'Rate limit exceeded',
      status: 429,
      headers,
    };
  }
  
  try {
    const handlerResult = await handler();
    return { result: handlerResult, headers };
  } catch (error) {
    throw error;
  }
}
