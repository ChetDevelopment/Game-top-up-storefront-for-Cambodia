import { NextRequest, NextResponse } from "next/server";
import { guardAdminApi } from "@/lib/api-security";
import { prisma } from "@/lib/prisma";
import { decryptField } from "@/lib/encryption";

export async function GET(req: NextRequest) {
  const security = await guardAdminApi(req);
  if ("response" in security) return security.response;

  const users = await prisma.user.findMany({
    include: {
      _count: {
        select: { orders: true, savedUids: true },
      },
      orders: {
        where: { status: "DELIVERED" },
        select: { amountUsd: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // Decrypt emails for response
  const usersWithStats = users.map(user => {
    const totalSpent = user.orders.reduce((sum, order) => sum + order.amountUsd, 0);
    return {
      id: user.id,
      name: user.name,
      email: user.email ? (decryptField(user.email) || user.email) : null,
      image: user.image,
      createdAt: user.createdAt,
      orderCount: user._count.orders,
      savedUidCount: user._count.savedUids,
      totalSpent,
      xp: Math.floor(totalSpent * 100),
    };
  });

  return NextResponse.json(usersWithStats);
}
