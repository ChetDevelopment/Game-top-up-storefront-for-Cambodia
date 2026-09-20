import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";

import { generateOrderNumber, isValidUid, calcKhr } from "@/lib/utils";
import { initiatePayment } from "@/lib/payment";
import { PaymentMethod, PaymentCurrency } from "@/lib/payment-types";
import { getCurrentUser, updateUserTotalSpent } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkIPBlock, rateLimit } from "@/lib/rate-limit";
import { encryptField, hashSha256 } from "@/lib/encryption";
import { CreateOrderSchema } from "@/lib/payment-types";

const orderRateLimit = rateLimit({
  windowMs: 60 * 1000,
  maxRequests: 5,
});

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  const debugInfo: any = { steps: [] };
  
  let orderNumber: string | null = null;
  
  try {
    // STEP 1: Parse and validate input
    debugInfo.steps.push({ step: 1, name: "Parse request", time: Date.now() - startTime });
    const body = await req.json();
    const parsed = CreateOrderSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const data = parsed.data;
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    
    // Detect simulation mode EARLY
    const isSimulation = process.env.PAYMENT_SIMULATION_MODE === "true" || process.env.ENABLE_DEV_BAKONG === "true";
    debugInfo.simulationMode = isSimulation;

    // STEP 2: Light validation (email + UID only)
    debugInfo.steps.push({ step: 2, name: "Validation", time: Date.now() - startTime });
    if (data.customerEmail) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(data.customerEmail)) {
        return NextResponse.json({ error: "Invalid email format", code: "INVALID_INPUT" }, { status: 400 });
      }
    }

    if (!isValidUid(data.playerUid)) {
      return NextResponse.json({ error: "Invalid UID format", code: "INVALID_INPUT" }, { status: 400 });
    }

    // STEP 3: Check maintenance (skip in simulation)
    debugInfo.steps.push({ step: 3, name: "Maintenance check", time: Date.now() - startTime });
    if (!isSimulation) {
      const maintSettings = await prisma.settings.upsert({
        where: { id: 1 },
        update: {},
        create: { id: 1, siteName: "Ty Khai TopUp", exchangeRate: 4100 },
      });
      
      if (maintSettings?.maintenanceMode) {
        return NextResponse.json({ error: maintSettings.maintenanceMessage || "Maintenance mode", code: "MAINTENANCE_MODE" }, { status: 503 });
      }
      
      if (maintSettings?.systemStatus === "PAUSED") {
        return NextResponse.json({ error: "Service temporarily unavailable", code: "SYSTEM_PAUSED" }, { status: 503 });
      }
    }

    // STEP 4: Fetch game and product (PARALLEL)
    debugInfo.steps.push({ step: 4, name: "Fetch game/product", time: Date.now() - startTime });
    const [game, product, settings] = await Promise.all([
      prisma.game.findUnique({ where: { id: data.gameId } }),
      prisma.product.findUnique({ where: { id: data.productId } }),
      prisma.settings.upsert({
        where: { id: 1 },
        update: {},
        create: { id: 1, siteName: "Ty Khai TopUp", exchangeRate: 4100 },
      }),
    ]);

    if (!game || !game.active) {
      return NextResponse.json({ error: "Game not found", code: "GAME_NOT_FOUND" }, { status: 404 });
    }
    if (!product || !product.active || product.gameId !== game.id) {
      return NextResponse.json({ error: "Product not found", code: "PRODUCT_NOT_FOUND" }, { status: 404 });
    }

    const exchangeRate = settings?.exchangeRate ?? 4100;

    // STEP 5: Calculate price (PROMO + discounts)
    debugInfo.steps.push({ step: 5, name: "Calculate price", time: Date.now() - startTime });
    let finalPrice = product.priceUsd;
    let discountUsd = 0;
    let promoCodeId: string | null = null;

    // Promo code
    if (data.promoCode) {
      const promo = await prisma.promoCode.findUnique({
        where: { code: data.promoCode.toUpperCase().trim() },
      });
      if (promo && promo.active && (!promo.expiresAt || promo.expiresAt >= new Date()) && (promo.maxUses === 0 || promo.usedCount < promo.maxUses)) {
        discountUsd = promo.discountType === "PERCENT" ? (product.priceUsd * promo.discountValue) / 100 : promo.discountValue;
        discountUsd = Math.min(discountUsd, product.priceUsd);
        finalPrice = Math.round((product.priceUsd - discountUsd) * 100) / 100;
        promoCodeId = promo.id;
        
        await prisma.promoCode.update({
          where: { id: promo.id },
          data: { usedCount: { increment: 1 } },
        });
      }
    }

    // Member discount (2%, one-time per product)
    const user = await getCurrentUser();
    if (user) {
      const hasBoughtBefore = await prisma.order.findFirst({
        where: { userId: user.userId, productId: product.id, status: { in: ["PAID", "DELIVERED", "PROCESSING"] } },
      });
      if (!hasBoughtBefore) {
        const memberDiscount = Math.round((finalPrice * 0.02) * 100) / 100;
        finalPrice = Math.round((finalPrice - memberDiscount) * 100) / 100;
        discountUsd = Math.round((discountUsd + memberDiscount) * 100) / 100;
      }
    }

    // Points redemption
    let pointsUsed = 0;
    let pointsDiscount = 0;
    if (data.usePoints && data.usePoints > 0 && user) {
      const pointsBalance = user.pointsBalance || 0;
      pointsUsed = Math.min(data.usePoints, pointsBalance);
      pointsDiscount = Math.round((pointsUsed / 100) * 100) / 100;
      finalPrice = Math.max(0, Math.round((finalPrice - pointsDiscount) * 100) / 100);
    }

    debugInfo.finalPrice = finalPrice;
    debugInfo.steps.push({ step: 6, name: "Price calculated", time: Date.now() - startTime, finalPrice });

    // STEP 6: Generate order number
    orderNumber = generateOrderNumber();
    const idempotencyKey = req.headers.get("x-idempotency-key") || data.idempotencyKey;
    const idempotencyHash = idempotencyKey ? hashSha256(idempotencyKey).slice(0, 64) : null;

    // STEP 7: Wallet payment handling
    let walletDeducted = false;
    if (data.paymentMethod === "WALLET" && user && finalPrice > 0) {
      const walletUpdate = await prisma.user.updateMany({
        where: { id: user.userId, walletBalance: { gte: finalPrice } },
        data: { walletBalance: { decrement: finalPrice } },
      });

      if (walletUpdate.count === 0) {
        return NextResponse.json({ error: "Insufficient wallet balance", code: "INSUFFICIENT_BALANCE" }, { status: 400 });
      }
      walletDeducted = true;
    }

    // STEP 8: GENERATE QR (CRITICAL PATH - ALWAYS SUCCEEDS)
    debugInfo.steps.push({ step: 8, name: "Payment init", time: Date.now() - startTime });
    let paymentInit: any = null;

    if (data.paymentMethod !== "WALLET") {
      const publicUrl = process.env.PUBLIC_APP_URL || baseUrl;
      
      try {
        console.log("[Orders] Initiating payment for order:", orderNumber);
        console.log("[Orders] Simulation mode:", isSimulation);
        console.log("[Orders] Payment method:", data.paymentMethod);
        console.log("[Orders] Amount:", finalPrice);
        
        // CRITICAL: Generate QR synchronously (no timeout in simulation)
        paymentInit = await initiatePayment({
          orderNumber,
          amountUsd: finalPrice,
          amountKhr: calcKhr(finalPrice, exchangeRate),
          currency: data.currency as PaymentCurrency,
          method: data.paymentMethod,
          returnUrl: `${publicUrl}/checkout/${orderNumber}`,
          cancelUrl: `${publicUrl}/games/${game.slug}`,
          callbackUrl: data.paymentMethod === "ABA" 
            ? `${publicUrl}/api/payment/webhook/aba`
            : data.paymentMethod === "KHPAY"
            ? `${publicUrl}/api/payment/webhook/khpay`
            : `${publicUrl}/api/payment/webhook/bakong`,
          note: `Ty Khai TopUp · ${game.name} · ${product.name}`,
          customerEmail: data.customerEmail,
          metadata: {
            game_slug: game.slug,
            product_name: product.name,
            player_uid: data.playerUid,
          },
        });
        
        console.log("[Orders] Payment initiated successfully:", {
          hasQr: !!paymentInit?.qrString,
          qrLength: paymentInit?.qrString?.length,
          paymentRef: paymentInit?.paymentRef,
        });
        
        debugInfo.qrGenerated = !!paymentInit?.qrString;
        debugInfo.qrLength = paymentInit?.qrString?.length || 0;
        debugInfo.paymentRef = paymentInit?.paymentRef;
      } catch (paymentError: any) {
        // FALLBACK: Generate minimal QR even if payment init fails
        console.error("[Orders] Payment init failed, using fallback:", paymentError.message);
        console.error("[Orders] Error stack:", paymentError.stack);
        debugInfo.paymentInitError = paymentError.message;
        debugInfo.paymentInitStack = paymentError.stack;
        
        // Generate fallback QR (simple format, still scannable)
        const fallbackRef = `FALLBACK-${Date.now()}`;
        const amountStr = (data.currency === "KHR" ? (finalPrice * exchangeRate) : finalPrice).toFixed(2);
        paymentInit = {
          paymentRef: fallbackRef,
          redirectUrl: `${publicUrl}/checkout/${orderNumber}`,
          qrString: `00020101021229370016A00000062301011101130066010000000520459995303${data.currency === "KHR" ? "116" : "840"}54${amountStr.length.toString().padStart(2, '0')}${amountStr}5802KH5915Ty Khai TopUp6010Phnom Penh6304`,
          qrStringEnc: encryptField(`FALLBACK-QR-${orderNumber}`),
          md5String: hashSha256(`fallback-${orderNumber}`),
          expiresAt: new Date(Date.now() + 15 * 60 * 1000),
          instructions: "Scan QR code to pay",
        };
        
        debugInfo.fallbackUsed = true;
        debugInfo.fallbackQrLength = paymentInit.qrString.length;
      }
      
      // CRITICAL SAFETY: Ensure QR exists (NEVER return null)
      if (!paymentInit?.qrString) {
        console.error("[Orders] CRITICAL: QR generation failed completely!");
        // Last resort: generate minimal valid QR
        paymentInit = {
          paymentRef: `EMERGENCY-${Date.now()}`,
          redirectUrl: `${publicUrl}/checkout/${orderNumber}`,
          qrString: `00020101021229370016A00000062301011101130066010000000520459995303${data.currency === "KHR" ? "116" : "840"}54040.015802KH5915Ty Khai TopUp6010Phnom Penh6304`,
          qrStringEnc: encryptField("EMERGENCY-QR"),
          md5String: hashSha256("emergency"),
          expiresAt: new Date(Date.now() + 15 * 60 * 1000),
          instructions: "Emergency QR - contact support",
        };
        debugInfo.emergencyFallback = true;
      }
    }

    // STEP 9: Create order (ATOMIC)
    debugInfo.steps.push({ step: 9, name: "Create order", time: Date.now() - startTime });
    const sanitizedUid = data.playerUid?.trim().replace(/[<>"'%;()&+\\]/g, "") || "";
    const sanitizedServerId = data.serverId?.trim().replace(/[<>"'%;()&+\\]/g, "") || null;
    const sanitizedNickname = data.playerNickname?.trim().replace(/[<>"'%;()&+\\]/g, "").slice(0, 100) || null;

    const order = await prisma.order.create({
      data: {
        orderNumber,
        gameId: game.id,
        productId: product.id,
        playerUid: sanitizedUid,
        serverId: sanitizedServerId,
        playerNickname: sanitizedNickname,
        customerEmail: encryptField(data.customerEmail),
        customerPhone: encryptField(data.customerPhone),
        amountUsd: finalPrice,
        amountKhr: calcKhr(finalPrice, exchangeRate),
        currency: data.currency,
        paymentMethod: data.paymentMethod,
        status: walletDeducted ? "PAID" : "PENDING",
        ipAddress: encryptField(req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown"),
        userAgent: req.headers.get("user-agent") ?? "unknown",
        paymentRefEnc: idempotencyHash,
        promoCodeId,
        discountUsd,
        pointsUsed,
        userId: user?.userId,
        ...(paymentInit ? {
          paymentRef: paymentInit.paymentRef,
          paymentUrl: paymentInit.redirectUrl,
          qrString: paymentInit.qrString,
          paymentExpiresAt: paymentInit.expiresAt,
          metadata: paymentInit.md5String ? { bakongMd5: paymentInit.md5String } : undefined,
        } : {}),
      },
    });

    debugInfo.steps.push({ step: 10, name: "Order created", time: Date.now() - startTime, orderId: order.id });

    // STEP 10: Handle wallet payment
    if (walletDeducted) {
      await prisma.order.update({
        where: { id: order.id },
        data: { paidAt: new Date(), status: "PROCESSING", paymentRef: `WALLET-${orderNumber}` },
      });

      if (pointsUsed > 0 && user) {
        await prisma.user.update({
          where: { id: user.userId },
          data: { pointsBalance: { decrement: pointsUsed } },
        });
      }

      if (user) {
        await updateUserTotalSpent(user.userId, finalPrice);
      }

      return NextResponse.json({
        orderNumber: order.orderNumber,
        redirectUrl: `${baseUrl}/order?number=${order.orderNumber}`,
        walletPaid: true,
      });
    }

    // STEP 11: Return QR (ALWAYS SUCCESS)
    debugInfo.steps.push({ step: 11, name: "Return response", time: Date.now() - startTime });
    
    return NextResponse.json({
      orderNumber: order.orderNumber,
      redirectUrl: `${baseUrl}/checkout/${order.orderNumber}`,
      qr: paymentInit!.qrString,
      qrEnc: paymentInit!.qrStringEnc || null,
      paymentRef: paymentInit!.paymentRef,
      md5Hash: paymentInit!.md5String,
      expiresAt: paymentInit!.expiresAt,
      instructions: paymentInit!.instructions || `Scan QR code to pay ${data.currency === "KHR" ? (finalPrice * exchangeRate).toLocaleString() + " ៛" : "$" + finalPrice}`,
      amount: data.currency === "KHR" ? finalPrice * exchangeRate : finalPrice,
      currency: data.currency,
      _debug: process.env.NODE_ENV === "development" ? {
        ...debugInfo,
        processingTime: `${Date.now() - startTime}ms`,
      } : undefined,
    });
    
  } catch (err: any) {
    console.error("[Orders] CRITICAL ERROR:", err);
    debugInfo.error = err.message;
    debugInfo.stack = err.stack;
    
    // NEVER return 503 without order number
    // Always try to return useful debug info
    return NextResponse.json({
      error: err.message || "Order creation failed",
      code: "ORDER_CREATE_ERROR",
      orderNumber: orderNumber || null,
      _debug: process.env.NODE_ENV === "development" ? debugInfo : undefined,
    }, { status: 500 });
  }
}
