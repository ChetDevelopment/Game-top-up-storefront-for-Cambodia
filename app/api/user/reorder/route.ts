import { NextRequest, NextResponse } from "next/server";
import { guardUserApi } from "@/lib/api-security";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { generateOrderNumber } from "@/lib/utils";

const reorderSchema = z.object({
  orderId: z.string().min(1),
  playerUid: z.string().min(1),
  serverId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const security = await guardUserApi(req);
  if ("response" in security) return security.response;

  const body = await req.json().catch(() => ({}));
  const parsed = reorderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid data" }, { status: 400 });
  }

  const originalOrder = await prisma.order.findUnique({
    where: { id: parsed.data.orderId },
    include: { product: true },
  });

  if (!originalOrder) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }
  if (originalOrder.userId !== security.user.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  const user = await prisma.user.findUnique({ where: { id: security.user.userId } });
  if (!settings || !user) {
    return NextResponse.json({ error: "System unavailable" }, { status: 500 });
  }

  const originalPrice = originalOrder.amountUsd;
  const vipDiscount =
    user.vipRank === "DIAMOND_LEGEND"
      ? 0.03
      : user.vipRank === "GOLD"
        ? 0.02
        : user.vipRank === "SILVER"
          ? 0.01
          : 0;
  const finalPrice = originalPrice * (1 - vipDiscount);

  const orderNumber = generateOrderNumber();
  const amountKhr = settings.exchangeRate
    ? Math.round(finalPrice * settings.exchangeRate)
    : null;

  const newOrder = await prisma.order.create({
    data: {
      orderNumber,
      gameId: originalOrder.gameId,
      productId: originalOrder.productId,
      playerUid: parsed.data.playerUid,
      serverId: parsed.data.serverId,
      amountUsd: finalPrice,
      amountKhr,
      currency: "USD",
      paymentMethod: "MANUAL",
      status: "PENDING",
      userId: security.user.userId,
    },
  });

  return NextResponse.json({ orderNumber, order: newOrder });
}
