import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { checkIPBlock } from "@/lib/rate-limit";
import { logSecurityEvent } from "@/lib/security";

const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS = 10;

// Simple in-memory rate limit store
const rateLimitStore: Map<string, { count: number; resetTime: number }> = new Map();

function checkRateLimit(ip: string): NextResponse | null {
  const now = Date.now();
  const entry = rateLimitStore.get(ip);

  if (!entry || entry.resetTime < now) {
    rateLimitStore.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return null;
  }

  entry.count++;
  if (entry.count > MAX_REQUESTS) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429 }
    );
  }

  return null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orderNumber: string }> }
) {
  // Check IP block
  const ipBlocked = checkIPBlock(req);
  if (ipBlocked) return ipBlocked;

  // Apply rate limiting
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0].trim() : "unknown";
  const rateLimitResult = checkRateLimit(ip);
  if (rateLimitResult) return rateLimitResult;

  const { orderNumber: orderNum } = await params;
  const order = await prisma.order.findUnique({
    where: { orderNumber: orderNum.toUpperCase() },
    select: { id: true, userId: true, status: true, paymentRef: true, orderNumber: true },
  });

  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  // Don't require login - order might be guest
  // Just check if order is pending
  if (order.status !== "PENDING") {
    return NextResponse.json(
      { error: "Cannot cancel order that is not pending" },
      { status: 400 }
    );
  }

  await prisma.order.update({
    where: { id: order.id },
    data: {
      status: "CANCELLED",
      failureReason: "User cancelled payment",
    },
  });

  logSecurityEvent("ORDER_CANCELLED", {
    orderNumber: order.orderNumber,
  }, req);

  return NextResponse.json({ success: true, message: "Order cancelled" });
}
