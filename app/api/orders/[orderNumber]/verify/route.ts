import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { checkBakongPayment, processDeliveryQueue } from "@/lib/payment";
import { markOrderAsPaid } from "@/lib/payment-state-machine";
import crypto from "crypto";

/**
 * POST /api/orders/[orderNumber]/verify
 * 
 * PAYMENT VERIFICATION WITH BAKONG API
 * Checks Bakong API and updates order if payment confirmed
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orderNumber: string }> }
) {
  const { orderNumber } = await params;
  const normalizedOrderNumber = orderNumber.toUpperCase();

  // 1. Get current order state
  const order = await prisma.order.findUnique({
    where: { orderNumber: normalizedOrderNumber },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      deliveryStatus: true,
      paymentRef: true,
      amountUsd: true,
      amountKhr: true,
      currency: true,
      metadata: true,
      createdAt: true,
      paidAt: true,
      deliveredAt: true,
      qrString: true,
      paymentExpiresAt: true,
    },
  });

  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  // 2. If order is already paid, return current state
  const isPaid = ["PAID", "QUEUED", "DELIVERING", "DELIVERED"].includes(order.status);
  if (isPaid) {
    return NextResponse.json({
      orderNumber: order.orderNumber,
      status: order.status,
      deliveryStatus: order.deliveryStatus,
      isPaid: true,
      paidAt: order.paidAt?.toISOString(),
      deliveredAt: order.deliveredAt?.toISOString(),
      message: getStatusMessage(order.status),
    });
  }

  // 3. Order is PENDING - check payment API based on payment method
  if (order.status === "PENDING") {
    let md5Hash = (order.metadata as any)?.bakongMd5;
    
    // Calculate MD5 from QR if not in metadata
    if (!md5Hash && order.qrString) {
      md5Hash = crypto.createHash("md5").update(order.qrString).digest("hex");
    }

    if (md5Hash) {
      console.log(`[Verify] Checking payment for order ${order.orderNumber}, MD5: ${md5Hash}`);
      
      try {
        // Check Bakong API
        let paymentResult;
        
        console.log(`[Verify] Checking Bakong API...`);
        paymentResult = await checkBakongPayment(md5Hash, order.paymentRef || undefined);
        
        console.log(`[Verify] Payment result:`, { paid: paymentResult.paid, status: paymentResult.status });
        
        if (paymentResult.paid && paymentResult.status === "PAID") {
          console.log(`[Verify] Payment confirmed! Updating order ${order.orderNumber} to PAID`);
          
          const markResult = await markOrderAsPaid(order.id, {
            paymentRef: order.paymentRef || `WEBHOOK-${md5Hash.slice(0, 16)}`,
            amount: order.currency === "KHR" ? (order.amountKhr || 0) : order.amountUsd,
            currency: order.currency,
            transactionId: paymentResult.transactionId,
            verifiedBy: "api",
          });
          
          if (markResult.success) {
            console.log(`[Verify] Order ${order.orderNumber} updated to PAID`);
            
            // Trigger delivery processing (fire-and-forget)
            processDeliveryQueue(5).then((result) => {
              console.log("[Verify] Delivery processing:", result);
            }).catch((err) => {
              console.error("[Verify] Delivery error:", err);
            });
            
            return NextResponse.json({
              orderNumber: order.orderNumber,
              status: "PAID",
              deliveryStatus: order.deliveryStatus,
              isPaid: true,
              paidAt: paymentResult.paidAt?.toISOString() || new Date().toISOString(),
              deliveredAt: order.deliveredAt?.toISOString(),
              message: "Payment received! Preparing your top-up...",
              justPaid: true,
            });
          }
        }
      } catch (err: any) {
        console.error(`[Verify] Payment check error:`, err.message);
        // Continue - don't fail the request
      }
    }
  }

  // 4. Return current state (payment not yet confirmed)
  return NextResponse.json({
    orderNumber: order.orderNumber,
    status: order.status,
    deliveryStatus: order.deliveryStatus,
    isPaid,
    paidAt: order.paidAt?.toISOString(),
    deliveredAt: order.deliveredAt?.toISOString(),
    message: getStatusMessage(order.status),
  });
}

function getStatusMessage(status: string): string {
  switch (status) {
    case "PENDING": return "Waiting for payment...";
    case "PAID":
    case "QUEUED": return "Payment received! Preparing your top-up...";
    case "DELIVERING": return "Delivering credits to your account...";
    case "DELIVERED": return "Top-up successful! Check your game account.";
    case "EXPIRED": return "Payment window expired. Please try again.";
    case "FAILED":
    case "FAILED_FINAL": return "Delivery failed. Please contact support.";
    case "CANCELLED": return "Order cancelled.";
    default: return "Processing your order...";
  }
}
