import { NextRequest, NextResponse } from "next/server";
import { guardUserApi } from "@/lib/api-security";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const ticketSchema = z.object({
  subject: z.string().min(5).max(100),
  category: z.enum(["ORDER_ISSUE", "REFUND", "GENERAL", "BUG"]),
  orderId: z.string().optional(),
  message: z.string().min(10).max(2000),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional().default("NORMAL"),
});

export async function GET(req: NextRequest) {
  const security = await guardUserApi(req);
  if ("response" in security) return security.response;

  const tickets = await prisma.ticket.findMany({
    where: { userId: security.user.userId },
    orderBy: { createdAt: "desc" },
    include: { order: { select: { orderNumber: true, product: { select: { name: true } } } } },
  });

  return NextResponse.json(tickets);
}

export async function POST(req: NextRequest) {
  const security = await guardUserApi(req);
  if ("response" in security) return security.response;

  const body = await req.json().catch(() => ({}));
  const parsed = ticketSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid data" }, { status: 400 });
  }

  if (parsed.data.orderId) {
    const order = await prisma.order.findUnique({
      where: { id: parsed.data.orderId },
      select: { userId: true },
    });

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    if (order.userId !== security.user.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const ticket = await prisma.ticket.create({
    data: {
      userId: security.user.userId,
      subject: parsed.data.subject,
      category: parsed.data.category,
      message: parsed.data.message,
      priority: parsed.data.priority,
      orderId: parsed.data.orderId,
    },
  });

  return NextResponse.json({ success: true, ticketId: ticket.id });
}
