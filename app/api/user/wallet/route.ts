import { NextRequest, NextResponse } from "next/server";
import { guardUserApi } from "@/lib/api-security";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const topupSchema = z.object({
  amountUsd: z.number().min(1).max(500),
});

export async function GET(req: NextRequest) {
  const security = await guardUserApi(req);
  if ("response" in security) return security.response;

  const user = await prisma.user.findUnique({
    where: { id: security.user.userId },
    select: { walletBalance: true, pointsBalance: true },
  });

  return NextResponse.json(user || { walletBalance: 0, pointsBalance: 0 });
}

export async function POST(req: NextRequest) {
  const security = await guardUserApi(req);
  if ("response" in security) return security.response;

  const body = await req.json().catch(() => ({}));
  const parsed = topupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
  }

  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  if (!settings) {
    return NextResponse.json({ error: "System unavailable" }, { status: 500 });
  }

  const walletOrder = await prisma.order.create({
    data: {
      orderNumber: `W-${Date.now().toString(36).toUpperCase()}`,
      gameId: "WALLET-TOPUP",
      productId: parsed.data.amountUsd.toString(),
      playerUid: security.user.userId,
      amountUsd: parsed.data.amountUsd,
      amountKhr: settings.exchangeRate
        ? Math.round(parsed.data.amountUsd * settings.exchangeRate)
        : null,
      currency: "USD",
      paymentMethod: "BAKONG",
      status: "PENDING",
      userId: security.user.userId,
    },
  });

  return NextResponse.json({
    orderNumber: walletOrder.orderNumber,
    amount: parsed.data.amountUsd,
  });
}
