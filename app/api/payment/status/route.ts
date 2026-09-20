import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { checkBakongPayment, processDeliveryQueue } from "@/lib/payment";
import { getOrderState, markOrderAsPaid } from "@/lib/payment-state-machine";

// DEBUG: Route loaded
console.log("[Payment Status Route] Module loaded at", new Date().toISOString());

/**
 * GET /api/payment/status?orderNumber=XXX
 * 
 * Returns current payment status for an order.
 * Frontend polls this every 3-5 seconds while waiting for payment.
 * 
 * Also performs payment verification (non-blocking):
 * - If order is PENDING, checks Bakong API for payment status
 * - If payment confirmed, updates order to PAID
 */
export async function GET(req: NextRequest) {
  const startTime = Date.now();
  const orderNumber = req.nextUrl.searchParams.get("orderNumber");

  console.log(`[Payment Status] Request received for order: ${orderNumber}`);

  if (!orderNumber) {
    return NextResponse.json(
      { error: "orderNumber parameter is required", code: "INVALID_INPUT" },
      { status: 400 }
    );
  }

  try {
    // Get order
    const order = await prisma.order.findUnique({
      where: { orderNumber: orderNumber.toUpperCase() },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        deliveryStatus: true,
        amountUsd: true,
        amountKhr: true,
        currency: true,
        paymentRef: true,
        paymentExpiresAt: true,
        paidAt: true,
        deliveredAt: true,
        metadata: true,
        createdAt: true,
        game: {
          select: { name: true, slug: true },
        },
        product: {
          select: { name: true },
        },
      },
    });

    if (!order) {
      return NextResponse.json(
        { error: "Order not found", code: "ORDER_NOT_FOUND" },
        { status: 404 }
      );
    }

    // Check if order is expired
    if (
      order.status === "PENDING" &&
      order.paymentExpiresAt &&
      order.paymentExpiresAt < new Date()
    ) {
      // Mark as expired (atomic transition)
      await prisma.order.update({
        where: { id: order.id },
        data: { status: "EXPIRED" },
      });

      return NextResponse.json({
        orderNumber: order.orderNumber,
        status: "EXPIRED",
        deliveryStatus: order.deliveryStatus,
        isPaid: false,
        isExpired: true,
        message: "Payment window expired. Please create a new order.",
        expiredAt: order.paymentExpiresAt.toISOString(),
      });
    }

    // If order is already in terminal state, return immediately
    const terminalStates = ["DELIVERED", "FAILED", "CANCELLED", "EXPIRED"];
    if (terminalStates.includes(order.status)) {
      return NextResponse.json({
        orderNumber: order.orderNumber,
        status: order.status,
        deliveryStatus: order.deliveryStatus,
        isPaid: ["PAID", "PROCESSING", "DELIVERED"].includes(order.status),
        isTerminal: true,
        paidAt: order.paidAt?.toISOString(),
        deliveredAt: order.deliveredAt?.toISOString(),
        message: getStatusMessage(order.status),
      });
    }

    // If order is PENDING, verify payment with Bakong BEFORE returning
    // This ensures we detect payment immediately
    let paymentVerified = false;
    if (order.status === "PENDING" && (order.metadata as any)?.bakongMd5) {
      const md5Hash = (order.metadata as any).bakongMd5 as string;
      
      // SYNCHRONOUS verification - wait for response
      try {
        const result = await checkBakongPayment(md5Hash, order.paymentRef || undefined);
        
        if (result.paid && (result.status as any) === "PAID") {
          // Payment confirmed - update order IMMEDIATELY
          const updatedOrder = await prisma.order.findUnique({
            where: { id: order.id },
            select: {
              status: true,
              paymentRef: true,
              amountUsd: true,
              amountKhr: true,
              currency: true,
            },
          });

          if (updatedOrder && updatedOrder.status === "PENDING") {
            const markResult = await markOrderAsPaid(order.id, {
              paymentRef: updatedOrder.paymentRef || `WEBHOOK-${md5Hash.slice(0, 16)}`,
              amount: order.currency === "KHR" ? (order.amountKhr || 0) : order.amountUsd,
              currency: order.currency,
              transactionId: result.transactionId,
              verifiedBy: "polling",
            });

            if (markResult.success) {
              paymentVerified = true;
              console.log(`[Payment Status] Payment confirmed for order ${order.orderNumber}`);
              
              // Store Bakong transaction hash for future lookups
              if (result.transactionId && result.transactionId !== md5Hash) {
                await prisma.order.update({
                  where: { id: order.id },
                  data: {
                    metadata: {
                      ...(order.metadata as any || {}),
                      bakongMd5: md5Hash,
                      bakongTransactionHash: result.transactionId,
                      verifiedIdentifier: result.transactionId !== md5Hash ? "bakong_hash" : "md5",
                    },
                  },
                });
              }
              
              // Trigger delivery processing (fire-and-forget)
              processDeliveryQueue(5).then((deliveryResult) => {
                console.log("[Payment Status] Delivery processing:", deliveryResult);
              }).catch((err) => {
                console.error("[Payment Status] Delivery error:", err);
              });
              
              // Refresh order data after update
              order.status = "PAID";
            }
          }
        }
      } catch (err) {
        console.error("[Payment Status] Verification error:", err);
        // Continue anyway - don't block the response
      }
    }

    // Return current state
    const isPaid = ["PAID", "PROCESSING", "DELIVERED"].includes(order.status);
    
    return NextResponse.json({
      orderNumber: order.orderNumber,
      status: order.status,
      deliveryStatus: order.deliveryStatus,
      isPaid,
      isTerminal: false,
      isExpired: false,
      paidAt: order.paidAt?.toISOString(),
      deliveredAt: order.deliveredAt?.toISOString(),
      expiresAt: order.paymentExpiresAt?.toISOString(),
      timeRemaining: order.paymentExpiresAt
        ? Math.max(0, order.paymentExpiresAt.getTime() - Date.now())
        : null,
      gameName: order.game.name,
      productName: order.product.name,
      amount: order.currency === "KHR" ? order.amountKhr : order.amountUsd,
      currency: order.currency,
      message: getStatusMessage(order.status),
      _debug: process.env.NODE_ENV === "development" ? {
        processingTime: `${Date.now() - startTime}ms`,
        paymentVerified,
      } : undefined,
    });
  } catch (error: any) {
    console.error("[Payment Status] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to get payment status",
        code: "STATUS_CHECK_FAILED",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}

function getStatusMessage(status: string): string {
  switch (status) {
    case "PENDING":
      return "Waiting for payment...";
    case "PAID":
      return "Payment received! Preparing your top-up...";
    case "PROCESSING":
      return "Delivering credits to your account...";
    case "DELIVERED":
      return "Top-up successful! Check your game account.";
    case "EXPIRED":
      return "Payment window expired. Please try again.";
    case "FAILED":
      return "Payment failed. Please contact support.";
    case "CANCELLED":
      return "Order cancelled.";
    default:
      return "Processing your order...";
  }
}
