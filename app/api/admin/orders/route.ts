import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";

import { guardAdminApi } from "@/lib/api-security";
import { NextRequest, NextResponse } from "next/server";
import { decryptField } from "@/lib/encryption";

export async function GET(req: NextRequest) {
  const security = await guardAdminApi(req);
  if ("response" in security) return security.response;

  const { searchParams } = req.nextUrl;
  const status = searchParams.get("status") || undefined;
  const q = searchParams.get("q")?.trim();
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const perPage = Math.min(100, parseInt(searchParams.get("perPage") || "25"));

  const where: Record<string, unknown> = {};
  if (status && status !== "ALL") where.status = status;
  if (q) {
    where.OR = [
      { orderNumber: { contains: q.toUpperCase(), mode: "insensitive" as const } },
      { playerUid: { contains: q, mode: "insensitive" as const } },
      { customerEmail: { contains: q, mode: "insensitive" as const } },
    ];
  }

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: {
        game: { select: { name: true, slug: true } },
        product: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.order.count({ where }),
  ]);

  // Decrypt and sanitize customer data for admin display
  const decryptedOrders = orders.map((order: any) => {
    const email = order.customerEmail ? (decryptField(order.customerEmail) || order.customerEmail) : null;
    const phone = order.customerPhone ? (decryptField(order.customerPhone) || order.customerPhone) : null;
    
    // Sanitize UID to prevent XSS in admin panel
    const sanitizedUid = order.playerUid?.replace(/[<>\"\'%;()&+\\]/g, "") || order.playerUid;
    const sanitizedServerId = order.serverId?.replace(/[<>\"\'%;()&+\\]/g, "") || order.serverId;
    
    return {
      ...order,
      customerEmail: email,
      customerPhone: phone,
      playerUid: sanitizedUid,
      serverId: sanitizedServerId,
    };
  });

  return NextResponse.json({
    orders: decryptedOrders,
    total,
    page,
    perPage,
    totalPages: Math.ceil(total / perPage),
  });
}
