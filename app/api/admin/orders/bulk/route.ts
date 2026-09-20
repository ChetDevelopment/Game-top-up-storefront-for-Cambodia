import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";

import { writeAudit } from "@/lib/audit";
import { guardAdminApi } from "@/lib/api-security";
import { NextRequest, NextResponse } from "next/server";
import { updateUserTotalSpent } from "@/lib/auth";

/**
 * DELETE /api/admin/orders/bulk — wipes orders matching the given filter.
 *
 * Body (all optional):
 *   { status?: "PENDING" | ... | "ALL", confirm: "DELETE" }
 *
 * Without `confirm: "DELETE"` the request is refused.
 */
export async function DELETE(req: NextRequest) {
  const security = await guardAdminApi(req);
  if ("response" in security) return security.response;

  const body = await req.json().catch(() => ({}));
  if (body.confirm !== "DELETE") {
    return NextResponse.json(
      { error: "Missing confirmation. Resend with { confirm: 'DELETE' }." },
      { status: 400 }
    );
  }

  const status = typeof body.status === "string" ? body.status : "ALL";
  const where = status === "ALL" ? undefined : { status };

  const result = await prisma.order.deleteMany({ where });

  await writeAudit({
    action: "orders.bulk_delete",
    targetType: "order",
    details: `Deleted ${result.count} orders (filter: ${status})`,
  });

  return NextResponse.json({ ok: true, deleted: result.count });
}

/**
 * PATCH /api/admin/orders/bulk — bulk update order statuses.
 *
 * Body:
 *   { orderIds: string[], action: "mark_paid" | "mark_delivered" | "mark_failed" | "refund" }
 */
export async function PATCH(req: NextRequest) {
  const security = await guardAdminApi(req);
  if ("response" in security) return security.response;

  const body = await req.json().catch(() => ({}));
  const { orderIds, action } = body;

  if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
    return NextResponse.json({ error: "Missing orderIds array" }, { status: 400 });
  }

  if (!action) {
    return NextResponse.json({ error: "Missing action" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};

  switch (action) {
    case "mark_delivered":
      updates.status = "DELIVERED";
      updates.deliveredAt = new Date();
      break;
    case "mark_failed":
      updates.status = "FAILED";
      break;
    case "refund":
      updates.status = "REFUNDED";
      break;
    default:
      return NextResponse.json({ error: "Invalid action. Note: mark_paid is disabled for security." }, { status: 400 });
  }

  const results = await prisma.order.updateMany({
    where: { id: { in: orderIds } },
    data: updates,
  });

  await writeAudit({
    action: `orders.bulk_${action}`,
    targetType: "order",
    details: `Updated ${results.count} orders`,
  });

  return NextResponse.json({ ok: true, updated: results.count });
}
