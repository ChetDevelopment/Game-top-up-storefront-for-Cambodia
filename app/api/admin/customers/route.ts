import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";

import { guardAdminApi } from "@/lib/api-security";
import { decryptField } from "@/lib/encryption";
import { NextRequest, NextResponse } from "next/server";

/**
 * Aggregated customer list. Groups orders by customerEmail or customerPhone
 * (whichever is present) and returns lifetime value + order counts.
 */
export async function GET(req: NextRequest) {
  const security = await guardAdminApi(req);
  if ("response" in security) return security.response;

  // Pull raw orders (bounded) and aggregate in memory.
  const orders = await prisma.order.findMany({
    take: 5000,
    orderBy: { createdAt: "desc" },
    select: {
      customerEmail: true,
      customerPhone: true,
      playerUid: true,
      amountUsd: true,
      status: true,
      createdAt: true,
    },
  });

  const map = new Map<
    string,
    {
      key: string;
      email: string | null;
      phone: string | null;
      totalOrders: number;
      paidOrders: number;
      lifetimeUsd: number;
      lastOrderAt: Date;
      uids: Set<string>;
    }
  >();

  for (const order of orders) {
    const email = decryptField(order.customerEmail) ?? order.customerEmail;
    const phone = decryptField(order.customerPhone) ?? order.customerPhone;
    const key = email || phone || `uid:${order.playerUid}`;
    const existing = map.get(key);
    const isPaid = ["PAID", "PROCESSING", "DELIVERED"].includes(order.status);

    if (existing) {
      existing.totalOrders += 1;
      if (isPaid) existing.paidOrders += 1;
      if (isPaid) existing.lifetimeUsd += order.amountUsd;
      if (order.createdAt > existing.lastOrderAt) existing.lastOrderAt = order.createdAt;
      existing.uids.add(order.playerUid);
      continue;
    }

    map.set(key, {
      key,
      email,
      phone,
      totalOrders: 1,
      paidOrders: isPaid ? 1 : 0,
      lifetimeUsd: isPaid ? order.amountUsd : 0,
      lastOrderAt: order.createdAt,
      uids: new Set([order.playerUid]),
    });
  }

  const customers = [...map.values()]
    .map((customer) => ({
      key: customer.key,
      email: customer.email,
      phone: customer.phone,
      totalOrders: customer.totalOrders,
      paidOrders: customer.paidOrders,
      lifetimeUsd: Math.round(customer.lifetimeUsd * 100) / 100,
      lastOrderAt: customer.lastOrderAt,
      uidCount: customer.uids.size,
    }))
    .sort((a, b) => b.lifetimeUsd - a.lifetimeUsd);

  return NextResponse.json({ customers, total: customers.length });
}
