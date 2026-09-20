/**
 * Idempotency Protection System
 * 
 * Prevents duplicate orders and duplicate delivery
 * Ensures each payment is processed exactly once
 */

import { hashSha256 } from "./encryption";
import { prisma } from "./prisma";

export interface IdempotencyKeyOptions {
  orderNumber?: string;
  paymentRef?: string;
  payload: Record<string, unknown>;
}

/**
 * Generate idempotency key from request payload
 * Format: idem_{hash(prefix)}_{hash(payload)}
 */
export function generateIdempotencyKey(options: IdempotencyKeyOptions): string {
  const prefix = options.orderNumber || options.paymentRef || Date.now().toString();
  const payloadStr = JSON.stringify(options.payload);
  
  const prefixHash = hashSha256(prefix).slice(0, 16);
  const payloadHash = hashSha256(payloadStr).slice(0, 16);
  
  return `idem_${prefixHash}_${payloadHash}`;
}

/**
 * Check and record idempotency key atomically
 * Returns true if this is the first request with this key
 * Returns false if duplicate (request already processed)
 */
export async function checkIdempotency(
  idempotencyKey: string,
  orderId: string
): Promise<{ isFirst: boolean; existingOrder?: string }> {
  try {
    // Try to create idempotency record (unique constraint will prevent duplicates)
    await prisma.idempotencyKey.create({
      data: {
        key: idempotencyKey,
        orderId,
        status: 'PENDING',
      },
    });
    
    return { isFirst: true };
  } catch (error: any) {
    // Unique constraint violation = duplicate request
    if (error.code === 'P2002') {
      const existing = await prisma.idempotencyKey.findUnique({
        where: { key: idempotencyKey },
        select: { orderId: true, status: true, response: true },
      });
      
      return {
        isFirst: false,
        existingOrder: existing?.orderId || undefined,
      };
    }
    
    // Other errors - log and allow (fail-safe)
    console.error('[Idempotency] Error checking key:', error);
    return { isFirst: true };
  }
}

/**
 * Mark idempotency key as completed with response
 */
export async function completeIdempotency(
  idempotencyKey: string,
  response: Record<string, unknown>
): Promise<void> {
  await prisma.idempotencyKey.update({
    where: { key: idempotencyKey },
    data: {
      status: 'COMPLETED',
      response: response as any,
      completedAt: new Date(),
    },
  });
}

/**
 * Get cached response for duplicate request
 */
export async function getCachedResponse(
  idempotencyKey: string
): Promise<Record<string, unknown> | null> {
  const record = await prisma.idempotencyKey.findUnique({
    where: { key: idempotencyKey },
    select: { response: true, status: true },
  });
  
  if (record?.status === 'COMPLETED' && record.response) {
    return record.response as Record<string, unknown>;
  }
  
  return null;
}

/**
 * Clean up old idempotency keys (older than 24 hours)
 * Run this periodically in background
 */
export async function cleanupOldIdempotencyKeys(): Promise<number> {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  
  const result = await prisma.idempotencyKey.deleteMany({
    where: {
      createdAt: {
        lt: twentyFourHoursAgo,
      },
    },
  });
  
  return result.count;
}
