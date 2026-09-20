import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";

import { guardAdminApi } from "@/lib/api-security";
import { decryptField } from "@/lib/encryption";
import { NextRequest, NextResponse } from "next/server";

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const stringValue = String(value);
  if (/[",\n\r]/.test(stringValue)) return `"${stringValue.replace(/"/g, '""')}"`;
  return stringValue;
}

export async function GET(req: NextRequest) {
  const security = await guardAdminApi(req);
  if ("response" in security) return security.response;

  const { searchParams } = req.nextUrl;
  const status = searchParams.get("status") || undefined;
  const q = searchParams.get("q")?.trim();

  const where: Record<string, unknown> = {};
  if (status && status !== "ALL") where.status = status;
  if (q) {
    where.OR = [
      { orderNumber: { contains: q.toUpperCase(), mode: "insensitive" as const } },
      { playerUid: { contains: q, mode: "insensitive" as const } },
      { customerEmail: { contains: q, mode: "insensitive" as const } },
      { customerPhone: { contains: q, mode: "insensitive" as const } },
    ];
  }

  const orders = await prisma.order.findMany({
    where,
    include: {
      game: { select: { name: true } },
      product: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 5000,
  });

  const header = [
    "Order #",
    "Status",
    "Game",
    "Product",
    "Player UID",
    "Server",
    "Amount USD",
    "Amount KHR",
    "Email",
    "Phone",
    "Payment Method",
    "Payment Ref",
    "Created",
    "Paid",
    "Delivered",
  ];

  const rows = orders.map((order: any) =>
    [
      order.orderNumber,
      order.status,
      order.game?.name,
      order.product?.name,
      order.playerUid,
      order.serverId,
      order.amountUsd.toFixed(2),
      order.amountKhr,
      decryptField(order.customerEmail) ?? order.customerEmail,
      decryptField(order.customerPhone) ?? order.customerPhone,
      order.paymentMethod,
      order.paymentRef,
      order.createdAt.toISOString(),
      order.paidAt?.toISOString() ?? "",
      order.deliveredAt?.toISOString() ?? "",
    ]
      .map(csvCell)
      .join(",")
  );

  const csv = [header.map(csvCell).join(","), ...rows].join("\n");
  const filename = `orders-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
