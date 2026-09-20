import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";

import { getCurrentUser } from "@/lib/auth";
import { guardAdminApi } from "@/lib/api-security";
import { ordersApiRateLimit } from "@/lib/api-security";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const lookupSchema = z.object({
  query: z.string().min(3).max(100),
});

export async function POST(req: NextRequest) {
  // Apply rate limiting
  const rateLimited = await ordersApiRateLimit(req);
  if (rateLimited) return rateLimited;

  // REQUIRE authentication - either user (to see their own orders) or admin
  const user = await getCurrentUser();

  // Check if admin
  const adminSecurity = await guardAdminApi(req);
  const isAdmin = !("response" in adminSecurity);

  if (!user && !isAdmin) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
  }

  try {
    const body = await req.json();
    const parsed = lookupSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Enter at least 3 characters" },
        { status: 400 }
      );
    }

    const { query } = parsed.data;
    const trimmed = query.trim();

    // Only surface orders where payment has actually gone through.
    // Hide PENDING / CANCELLED / FAILED / REFUNDED from public search.
    const PAID_STATUSES = ["PAID", "PROCESSING", "DELIVERED"];

    const whereClause: any = {
      status: { in: PAID_STATUSES },
      OR: [
        { customerEmail: trimmed.toLowerCase() },
        { customerEmail: trimmed },
        { customerPhone: trimmed },
      ],
    };

    // Non-admin users can only see their own orders
    if (!isAdmin && user) {
      whereClause.userId = user.userId;
    }

    const orders = await prisma.order.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
      take: 10,
      include: {
        game: { select: { name: true } },
        product: { select: { name: true } },
      },
    });

    if (orders.length === 0) {
      return NextResponse.json(
        { error: "No paid orders found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      orders: orders.map((o) => ({
        orderNumber: o.orderNumber,
        status: o.status,
        gameName: o.game.name,
        productName: o.product.name,
        amountUsd: o.amountUsd,
        createdAt: o.createdAt.toISOString(),
      })),
    });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

