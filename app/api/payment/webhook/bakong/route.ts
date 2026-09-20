import { prisma } from "@/lib/prisma";
import crypto from "crypto";
export const dynamic = "force-dynamic";

import {
  checkBakongPayment,
  validatePaymentAmount,
  processDeliveryQueue,
  markOrderPaid,
} from "@/lib/payment";
import { notifyTelegram, escapeHtml } from "@/lib/telegram";
import { NextRequest, NextResponse } from "next/server";
import { sanitizeInput, isSuspiciousRequest, logSecurityEvent } from "@/lib/security";
import { hashSha256, verifyWebhookSignature } from "@/lib/encryption";
import { z } from "zod";
import { checkRateLimit } from "@/lib/rate-limit-webhook";
import { tryMarkWebhookProcessed } from "@/lib/webhook-cache";
import { isAllowedProviderIP, extractClientIP } from "@/lib/webhook-ip-allowlist";
import { createModuleLogger } from "@/lib/logger-pino";

const log = createModuleLogger("webhook-bakong");

const WEBHOOK_RATE_LIMIT = {
  intervalMs: 60 * 1000,
  maxRequests: 100,
  blockDurationMs: 5 * 60 * 1000,
};

const MAX_BODY_SIZE = 1024 * 1024;

const WebhookSchema = z.object({
  md5: z.string().optional(),
  md5hash: z.string().optional(),
  transaction_id: z.string().optional(),
  amount: z.number().positive().optional(),
  currency: z.string().optional(),
  status: z.string().optional(),
  transactionId: z.string().optional(),
  acknowledgedDateMs: z.number().positive().optional(),
  toAccountId: z.string().optional(),
  receiverBankAccount: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  const requestId = `wh_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;

  log.info("Webhook received", { requestId });

  if (isSuspiciousRequest(req)) {
    logSecurityEvent("SUSPICIOUS_WEBHOOK", { url: req.url, requestId }, req);
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ipCheck = isAllowedProviderIP(req, "BAKONG");
  if (!ipCheck.allowed) {
    log.warn("Webhook IP blocked", { clientIP: ipCheck.clientIP, reason: ipCheck.reason, requestId });
    await logSecurityEvent("WEBHOOK_IP_BLOCKED", { clientIP: ipCheck.clientIP, reason: ipCheck.reason, requestId }, req);
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const clientIP = extractClientIP(req) || "unknown";
  const rateLimitResult = await checkRateLimit(`bakong:${clientIP}`, WEBHOOK_RATE_LIMIT);
  if (!rateLimitResult.allowed) {
    log.warn("Webhook rate limited", { clientIP, requestId });
    return NextResponse.json(
      { error: "Too Many Requests", retryAfter: rateLimitResult.retryAfter },
      { status: 429, headers: { "Retry-After": String(rateLimitResult.retryAfter || 60) } }
    );
  }

  try {
    const contentLength = req.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_BODY_SIZE) {
      return NextResponse.json({ error: "Payload too large" }, { status: 413 });
    }

    const rawBodyString = await req.text();
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(rawBodyString);
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parseResult = WebhookSchema.safeParse(body);
    if (!parseResult.success) {
      await logSecurityEvent("INVALID_WEBHOOK_PAYLOAD", { errors: parseResult.error.errors, requestId }, req);
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const validatedBody = parseResult.data;

    const signature = req.headers.get("x-bakong-signature") || req.headers.get("x-signature");
    const webhookSecret = process.env.BAKONG_WEBHOOK_SECRET;

    if (webhookSecret) {
      if (!signature) {
        log.warn("Missing webhook signature", { requestId });
        return NextResponse.json({ error: "Missing signature" }, { status: 401 });
      }
      if (!verifyWebhookSignature(rawBodyString, signature, webhookSecret)) {
        log.warn("Invalid webhook signature", { requestId });
        await logSecurityEvent("INVALID_WEBHOOK_SIGNATURE", { requestId }, req);
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }
      log.info("Webhook signature verified", { requestId });
    } else {
      log.warn("BAKONG_WEBHOOK_SECRET not configured — signature verification skipped", { requestId });
    }

    const md5Hash = sanitizeInput(validatedBody.md5 || validatedBody.md5hash || "");
    if (!md5Hash || md5Hash.length !== 32) {
      return NextResponse.json({ error: "Invalid MD5 hash" }, { status: 400 });
    }

    const payloadHash = hashSha256(rawBodyString);

    const order = await prisma.order.findFirst({
      where: { metadata: { path: ["bakongMd5"], equals: md5Hash } },
      select: {
        id: true, orderNumber: true, status: true, amountUsd: true,
        amountKhr: true, currency: true, paymentRef: true, playerUid: true,
        metadata: true, createdAt: true, paymentExpiresAt: true,
        maxDeliveryAttempts: true,
        game: { select: { name: true } },
        product: { select: { name: true, gameDropOfferId: true, g2bulkCatalogueName: true } },
      },
    });

    if (!order) {
      log.warn("Order not found for webhook", { md5Hash: md5Hash.slice(0, 16), requestId });
      await prisma.paymentLog.create({
        data: {
          orderId: "UNKNOWN",
          event: "WEBHOOK_ORDER_NOT_FOUND",
          status: "PENDING",
          paymentRef: validatedBody.transaction_id || md5Hash,
          provider: "BAKONG",
          metadata: { requestId, md5Hash, webhookBody: validatedBody },
        },
      });
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    log.info("Order found", { orderNumber: order.orderNumber, requestId });

    if (["PAID", "QUEUED", "DELIVERING", "DELIVERED", "SUCCESS"].includes(order.status)) {
      log.info("Order already processed", { orderNumber: order.orderNumber, status: order.status, requestId });
      return NextResponse.json({ ok: true, skipped: true, reason: `already_${order.status}` });
    }

    const replayCheck = await tryMarkWebhookProcessed(payloadHash, order.id, {
      orderNumber: order.orderNumber,
      requestId,
    });

    if (!replayCheck.isFirst && replayCheck.alreadyProcessed) {
      log.warn("Duplicate webhook blocked by idempotency", { orderNumber: order.orderNumber, requestId });
      return NextResponse.json({ ok: true, skipped: true, reason: "already_processed" });
    }

    const bakongResult = await checkBakongPayment(md5Hash, order.paymentRef || undefined);
    if (!bakongResult.paid) {
      log.info("Payment not yet confirmed by Bakong", { orderNumber: order.orderNumber, requestId });
      return NextResponse.json({ status: "PENDING", message: "Payment not yet confirmed" }, { status: 200 });
    }

    const paidAmount = bakongResult.amount || order.amountUsd;
    const paidCurrency = bakongResult.currency || order.currency;

    const amountValidation = await validatePaymentAmount(
      order.amountUsd,
      order.amountKhr,
      paidAmount,
      paidCurrency
    );

    if (!amountValidation.valid) {
      log.error("Amount mismatch", { orderNumber: order.orderNumber, expected: order.amountUsd, received: paidAmount, requestId });
      await logSecurityEvent("WEBHOOK_AMOUNT_MISMATCH", {
        orderNumber: order.orderNumber,
        expected: order.amountUsd,
        received: paidAmount,
        requestId,
      }, req);
      return NextResponse.json({ error: "Amount mismatch" }, { status: 400 });
    }

    const markResult = await markOrderPaid(order.id, {
      paymentRef: order.paymentRef || `WEBHOOK-${md5Hash.slice(0, 16)}`,
      amount: paidAmount,
      currency: paidCurrency,
      transactionId: validatedBody.transactionId || validatedBody.transaction_id || md5Hash,
      verifiedBy: "webhook",
    });

    if (!markResult.success) {
      log.error("Failed to mark order as paid", { orderNumber: order.orderNumber, error: markResult.message, requestId });
      return NextResponse.json({ status: "ERROR", message: markResult.message }, { status: 400 });
    }

    // Store Bakong transaction hash for future lookups
    const webhookTransactionId = validatedBody.transactionId || validatedBody.transaction_id;
    if (webhookTransactionId && webhookTransactionId !== md5Hash) {
      await prisma.order.update({
        where: { id: order.id },
        data: {
          metadata: {
            ...(order.metadata as any || {}),
            bakongMd5: md5Hash,
            bakongTransactionHash: webhookTransactionId,
            verifiedIdentifier: "webhook",
          },
        },
      });
    }

    log.info("Order marked as PAID", { orderNumber: order.orderNumber, requestId });

    notifyTelegram(
      `💰 <b>New paid order (Bakong Webhook)</b>\n` +
      `<b>#${escapeHtml(order.orderNumber)}</b>\n` +
      `${escapeHtml(order.game.name)} — ${escapeHtml(order.product.name)}\n` +
      `UID: <code>${escapeHtml(order.playerUid)}</code>\n` +
      `Amount: ${order.currency === "KHR" ? `${Math.round(order.amountKhr ?? 0).toLocaleString()} ៛` : `$${order.amountUsd.toFixed(2)}`}`
    ).catch(() => {});

    processDeliveryQueue(5).catch((err: unknown) => {
      log.error("Delivery processing error", { error: err instanceof Error ? err.message : String(err), requestId });
    });

    log.info("Webhook processed successfully", { orderNumber: order.orderNumber, duration: Date.now() - startTime, requestId });

    return NextResponse.json({
      status: "PAID",
      orderNumber: order.orderNumber,
      deliveryStatus: "QUEUED",
      message: "Payment confirmed. Processing delivery.",
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const errStack = err instanceof Error ? err.stack : undefined;
    log.error("Webhook error", { error: errMsg, stack: errStack, requestId });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
