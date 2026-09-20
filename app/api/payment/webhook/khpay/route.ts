import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import {
  checkKHPayPayment,
  validateKHPayAmount,
  verifyKHPayWebhookSignature,
} from "@/lib/khpay";
import { processDeliveryQueue } from "@/lib/payment";
import { notifyTelegram, escapeHtml } from "@/lib/telegram";
import { sanitizeInput, isSuspiciousRequest, logSecurityEvent } from "@/lib/security";
import { hashSha256 } from "@/lib/encryption";
import { markOrderAsPaid } from "@/lib/payment-state-machine";
import { checkRateLimit } from "@/lib/rate-limit-webhook";
import { tryMarkWebhookProcessed } from "@/lib/webhook-cache";
import { isAllowedProviderIP, extractClientIP } from "@/lib/webhook-ip-allowlist";

// Rate limit configuration: 100 requests/minute per IP
const WEBHOOK_RATE_LIMIT = {
  intervalMs: 60 * 1000,
  maxRequests: 100,
  blockDurationMs: 5 * 60 * 1000,
};

// Request body size limit: 1MB
const MAX_BODY_SIZE = 1024 * 1024;

/**
 * POST /api/payment/webhook/khpay
 * 
 * KHPay Webhook Handler
 * KHPay sends payment notifications here
 * 
 * Security:
 * - IP allowlisting
 * - HMAC-SHA256 signature verification
 * - Rate limiting
 * - Replay protection
 * - Amount validation
 */
