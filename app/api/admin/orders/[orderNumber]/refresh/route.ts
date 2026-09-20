import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";

import { writeAudit } from "@/lib/audit";
import { guardAdminApi } from "@/lib/api-security";
import { checkBakongPayment } from "@/lib/payment";
import { updateUserTotalSpent } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

/**
 * Admin debug endpoint: pulls the latest Bakong status for an order
 * and, if paid, flips the order to DELIVERED (after verifying amount).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orderNumber: string }> }
) {
  const security = await guardAdminApi(req);
  if ("response" in security) return security.response;

  const { orderNumber } = await params;
  const order = await prisma.order.findUnique({
    where: { orderNumber: orderNumber },
  });
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!order.paymentRef || order.paymentRef.startsWith("SIM-")) {
    return NextResponse.json({ error: "No Bakong reference on order" }, { status: 400 });
  }

  const remote = await checkBakongPayment((order.metadata as any)?.bakongMd5 || "", order.paymentRef);

  let updated = order;

  // Verify payment and amount
  if (remote && remote.paid && order.status === "PENDING") {
    // AMOUNT VERIFICATION
    if (remote.amount !== undefined && remote.amount !== null) {
      const paidAmount = parseFloat(String(remote.amount));

      // Get dynamic exchange rate from Settings
      const settings = await prisma.settings.findFirst();
      const exchangeRate = settings?.exchangeRate ?? 4100;

      const expectedAmount = order.currency === "KHR"
        ? (order.amountKhr ?? order.amountUsd * exchangeRate)
        : order.amountUsd;

      const tolerance = order.currency === "KHR" ? 0 : 0.01;

      if (Math.abs(paidAmount - expectedAmount) > tolerance) {
        await writeAudit({
          action: "order.bakong_refresh.amount_mismatch",
          targetType: "order",
          targetId: order.id,
          details: {
            expectedAmount,
            paidAmount,
            currency: order.currency,
          },
        });

        await prisma.order.update({
          where: { id: order.id },
          data: {
            status: "FAILED",
            failureReason: `Amount mismatch: expected ${expectedAmount.toFixed(2)}, paid ${paidAmount.toFixed(2)}`,
          },
        });

        return NextResponse.json(
          { error: "Payment amount mismatch", status: "FAILED" },
          { status: 400 }
        );
      }
    }

    // RECEIVER VERIFICATION (if returned by checkBakongPayment)
    if (remote.receiverAccount && remote.receiverAccount !== process.env.BAKONG_ACCOUNT) {
      return NextResponse.json({
        error: "Payment sent to wrong account",
        expectedAccount: process.env.BAKONG_ACCOUNT,
        receiverAccount: remote.receiverAccount,
      }, { status: 400 });
    }

    updated = await prisma.order.update({
      where: { id: order.id },
      data: {
        status: "DELIVERED",
        paidAt: new Date(),
        deliveredAt: new Date(),
      },
    });
    if (order.userId) {
      await updateUserTotalSpent(order.userId, order.amountUsd);
    }
    await writeAudit({
      action: "order.bakong_refresh.auto_delivered",
      targetType: "order",
      targetId: order.id,
      details: { paymentRef: order.paymentRef, remote },
    });
  } else if (
    remote &&
    (String(remote.status) === "expired" || String(remote.status) === "failed" || String(remote.status) === "UNPAID") &&
    order.status === "PENDING"
  ) {
    updated = await prisma.order.update({
      where: { id: order.id },
      data: { status: "FAILED", failureReason: `Bakong: ${String(remote.status)}` },
    });
    await writeAudit({
      action: "order.bakong_refresh.auto_failed",
      targetType: "order",
      targetId: order.id,
      details: { paymentRef: order.paymentRef, remote },
    });
  }

  await writeAudit({
    action: "order.bakong_refresh",
    targetType: "order",
    targetId: order.id,
    details: { paymentRef: order.paymentRef, remote, expectedAmount: order.amountUsd },
  });

  return NextResponse.json({
    remote,
    order: updated,
    expectedAmount: order.amountUsd,
    paidAmount: remote?.amount,
  });
}
