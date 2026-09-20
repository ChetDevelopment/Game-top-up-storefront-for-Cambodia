import { NextRequest, NextResponse } from "next/server";
import { guardUserApi } from "@/lib/api-security";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const alertSchema = z.object({
  productId: z.string().min(1),
  targetPrice: z.number().positive().optional(),
});

export async function GET(req: NextRequest) {
  const security = await guardUserApi(req);
  if ("response" in security) return security.response;

  const alerts = await prisma.priceAlert.findMany({
    where: { userId: security.user.userId, notified: false },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(alerts);
}

export async function POST(req: NextRequest) {
  const security = await guardUserApi(req);
  if ("response" in security) return security.response;

  const body = await req.json().catch(() => ({}));
  const parsed = alertSchema.safeParse(body);
  if (!parsed.success || parsed.data.targetPrice === undefined) {
    return NextResponse.json({ error: "Invalid data" }, { status: 400 });
  }

  const alert = await prisma.priceAlert.upsert({
    where: {
      userId_productId: {
        userId: security.user.userId,
        productId: parsed.data.productId,
      },
    },
    update: { targetPrice: parsed.data.targetPrice, notified: false },
    create: {
      userId: security.user.userId,
      productId: parsed.data.productId,
      targetPrice: parsed.data.targetPrice,
    },
  });

  return NextResponse.json(alert);
}

export async function DELETE(req: NextRequest) {
  const security = await guardUserApi(req);
  if ("response" in security) return security.response;

  const body = await req.json().catch(() => ({}));
  const parsed = alertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Product ID required" }, { status: 400 });
  }

  await prisma.priceAlert.deleteMany({
    where: { userId: security.user.userId, productId: parsed.data.productId },
  });

  return NextResponse.json({ ok: true });
}
