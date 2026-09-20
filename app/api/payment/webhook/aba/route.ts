import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { checkABAPayment, verifyABAWebhookSignature } from "@/lib/aba-payway";
import { processDeliveryQueue } from "@/lib/payment";
import { markOrderAsPaid } from "@/lib/payment-state-machine";
import { checkRateLimit } from "@/lib/rate-limit-webhook";
import { tryMarkWebhookProcessed } from "@/lib/webhook-cache";
import { verifyWebhookSignatureRotating } from "@/lib/webhook-secret-rotation";
import { isAllowedProviderIP, extractClientIP } from "@/lib/webhook-ip-allowlist";
import { logSecurityEvent } from "@/lib/security";
import { hashSha256 } from "@/lib/encryption";

// Rate limit configuration
const WEBHOOK_RATE_LIMIT = {
  intervalMs: 60 * 1000,
  maxRequests: 100,
  blockDurationMs: 5 * 60 * 1000,
};

// Request body size limit: 1MB
const MAX_BODY_SIZE = 1024 * 1024;

/**
 * POST /api/payment/webhook/aba
 * 
 * ABA PayWay Webhook Handler
 * ABA sends payment notifications here
 */
export async function POST(req: NextRequest) {
  const requestId = `aba_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  console.log(`[ABA Webhook] [${requestId}] Received webhook`);

  // Security check: IP allowlisting
  const ipCheck = isAllowedProviderIP(req, 'ABA');
  if (!ipCheck.allowed) {
    console.warn(`[ABA Webhook] [${requestId}] IP not allowed:`, ipCheck);
    await logSecurityEvent("ABA_WEBHOOK_IP_BLOCKED", {
      clientIP: ipCheck.clientIP,
      reason: ipCheck.reason,
      requestId,
    }, req);
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Rate limiting check
  const clientIP = extractClientIP(req) || 'unknown';
  const rateLimitResult = await checkRateLimit(`aba:${clientIP}`, WEBHOOK_RATE_LIMIT);
  
  if (!rateLimitResult.allowed) {
    console.warn(`[ABA Webhook] [${requestId}] Rate limit exceeded:`, { clientIP, ...rateLimitResult });
    await logSecurityEvent("ABA_WEBHOOK_RATE_LIMIT_EXCEEDED", {
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
      console.warn(`[ABA Webhook] [${requestId}] Payload too large:`, contentLength);
      await logSecurityEvent("ABA_WEBHOOK_PAYLOAD_TOO_LARGE", {
        contentLength,
        maxSize: MAX_BODY_SIZE,
        requestId,
      }, req);
      return NextResponse.json({ error: "Payload too large" }, { status: 413 });
    }

    const rawBody = await req.text();
    const body = JSON.parse(rawBody);

    console.log(`[ABA Webhook] [${requestId}] Body:`, body);
    console.log(`[ABA Webhook] [${requestId}] Client IP:`, clientIP);

    // Verify webhook signature with rotation support
    const signature = req.headers.get("x-aba-signature");
    if (signature) {
      const sigResult = verifyWebhookSignatureRotating(rawBody, signature, 'ABA');
      if (!sigResult.valid) {
        console.error(`[ABA Webhook] [${requestId}] Invalid signature:`, sigResult.error);
        await logSecurityEvent("ABA_WEBHOOK_INVALID_SIGNATURE", {
          error: sigResult.error,
          signature: signature.slice(0, 16) + '...',
          requestId,
        }, req);
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }
      console.log(`[ABA Webhook] [${requestId}] Signature verified with version:`, sigResult.secretVersion);
    }

    // Extract payment info from ABA webhook
    const {
      reference_id,
      transaction_id,
      status,
      amount,
      currency,
      paid_at,
    } = body;

    if (!reference_id) {
      await logSecurityEvent("ABA_WEBHOOK_MISSING_REFERENCE", {
        body: Object.keys(body),
        requestId,
      }, req);
      return NextResponse.json({ error: "Missing reference_id" }, { status: 400 });
    }

    console.log(`[ABA Webhook] [${requestId}] Reference:`, reference_id, "Status:", status);

    // Replay protection using Redis
    const payloadHash = hashSha256(rawBody);
    const replayCheck = await tryMarkWebhookProcessed(payloadHash, {
      reference_id,
      processedAt: new Date().toISOString(),
      requestId,
    });
    
    if (!replayCheck.isFirst) {
      console.log(`[ABA Webhook] [${requestId}] Duplicate webhook detected (replay protection)`);
      return NextResponse.json({ ok: true, skipped: true, reason: "already_processed" });
    }

    // Find order by ABA payment reference
    const order = await prisma.order.findFirst({
      where: {
        paymentRef: reference_id,
      },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        amountUsd: true,
        amountKhr: true,
        currency: true,
      },
    });

    if (!order) {
      console.log(`[ABA Webhook] [${requestId}] Order not found for reference:`, reference_id);
      await logSecurityEvent("ABA_WEBHOOK_ORDER_NOT_FOUND", {
        reference_id,
        requestId,
      }, req);
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    console.log(`[ABA Webhook] [${requestId}] Order found:`, order.orderNumber);

    // Check if already paid (idempotency)
    if (["PAID", "PROCESSING", "DELIVERED"].includes(order.status)) {
      console.log(`[ABA Webhook] [${requestId}] Order already paid:`, order.status);
      return NextResponse.json({ ok: true, skipped: true, reason: `already_${order.status}` });
    }

    // Verify payment status
    const isPaid = status === "success" || status === "paid" || status === "completed";

    if (!isPaid) {
      console.log(`[ABA Webhook] [${requestId}] Payment not confirmed:`, status);
      return NextResponse.json({ status: "PENDING", message: "Payment not yet confirmed" });
    }

    // Mark order as paid
    const markResult = await markOrderAsPaid(order.id, {
      paymentRef: reference_id,
      amount: order.currency === "KHR" ? (order.amountKhr || 0) : order.amountUsd,
      currency: order.currency,
      transactionId: transaction_id || reference_id,
      verifiedBy: "aba_webhook",
    });

    if (!markResult.success) {
      console.error(`[ABA Webhook] [${requestId}] Failed to mark order as paid:`, markResult.error);
      await logSecurityEvent("ABA_WEBHOOK_MARK_PAID_FAILED", {
        orderNumber: order.orderNumber,
        error: markResult.error,
        requestId,
      }, req);
      return NextResponse.json({ error: "Failed to update order" }, { status: 400 });
    }

    console.log(`[ABA Webhook] [${requestId}] Order marked as PAID:`, order.orderNumber);

    // Trigger delivery
    processDeliveryQueue(5).then((result) => {
      console.log(`[ABA Webhook] [${requestId}] Delivery processing:`, result);
    }).catch((err) => {
      console.error(`[ABA Webhook] [${requestId}] Delivery error:`, err);
    });

    return NextResponse.json({
      status: "PAID",
      orderNumber: order.orderNumber,
      message: "Payment confirmed. Processing delivery.",
    });

  } catch (err: any) {
    console.error(`[ABA Webhook] [${requestId}] Error:`, err);
    await logSecurityEvent("ABA_WEBHOOK_ERROR", { 
      error: err.message, 
      stack: err.stack,
      requestId,
    }, req);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * GET /api/payment/webhook/aba
 * 
 * ABA might send GET requests for verification
 */
export async function GET(req: NextRequest) {
  console.log("[ABA Webhook] GET request");
  return NextResponse.json({ ok: true, message: "ABA webhook endpoint active" });
}
