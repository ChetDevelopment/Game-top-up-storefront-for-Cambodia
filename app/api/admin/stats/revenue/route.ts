import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";

import { guardAdminApi } from "@/lib/api-security";
import { NextRequest, NextResponse } from "next/server";

/**
 * Revenue summary for the last N days.
 * Returns daily buckets and the top-5 products by revenue.
 */
export async function GET(req: NextRequest) {
  const security = await guardAdminApi(req);
  if ("response" in security) return security.response;

  const days = Math.min(365, Math.max(1, parseInt(req.nextUrl.searchParams.get("days") || "30")));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const paid = await prisma.order.findMany({
    where: {
      status: { in: ["PAID", "PROCESSING", "DELIVERED"] },
      paidAt: { gte: since },
    },
    select: {
      amountUsd: true,
      paidAt: true,
      productId: true,
      userId: true,
      product: { select: { name: true } },
      game: { select: { name: true } },
    },
  });

  const buckets = new Map<string, { date: string; count: number; revenue: number }>();
  for (let index = 0; index < days; index += 1) {
    const date = new Date(Date.now() - index * 24 * 60 * 60 * 1000);
    const key = date.toISOString().slice(0, 10);
    buckets.set(key, { date: key, count: 0, revenue: 0 });
  }

  const productAgg = new Map<string, { name: string; game: string; count: number; revenue: number }>();
  const hourly = new Array(24).fill(0);
  const userOrderCount = new Map<string, number>();

  for (const order of paid) {
    if (!order.paidAt) continue;

    const key = order.paidAt.toISOString().slice(0, 10);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.count += 1;
      bucket.revenue += order.amountUsd;
    }

    const hour = (order.paidAt.getUTCHours() + 7) % 24;
    hourly[hour] += 1;

    if (order.userId) {
      userOrderCount.set(order.userId, (userOrderCount.get(order.userId) || 0) + 1);
    }

    const existing = productAgg.get(order.productId);
    if (existing) {
      existing.count += 1;
      existing.revenue += order.amountUsd;
    } else {
      productAgg.set(order.productId, {
        name: order.product?.name ?? "—",
        game: order.game?.name ?? "—",
        count: 1,
        revenue: order.amountUsd,
      });
    }
  }

  const returningUsers = Array.from(userOrderCount.values()).filter((count) => count > 1).length;
  const uniqueUsers = userOrderCount.size;

  const daily = [...buckets.values()]
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((bucket) => ({ ...bucket, revenue: Math.round(bucket.revenue * 100) / 100 }));

  const topProducts = [...productAgg.values()]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5)
    .map((product) => ({ ...product, revenue: Math.round(product.revenue * 100) / 100 }));

  const totalRevenue = Math.round(paid.reduce((sum, order) => sum + order.amountUsd, 0) * 100) / 100;

  return NextResponse.json({
    days,
    totalRevenue,
    totalOrders: paid.length,
    daily,
    topProducts,
    retention: {
      returningUsers,
      uniqueUsers,
      rate: uniqueUsers > 0 ? Math.round((returningUsers / uniqueUsers) * 100) : 0,
    },
    hourly,
  });
}