export async function POST(req: NextRequest) {
  const startTime = Date.now();
  const requestId = `khpay_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  
  console.log(`[KHPay Webhook] [${requestId}] ======= WEBHOOK RECEIVED =======`);
  
  // Security check: suspicious patterns
  if (isSuspiciousRequest(req)) {
    await logSecurityEvent("KHPAY_SUSPICIOUS_WEBHOOK", { url: req.url, requestId }, req);
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  
  // Security check: IP allowlisting
  const ipCheck = isAllowedProviderIP(req, 'KHPAY');
  if (!ipCheck.allowed) {
    const ipRangesConfigured = process.env.KHPAY_IP_RANGES && process.env.KHPAY_IP_RANGES.length > 0;
    
    if (ipRangesConfigured) {
      console.warn(`[KHPay Webhook] [${requestId}] IP not allowed (ranges configured):`, ipCheck);
      await logSecurityEvent("KHPAY_WEBHOOK_IP_BLOCKED", {
        clientIP: ipCheck.clientIP,
        reason: ipCheck.reason,
        requestId,
        ipRangesConfigured: true,
      }, req);
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    } else {
      console.warn(`[KHPay Webhook] [${requestId}] IP allowlist NOT configured - allowing:`, ipCheck.clientIP);
      await logSecurityEvent("KHPAY_WEBHOOK_IP_NOT_CONFIGURED", {
        clientIP: ipCheck.clientIP,
        reason: 'KHPAY_IP_RANGES env var not set',
        requestId,
        ipRangesConfigured: false,
      }, req);
    }
  } else {
    console.log(`[KHPay Webhook] [${requestId}] IP allowlist check passed:`, ipCheck.clientIP);
  }
  
  // Rate limiting check
  const clientIP = extractClientIP(req) || 'unknown';
  const rateLimitResult = await checkRateLimit(`khpay:${clientIP}`, WEBHOOK_RATE_LIMIT);
  
  if (!rateLimitResult.allowed) {
    console.warn(`[KHPay Webhook] [${requestId}] Rate limit exceeded:`, { clientIP, ...rateLimitResult });
    await logSecurityEvent("KHPAY_WEBHOOK_RATE_LIMIT_EXCEEDED", {
      clientIP,
      blocked: rateLimitResult.blocked,
      retryAfter: rateLimitResult.retryAfter,
      requestId,
    }, req);
    
    const response = NextResponse.json(
      { error: "Too Many Requests", retryAfter: rateLimitResult.retryAfter },
      { status: 429 }
    );
    response.headers.set('Retry-After', String(rateLimitResult.retryAfter || 60));
    return response;
  }

  try {
    // Check content length
    const contentLength = req.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_BODY_SIZE) {
      console.warn(`[KHPay Webhook] [${requestId}] Payload too large:`, contentLength);
      await logSecurityEvent("KHPAY_WEBHOOK_PAYLOAD_TOO_LARGE", {
        contentLength,
        maxSize: MAX_BODY_SIZE,
        requestId,
      }, req);
      return NextResponse.json({ error: "Payload too large" }, { status: 413 });
    }

    const rawBodyString = await req.text();
    const body = JSON.parse(rawBodyString);

    console.log(`[KHPay Webhook] [${requestId}] Body:`, rawBodyString);
    console.log(`[KHPay Webhook] [${requestId}] Headers:`, Object.fromEntries(req.headers.entries()));
    console.log(`[KHPay Webhook] [${requestId}] Client IP:`, clientIP);

    // Verify webhook signature
    const signature = req.headers.get("x-khpay-signature") || req.headers.get("x-signature");
    if (signature && process.env.KHPAY_WEBHOOK_SECRET) {
      const isValid = verifyKHPayWebhookSignature(rawBodyString, signature);
      
      if (!isValid) {
        console.error(`[KHPay Webhook] [${requestId}] Invalid signature!`);
        await logSecurityEvent("KHPAY_WEBHOOK_INVALID_SIGNATURE", { 
          error: "Signature verification failed",
          signature: signature.slice(0, 16) + '...',
          requestId,
        }, req);
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }
      
      console.log(`[KHPay Webhook] [${requestId}] Signature verified successfully`);
    } else if (process.env.KHPAY_WEBHOOK_SECRET && !signature) {
      console.warn(`[KHPay Webhook] [${requestId}] Missing signature header`);
      await logSecurityEvent("KHPAY_WEBHOOK_MISSING_SIGNATURE", { requestId }, req);
      return NextResponse.json({ error: "Missing signature" }, { status: 401 });
    }

    // Extract payment info from KHPay webhook
    const {
      md5,
      md5hash,
      transaction_id,
      transactionId,
      amount,
      currency,
      status,
      payment_status,
      paid_at,
      acknowledged_date_ms,
    } = body;

    const md5Hash = sanitizeInput(md5 || md5hash || "");
    console.log(`[KHPay Webhook] [${requestId}] Extracted MD5:`, md5Hash);

    if (!md5Hash || md5Hash.length !== 32) {
      await logSecurityEvent("KHPAY_WEBHOOK_INVALID_MD5", { 
        md5Hash: md5Hash.slice(0, 8) + '...',
        length: md5Hash.length,
        requestId,
      }, req);
      return NextResponse.json({ error: "Invalid MD5 hash" }, { status: 400 });
    }

    // Replay protection using Redis (distributed-safe)
    const payloadHash = hashSha256(rawBodyString);
    let replayCheck: { isFirst: boolean; alreadyProcessed: boolean };
    
    try {
      replayCheck = await tryMarkWebhookProcessed(payloadHash, {
        orderNumber: 'unknown',
        processedAt: new Date().toISOString(),
        requestId,
      });
      
      if (!replayCheck.isFirst) {
        console.log(`[KHPay Webhook] [${requestId}] Duplicate webhook detected (replay protection)`);
        
        // Re-check payment status even if duplicate
        const md5HashForCheck = sanitizeInput(md5 || md5hash || "");
        if (md5HashForCheck && md5HashForCheck.length === 32) {
          const khpayResult = await checkKHPayPayment(md5HashForCheck);
          if (khpayResult.paid) {
            console.log(`[KHPay Webhook] [${requestId}] Payment confirmed (duplicate webhook was legitimate)`);
          } else {
            return NextResponse.json({ ok: true, skipped: true, reason: "already_processed" });
          }
        }
      }
    } catch (redisError: any) {
      console.error(`[KHPay Webhook] [${requestId}] Redis replay cache error - continuing:`, redisError.message);
      await logSecurityEvent("KHPAY_WEBHOOK_REDIS_UNAVAILABLE", {
        error: redisError.message,
        requestId,
      }, req);
      replayCheck = { isFirst: true, alreadyProcessed: false };
    }

    // Database-level duplicate check
    const existingLog = await prisma.paymentLog.findFirst({
      where: {
        event: "WEBHOOK_PROCESSED",
        metadata: { path: ["payloadHash"], string_contains: payloadHash || "" },
      },
      select: { id: true },
    });

    if (existingLog) {
      console.log(`[KHPay Webhook] [${requestId}] Duplicate detected in database (idempotency)`);
      return NextResponse.json({ ok: true, skipped: true, reason: "already_processed" });
    }

    console.log(`[KHPay Webhook] [${requestId}] Looking for order with MD5:`, md5Hash);

    // Find order by MD5 hash (stored in metadata.bakongMd5 or metadata.khpayMd5)
    let order = await prisma.order.findFirst({
      where: {
        OR: [
          { metadata: { path: ["bakongMd5"], equals: md5Hash } },
          { metadata: { path: ["khpayMd5"], equals: md5Hash } },
        ],
      },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        amountUsd: true,
        amountKhr: true,
        currency: true,
        paymentRef: true,
        playerUid: true,
        metadata: true,
        createdAt: true,
        paymentExpiresAt: true,
      },
    });
    
    console.log(`[KHPay Webhook] [${requestId}] Order found by MD5:`, order ? order.orderNumber : "NOT FOUND");

    // Fallback: try paymentRef lookup
    if (!order && transaction_id) {
      console.log(`[KHPay Webhook] [${requestId}] Trying transaction_id lookup...`);
      order = await prisma.order.findFirst({
        where: {
          paymentRef: transaction_id,
        },
        select: {
          id: true,
          orderNumber: true,
          status: true,
          amountUsd: true,
          amountKhr: true,
          currency: true,
          paymentRef: true,
          playerUid: true,
          metadata: true,
          createdAt: true,
        },
      });
      console.log(`[KHPay Webhook] [${requestId}] Order found by transaction_id:`, order ? order.orderNumber : "NOT FOUND");
    }

    // Fallback: search recent pending orders by amount
    if (!order && amount) {
      console.log(`[KHPay Webhook] [${requestId}] Searching recent pending orders by amount...`);
      const recentPendingOrders = await prisma.order.findMany({
        where: {
          status: 'PENDING',
          createdAt: {
            gte: new Date(Date.now() - 30 * 60 * 1000), // Last 30 minutes
          },
          paymentMethod: 'KHPAY',
        },
        select: {
          id: true,
          orderNumber: true,
          status: true,
          amountUsd: true,
          amountKhr: true,
          currency: true,
          metadata: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
      
      order = recentPendingOrders.find(o => {
        const orderAmount = o.currency === 'KHR' ? o.amountKhr : o.amountUsd;
        return Math.abs(orderAmount - amount) < 0.01;
      });
      
      console.log(`[KHPay Webhook] [${requestId}] Order found by amount match:`, order ? order.orderNumber : "NOT FOUND");
    }

    if (!order) {
      console.error(`[KHPay Webhook] [${requestId}] Order not found for MD5:`, md5Hash);
      await logSecurityEvent("KHPAY_WEBHOOK_ORDER_NOT_FOUND", {
        md5Hash: md5Hash.slice(0, 16) + '...',
        requestId,
        transactionId: transaction_id,
        amount,
        currency,
      }, req);
      
      // Create audit log for manual investigation
      await prisma.paymentLog.create({
        data: {
          orderId: 'UNKNOWN',
          event: 'KHPAY_WEBHOOK_ORDER_NOT_FOUND',
          status: 'PENDING',
          paymentRef: transaction_id || md5Hash,
          amount,
          currency,
          provider: 'KHPAY',
          metadata: {
            requestId,
            md5Hash,
            webhookBody: body,
          },
        },
      });
      
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    console.log(`[KHPay Webhook] [${requestId}] Order found:`, {
      orderNumber: order.orderNumber,
      status: order.status,
      paymentRef: order.paymentRef,
      createdAt: order.createdAt.toISOString(),
    });

    // Check if already paid (idempotency)
    if (["PAID", "PROCESSING", "DELIVERED", "DELIVERING", "QUEUED"].includes(order.status)) {
      console.log(`[KHPay Webhook] [${requestId}] Order already paid:`, order.status);
      return NextResponse.json({ ok: true, skipped: true, reason: `already_${order.status}` });
    }

    // Verify payment with KHPay API
    const khpayResult = await checkKHPayPayment(md5Hash);
    
    if (!khpayResult.paid || khpayResult.status !== "PAID") {
      console.log(`[KHPay Webhook] [${requestId}] Payment not confirmed:`, khpayResult);
      return NextResponse.json({
        status: "PENDING",
        message: "Payment not yet confirmed",
      }, { status: 200 });
    }

    // Validate amount
    const amountValidation = validateKHPayAmount(
      order.amountUsd,
      order.amountKhr,
      khpayResult.amount || 0,
      khpayResult.currency || order.currency
    );

    if (!amountValidation.valid) {
      console.error(`[KHPay Webhook] [${requestId}] Amount validation failed:`, amountValidation.message);
      await logSecurityEvent("KHPAY_WEBHOOK_AMOUNT_MISMATCH", {
        orderNumber: order.orderNumber,
        expectedUsd: order.amountUsd,
        expectedKhr: order.amountKhr,
        paidAmount: khpayResult.amount,
        paidCurrency: khpayResult.currency,
        message: amountValidation.message,
        requestId,
      }, req);
      return NextResponse.json({ 
        error: "Amount mismatch", 
        message: amountValidation.message 
      }, { status: 400 });
    }

    // Payment confirmed - mark order as paid using state machine
    const markResult = await markOrderAsPaid(order.id, {
      paymentRef: order.paymentRef || `KHPAY-${md5Hash.slice(0, 16)}`,
      amount: order.currency === "KHR" ? (order.amountKhr || 0) : order.amountUsd,
      currency: order.currency,
      transactionId: transactionId || transaction_id || md5Hash,
      verifiedBy: "khpay_webhook",
    });

    if (!markResult.success) {
      console.error(`[KHPay Webhook] [${requestId}] Failed to mark order as paid:`, markResult.error);
      await logSecurityEvent("KHPAY_WEBHOOK_MARK_PAID_FAILED", {
        orderNumber: order.orderNumber,
        error: markResult.error,
        requestId,
      }, req);
      return NextResponse.json({ 
        status: "ERROR", 
        message: markResult.error 
      }, { status: 400 });
    }

    console.log(`[KHPay Webhook] [${requestId}] Order marked as PAID:`, order.orderNumber);

    // Notify Telegram
    notifyTelegramPayment(order).catch((err) => {
      console.error(`[KHPay Webhook] [${requestId}] Telegram notification error:`, err);
    });

    // Process delivery immediately
    console.log(`[KHPay Webhook] [${requestId}] Triggering delivery processing...`);
    processDeliveryQueue(5).then((result) => {
      console.log(`[KHPay Webhook] [${requestId}] Delivery processing completed:`, result);
    }).catch((err) => {
      console.error(`[KHPay Webhook] [${requestId}] Delivery processing error:`, err);
    });

    return NextResponse.json({
      status: "PAID",
      orderNumber: order.orderNumber,
      deliveryStatus: "QUEUED",
      message: "Payment confirmed. Processing delivery.",
    });

  } catch (err: any) {
    console.error(`[KHPay Webhook] [${requestId}] Error:`, err);
    await logSecurityEvent("KHPAY_WEBHOOK_ERROR", { 
      error: String(err), 
      stack: err.stack,
      requestId,
    }, req);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * GET /api/payment/webhook/khpay
 * 
 * Health check endpoint
 */
export async function GET(req: NextRequest) {
  console.log("[KHPay Webhook] GET request - health check");
  return NextResponse.json({ 
    ok: true, 
    message: "KHPay webhook endpoint active",
    timestamp: new Date().toISOString(),
  });
}

/**
 * Notify Telegram about new payment
 */
async function notifyTelegramPayment(order: any) {
  const fullOrder = await prisma.order.findUnique({
    where: { id: order.id },
    include: { game: true, product: true },
  });

  if (!fullOrder) return;

  const baseUrl = process.env.PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || "";
  const link = baseUrl ? `\n<a href="${baseUrl}/admin/orders/${fullOrder.orderNumber}">Open in admin</a>` : "";

  await notifyTelegram(
    `💰 <b>New paid order (KHPay Webhook)</b>\n` +
      `<b>#${escapeHtml(fullOrder.orderNumber)}</b>\n` +
      `${escapeHtml(fullOrder.game.name)} — ${escapeHtml(fullOrder.product.name)}\n` +
      `UID: <code>${escapeHtml(fullOrder.playerUid)}</code>\n` +
      `Amount: ${fullOrder.currency === "KHR" ? `${Math.round(fullOrder.amountKhr ?? 0).toLocaleString()} ៛` : `$${fullOrder.amountUsd.toFixed(2)}`}${link}`
  );
}
