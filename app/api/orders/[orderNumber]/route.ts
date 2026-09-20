import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

/**
 * GET /api/orders/[orderNumber]
 * 
 * READ-ONLY endpoint.
 * Returns order status and payment details.
 * 
 * ACCESS CONTROL:
 * - Authenticated user (owner): Full details including QR, paymentRef
 * - Unauthenticated: Limited details (no sensitive data)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orderNumber: string }> }
) {
  const { orderNumber } = await params;

  const order = await prisma.order.findUnique({
    where: { orderNumber: orderNumber.toUpperCase() },
    include: {
      game: { select: { name: true, slug: true } },
      product: { select: { name: true } },
    },
  });

  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  // Check if current user owns this order
  const user = await getCurrentUser();
  const isOwner = user && order.userId === user.userId;

  // Return limited data for unauthenticated users (IDOR protection)
  const baseResponse = {
    orderNumber: order.orderNumber,
    status: order.status,
    deliveryStatus: order.deliveryStatus,
    gameName: order.game.name,
    gameSlug: order.game.slug,
    productName: order.product.name,
    amountUsd: order.amountUsd,
    amountKhr: order.amountKhr,
    currency: order.currency,
    paymentMethod: order.paymentMethod,
    paymentExpiresAt: order.paymentExpiresAt?.toISOString() ?? null,
    createdAt: order.createdAt.toISOString(),
    paidAt: order.paidAt?.toISOString() ?? null,
    deliveredAt: order.deliveredAt?.toISOString() ?? null,
  };

  // Full data only for order owner
  if (isOwner) {
    return NextResponse.json({
      ...baseResponse,
      deliveryAttempts: order.deliveryAttempts,
      maxDeliveryAttempts: order.maxDeliveryAttempts,
      playerUid: order.playerUid,
      serverId: order.serverId,
      paymentRef: order.paymentRef,
      paymentUrl: order.paymentUrl,
      qrString: order.qrString,
      nextDeliveryAt: order.nextDeliveryAt?.toISOString() ?? null,
      deliveryNote: order.deliveryNote,
      failureReason: order.failureReason,
    });
  }

  return NextResponse.json(baseResponse);
}
