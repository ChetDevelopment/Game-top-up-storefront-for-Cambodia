import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { generateOrderNumber } from "@/lib/utils";

const bulkItemSchema = z.object({
  productId: z.string().min(1),
  playerUid: z.string().min(4).max(20),
  serverId: z.string().optional(),
});

const bulkOrderSchema = z.object({
  items: z.array(bulkItemSchema).min(1).max(50),
  paymentMethod: z.enum(["WALLET", "BAKONG"]),
  currency: z.enum(["USD", "KHR"]).optional().default("USD"),
  promoCode: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const session = await getCurrentUser();
  if (!session) {
    return NextResponse.json({ error: "Please login for bulk orders" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = bulkOrderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid data", details: parsed.error.flatten() }, { status: 400 });
  }

  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  if (!settings) {
    return NextResponse.json({ error: "System unavailable" }, { status: 500 });
  }

  const productIds = parsed.data.items.map(i => i.productId);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, active: true },
    include: { game: true }
  });

  if (products.length !== productIds.length) {
    return NextResponse.json({ error: "Some products are invalid or inactive" }, { status: 400 });
  }

  let totalUsd = 0;
  const orderItems = parsed.data.items.map(item => {
    const product = products.find(p => p.id === item.productId)!;
    totalUsd += product.priceUsd;
    return { product, uid: item.playerUid, serverId: item.serverId };
  });

  let discountUsd = 0;
  if (parsed.data.promoCode) {
    const promo = await prisma.promoCode.findUnique({
      where: { code: parsed.data.promoCode.toUpperCase().trim() },
    });
    if (promo && promo.active && (!promo.expiresAt || promo.expiresAt >= new Date()) && totalUsd >= promo.minOrderUsd) {
      discountUsd = promo.discountType === "PERCENT" 
        ? (totalUsd * promo.discountValue) / 100 
        : promo.discountValue;
      await prisma.promoCode.update({
        where: { id: promo.id },
        data: { usedCount: { increment: 1 } },
      });
    }
  }

  const finalTotal = Math.max(0, totalUsd - discountUsd);
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

  if (parsed.data.paymentMethod === "WALLET") {
    const user = await prisma.user.findUnique({ where: { id: session.userId } });
    if (!user || user.walletBalance < finalTotal) {
      return NextResponse.json({ error: "Insufficient wallet balance", walletBalance: user?.walletBalance || 0 }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: session.userId },
      data: { walletBalance: { decrement: finalTotal } }
    });

    const orders = await Promise.all(orderItems.map(item => 
      prisma.order.create({
        data: {
          orderNumber: generateOrderNumber(),
          gameId: item.product.gameId,
          productId: item.product.id,
          playerUid: item.uid,
          serverId: item.serverId,
          amountUsd: item.product.priceUsd,
          amountKhr: settings.exchangeRate ? Math.round(item.product.priceUsd * settings.exchangeRate) : null,
          currency: parsed.data.currency,
          paymentMethod: "WALLET",
          status: "PROCESSING",
          userId: session.userId,
        }
      })
    ));

    return NextResponse.json({
      success: true,
      ordersCreated: orders.length,
      totalPaid: finalTotal,
      redirectUrl: `${baseUrl}/account`,
    });
  }

  const bulkOrderNumber = `BULK-${Date.now().toString(36).toUpperCase()}`;
  const bulkOrder = await prisma.order.create({
    data: {
      orderNumber: bulkOrderNumber,
      gameId: products[0].gameId,
      productId: "BULK",
      playerUid: "MULTIPLE",
      amountUsd: finalTotal,
      amountKhr: settings.exchangeRate ? Math.round(finalTotal * settings.exchangeRate) : null,
      currency: parsed.data.currency,
      paymentMethod: "BAKONG",
      status: "PENDING",
      userId: session.userId,
    }
  });

  return NextResponse.json({
    orderNumber: bulkOrderNumber,
    items: orderItems.map(i => ({ product: i.product.name, uid: i.uid })),
    subtotal: totalUsd,
    discount: discountUsd,
    total: finalTotal,
    redirectUrl: `${baseUrl}/checkout/${bulkOrderNumber}`,
  });
}