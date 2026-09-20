import { NextRequest, NextResponse } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.UPSTASH_REDIS_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.UPSTASH_REDIS_TOKEN;

const redis = redisUrl && redisToken
  ? new Redis({ url: redisUrl, token: redisToken })
  : null;

const fallbackStore: Map<string, { count: number; resetTime: number }> = new Map();

export const RATE_LIMITS = {
  LOGIN: { windowMs: 60 * 1000, maxRequests: 5 },
  REGISTER: { windowMs: 60 * 1000, maxRequests: 3 },
  ORDERS: { windowMs: 60 * 1000, maxRequests: 10 },
  PUBLIC_API: { windowMs: 60 * 1000, maxRequests: 60 },
  ADMIN_API: { windowMs: 60 * 1000, maxRequests: 30 },
  USER_API: { windowMs: 60 * 1000, maxRequests: 30 },
  WEBHOOK: { windowMs: 60 * 1000, maxRequests: 100 },
  PAYMENT: { windowMs: 60 * 1000, maxRequests: 15 },
} as const;

export interface RateLimitConfig {
  windowMs?: number;
  maxRequests?: number;
  keyGenerator?: (req: NextRequest) => string;
}

function createRateLimiter(config: { windowMs: number; maxRequests: number }) {
  if (redis) {
    return new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(config.maxRequests, `${config.windowMs} ms`),
      analytics: true,
      prefix: "tykhai_ratelimit",
    });
  }
  return null;
}

export function rateLimit(config: RateLimitConfig = {}) {
  const {
    windowMs = 60 * 1000,
    maxRequests = 60,
    keyGenerator = (req) => {
      const forwarded = req.headers.get("x-forwarded-for");
      const ip = forwarded ? forwarded.split(",")[0]?.trim() : "unknown";
      return `${ip}:${req.nextUrl.pathname}`;
    },
  } = config;

  const redisLimiter = createRateLimiter({ windowMs, maxRequests });

  return async function rateLimitMiddleware(req: NextRequest): Promise<NextResponse | null> {
    const key = keyGenerator(req);
    const forwarded = req.headers.get("x-forwarded-for");
    const ip = forwarded ? forwarded.split(",")[0]?.trim() : "unknown";

    if (redisLimiter) {
      try {
        const { success, limit, remaining, reset } = await redisLimiter.limit(key);
        if (!success) {
          return NextResponse.json(
            { error: "Too many requests. Please try again later." },
            {
              status: 429,
              headers: {
                "Retry-After": Math.ceil((reset - Date.now()) / 1000).toString(),
                "X-RateLimit-Limit": limit.toString(),
                "X-RateLimit-Remaining": "0",
                "X-RateLimit-Reset": new Date(reset).toISOString(),
              },
            }
          );
        }
        return null;
      } catch (error) {
        console.error("Rate limit error (Redis), falling back to memory:", error);
      }
    }

    const now = Date.now();
    const existing = fallbackStore.get(key);

    if (!existing || existing.resetTime < now) {
      fallbackStore.set(key, { count: 1, resetTime: now + windowMs });
      return null;
    }

    existing.count++;

    if (existing.count > maxRequests) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        {
          status: 429,
          headers: {
            "Retry-After": Math.ceil((existing.resetTime - now) / 1000).toString(),
            "X-RateLimit-Limit": maxRequests.toString(),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": new Date(existing.resetTime).toISOString(),
          },
        }
      );
    }

    return null;
  };
}

const blockedIPs: Map<string, number> = new Map();
const BLOCK_DURATION = 15 * 60 * 1000;

export function checkIPBlock(req: NextRequest): NextResponse | null {
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0]?.trim() : "unknown";

  if (ip === "127.0.0.1" || ip === "::1" || ip === "localhost" || process.env.NODE_ENV === "development") {
    return null;
  }

  const blockedUntil = blockedIPs.get(ip);
  if (blockedUntil && blockedUntil > Date.now()) {
    return NextResponse.json(
      { error: "IP temporarily blocked due to suspicious activity" },
      { status: 403 }
    );
  }
  return null;
}

export function blockIP(ip: string) {
  if (ip === "127.0.0.1" || ip === "::1" || ip === "localhost" || process.env.NODE_ENV === "development") {
    return;
  }
  blockedIPs.set(ip, Date.now() + BLOCK_DURATION);
}

// Only setup interval cleanup in non-serverless environments
if (typeof setInterval !== "undefined" && typeof process !== "undefined" && !process.env.VERCEL) {
  setInterval(() => {
    const now = Date.now();
    for (const [key, value] of fallbackStore.entries()) {
      if (value.resetTime < now) fallbackStore.delete(key);
    }
    for (const [ip, until] of blockedIPs.entries()) {
      if (until < now) blockedIPs.delete(ip);
    }
  }, 60 * 1000);
}

export const adminApiRateLimit = rateLimit(RATE_LIMITS.ADMIN_API);
export const userApiRateLimit = rateLimit(RATE_LIMITS.USER_API);
export const loginApiRateLimit = rateLimit(RATE_LIMITS.LOGIN);
export const ordersApiRateLimit = rateLimit(RATE_LIMITS.ORDERS);
export const paymentApiRateLimit = rateLimit(RATE_LIMITS.PAYMENT);
