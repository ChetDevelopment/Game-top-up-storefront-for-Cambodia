import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";

import { writeAudit } from "@/lib/audit";
import { notifyTelegram, escapeHtml } from "@/lib/telegram";
import { updateUserTotalSpent } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logSecurityEvent } from "@/lib/logger";
import { decryptField } from "@/lib/encryption";

const updateSchema = z.object({
  status: z.enum([
    "PENDING",
    "PAID",
    "PROCESSING",
    "DELIVERED",
    "FAILED",
    "REFUNDED",
    "CANCELLED",
  ]).optional(),
  deliveryNote: z.string().optional(),
  failureReason: z.string().optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orderNumber: string }> }
) {
  const { orderNumber } = await params;
  logSecurityEvent("ACCESS", "Order details viewed", req, { orderNumber });

  const order = await prisma.order.findUnique({
    where: { orderNumber },
    include: {
      game: true,
      product: true,
    },
  });
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Decrypt customer data for admin display
  const decryptedOrder = {
    ...order,
    customerEmail: order.customerEmail ? (decryptField(order.customerEmail) || order.customerEmail) : null,
    customerPhone: order.customerPhone ? (decryptField(order.customerPhone) || order.customerPhone) : null,
  };

  return NextResponse.json(decryptedOrder);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ orderNumber: string }> }
) {
  const { orderNumber } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const order = await prisma.order.findUnique({
    where: { orderNumber },
  });
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data: any = { ...parsed.data };

  // SECURITY: Prevent manual PAID status without proper verification
  if (parsed.data.status === "PAID" && !order.paidAt) {
    // Require paymentRef to exist - order must have a payment reference
    if (!order.paymentRef) {
      return NextResponse.json(
        { error: "Cannot mark as PAID: no payment reference found. Process payment first." },
        { status: 400 }
      );
    }

    // Log this manual override for audit
    logSecurityEvent("SECURITY", `MANUAL_PAID_OVERRIDE: ${order.orderNumber}, amount: ${order.amountUsd} ${order.currency}`, req);

    data.paidAt = new Date();
    if (order.userId) {
      await updateUserTotalSpent(order.userId, order.amountUsd);
    }
  }

  if (parsed.data.status === "DELIVERED" && !order.deliveredAt) {
    data.deliveredAt = new Date();
  }

  const updated = await prisma.order.update({
    where: { id: order.id },
    data,
  });

  if (parsed.data.status && parsed.data.status !== order.status) {
    await writeAudit({
      action: `order.status.${parsed.data.status.toLowerCase()}`,
      targetType: "order",
      targetId: order.orderNumber,
      details: `${order.status} â†’ ${parsed.data.status}`,
    });
    if (parsed.data.status === "DELIVERED" || parsed.data.status === "PAID") {
      await notifyTelegram(
        `âœ… <b>Order ${escapeHtml(parsed.data.status)}</b>\n` +
          `#${escapeHtml(order.orderNumber)} â€” $${order.amountUsd.toFixed(2)}\n` +
          `UID: <code>${escapeHtml(order.playerUid)}</code>`
      );
    }
  } else if (parsed.data.deliveryNote || parsed.data.failureReason) {
    await writeAudit({
      action: "order.note",
      targetType: "order",
      targetId: order.orderNumber,
      details: parsed.data.deliveryNote || parsed.data.failureReason,
    });
  }

  return NextResponse.json(updated);
}
