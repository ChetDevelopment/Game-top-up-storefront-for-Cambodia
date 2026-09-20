import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const period = searchParams.get("period") || "7d";
  const gameId = searchParams.get("gameId");

  const now = new Date();
  let startDate = new Date();
  
  switch (period) {
    case "24h":
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
    case "7d":
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case "30d":
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case "90d":
      startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      break;
    default:
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  }

  const whereClause: any = {
    createdAt: { gte: startDate },
    status: { in: ["PAID", "PROCESSING", "DELIVERED"] }
  };
  if (gameId) whereClause.gameId = gameId;

  const [orders, revenueByDay, topProducts, topGames, paymentMethods] = await Promise.all([
    prisma.order.findMany({
      where: whereClause,
      select: { amountUsd: true, createdAt: true, game: { select: { name: true } }, product: { select: { name: true } } }
    }),
    prisma.order.groupBy({
      by: ["createdAt"],
      where: whereClause,
      _sum: { amountUsd: true },
      _count: true,
    }),
    prisma.order.groupBy({
      by: ["productId"],
      where: whereClause,
      _sum: { amountUsd: true },
      _count: true,
      orderBy: { _sum: { amountUsd: "desc" } },
      take: 10,
    }),
    prisma.order.groupBy({
      by: ["gameId"],
      where: whereClause,
      _sum: { amountUsd: true },
      _count: true,
      orderBy: { _sum: { amountUsd: "desc" } },
      take: 10,
    }),
    prisma.order.groupBy({
      by: ["paymentMethod"],
      where: whereClause,
      _sum: { amountUsd: true },
      _count: true,
    }),
  ]);

  const totalRevenue = orders.reduce((sum, o) => sum + (o.amountUsd || 0), 0);
  const totalOrders = orders.length;
  const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  const gameData = await prisma.game.findMany({
    where: { active: true },
    select: { id: true, name: true, _count: { select: { orders: true } } }
  });

  const gamePopularity = gameData
    .map(g => ({ name: g.name, orders: g._count.orders }))
    .sort((a, b) => b.orders - a.orders)
    .slice(0, 10);

  return NextResponse.json({
    summary: {
      totalRevenue,
      totalOrders,
      avgOrderValue,
      period,
    },
    revenueByDay: revenueByDay.map(r => ({
      date: r.createdAt.toISOString().split("T")[0],
      revenue: r._sum.amountUsd || 0,
      orders: r._count,
    })),
    topProducts: topProducts.map(p => ({
      productId: p.productId,
      revenue: p._sum.amountUsd || 0,
      orders: p._count,
    })),
    topGames: topGames.map(g => ({
      gameId: g.gameId,
      revenue: g._sum.amountUsd || 0,
      orders: g._count,
    })),
    gamePopularity,
    paymentAnalytics: paymentMethods.map(p => ({
      method: p.paymentMethod,
      revenue: p._sum.amountUsd || 0,
      orders: p._count,
    })),
    recentOrders: orders.slice(0, 20).map(o => ({
      amount: o.amountUsd,
      game: o.game.name,
      product: o.product.name,
      date: o.createdAt,
    })),
  });
}