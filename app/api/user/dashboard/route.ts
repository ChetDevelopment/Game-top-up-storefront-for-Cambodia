import { NextRequest, NextResponse } from "next/server";
import { guardUserApi } from "@/lib/api-security";
import { prisma } from "@/lib/prisma";
import { decryptField } from "@/lib/encryption";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const security = await guardUserApi(req);
  if ("response" in security) return security.response;

  const { user } = security;
  const [userRecord, orders, savedUids] = await Promise.all([
    prisma.user.findUnique({
      where: { id: user.userId },
      select: {
        id: true,
        email: true,
        name: true,
        image: true,
        vipRank: true,
        totalSpentUsd: true,
        pointsBalance: true,
        createdAt: true,
        orders: { select: { amountUsd: true } },
      },
    }),
    prisma.order.findMany({
      where: { userId: user.userId },
      orderBy: { createdAt: "desc" },
      include: {
        game: { select: { name: true, imageUrl: true } },
        product: { select: { name: true } },
      },
    }),
    prisma.savedUid.findMany({
      where: { userId: user.userId },
      include: {
        game: { select: { name: true, imageUrl: true } },
      },
    }),
  ]);

  if (!userRecord) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const totalSpentCalculated = orders.reduce((sum, order) => sum + order.amountUsd, 0);

  return NextResponse.json({
    user: {
      ...userRecord,
      email: decryptField(userRecord.email) || userRecord.email,
      totalSpentUsd: totalSpentCalculated,
    },
    orders,
    savedUids,
  });
}
