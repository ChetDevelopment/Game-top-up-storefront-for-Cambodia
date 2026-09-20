import { Redis } from "@upstash/redis";
import { createModuleLogger } from "./logger-pino";

const log = createModuleLogger("redis");

let redisInstance: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redisInstance) {
    const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.UPSTASH_REDIS_URL;
    const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.UPSTASH_REDIS_TOKEN;

    if (!redisUrl || !redisToken) {
      log.error("Upstash Redis credentials not configured");
      throw new Error("REDIS_CONFIG_ERROR: Upstash Redis credentials required");
    }

    redisInstance = new Redis({
      url: redisUrl,
      token: redisToken,
      automaticDeserialization: false,
    });
  }

  return redisInstance;
}

export function isRedisConfigured(): boolean {
  return !!(process.env.UPSTASH_REDIS_REST_URL || process.env.UPSTASH_REDIS_URL) &&
         !!(process.env.UPSTASH_REDIS_REST_TOKEN || process.env.UPSTASH_REDIS_TOKEN);
}

export async function withRedisFallback<T>(
  operation: () => Promise<T>,
  fallback?: T
): Promise<T | null> {
  if (!isRedisConfigured()) {
    return fallback ?? null;
  }

  try {
    return await operation();
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    log.warn("Redis operation failed", { error: errMsg });
    return fallback ?? null;
  }
}

export async function shutdownRedis(): Promise<void> {
  if (redisInstance) {
    redisInstance = null;
    log.info("Redis shutdown complete");
  }
}
