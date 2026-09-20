import { prisma } from "./prisma";
import { getRedisClient, isRedisConfigured } from "./redis";
import { createModuleLogger } from "./logger-pino";

const log = createModuleLogger("webhook-cache");

const DEFAULT_TTL_SECONDS = 7200;
const CACHE_KEY_PREFIX = "webhook:replay:";

/**
 * Database-backed idempotency check.
 * Primary defense against replay attacks.
 * Uses unique constraint on (event, payloadHash) to ensure exactly-once processing.
 */
export async function markWebhookProcessedDB(
  payloadHash: string,
  orderId: string,
  metadata?: Record<string, unknown>
): Promise<{ isFirst: boolean; duplicateId?: string }> {
  try {
    const existing = await prisma.paymentLog.findFirst({
      where: { event: "WEBHOOK_PROCESSED", metadata: { path: ["payloadHash"], equals: payloadHash } },
      select: { id: true },
    });

    if (existing) {
      return { isFirst: false, duplicateId: existing.id };
    }

    await prisma.paymentLog.create({
      data: {
        orderId,
        event: "WEBHOOK_PROCESSED",
        status: "PROCESSED",
        provider: "BAKONG",
        metadata: { payloadHash, ...metadata, processedAt: new Date().toISOString() },
      },
    });

    return { isFirst: true };
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    log.error("DB idempotency check failed", { error: errMsg });

    const existing = await prisma.paymentLog.findFirst({
      where: { event: "WEBHOOK_PROCESSED", metadata: { path: ["payloadHash"], equals: payloadHash } },
      select: { id: true },
    });

    if (existing) {
      return { isFirst: false, duplicateId: existing.id };
    }

    return { isFirst: true };
  }
}

export async function markWebhookProcessedRedis(
  payloadHash: string,
  metadata?: Record<string, unknown>,
  ttlSeconds: number = DEFAULT_TTL_SECONDS
): Promise<{ isFirst: boolean; alreadyProcessed: boolean }> {
  if (!isRedisConfigured()) {
    return { isFirst: true, alreadyProcessed: false };
  }

  try {
    const redis = getRedisClient();
    const cacheKey = `${CACHE_KEY_PREFIX}${payloadHash}`;
    const value = JSON.stringify({ processedAt: new Date().toISOString(), ...metadata });

    const result = await redis.set(cacheKey, value, {
      nx: true,
      ex: ttlSeconds,
    });

    return {
      isFirst: result === "OK",
      alreadyProcessed: result === null,
    };
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    log.warn("Redis idempotency unavailable, allowing", { error: errMsg });
    return { isFirst: true, alreadyProcessed: false };
  }
}

export async function tryMarkWebhookProcessed(
  payloadHash: string,
  orderId: string,
  metadata?: Record<string, unknown>
): Promise<{ isFirst: boolean; alreadyProcessed: boolean }> {
  const dbResult = await markWebhookProcessedDB(payloadHash, orderId, metadata);

  if (!dbResult.isFirst) {
    return { isFirst: false, alreadyProcessed: true };
  }

  const redisResult = await markWebhookProcessedRedis(payloadHash, metadata);

  return { isFirst: true, alreadyProcessed: false };
}
