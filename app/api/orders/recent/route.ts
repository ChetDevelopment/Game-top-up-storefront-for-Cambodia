import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const orders = await prisma.order.findMany({
      where: { status: "DELIVERED" },
      orderBy: { createdAt: "desc" },
      take: 15,
      include: {
        game: { select: { name: true } },
        product: { select: { name: true } },
      },
    });

    return NextResponse.json({
      orders: orders.map((o) => ({
        gameName: o.game.name,
        productName: o.product.name,
        playerUid: o.playerUid.slice(0, 3) + "***",
        createdAt: o.createdAt.toISOString(),
      })),
    });
  } catch {
    return NextResponse.json({ orders: [] });
  }
}

