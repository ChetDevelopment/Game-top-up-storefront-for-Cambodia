import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { drawMysteryReward } from "@/lib/mystery";

/**
 * Handle opening a mystery box.
 * Only allowed after the order for the mystery box is DELIVERED.
 */
export async function POST(req: Request) {
  const session = await getCurrentUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { orderNumber } = await req.json();

  const order = await prisma.order.findUnique({
    where: { orderNumber },
    include: {
      product: {
        include: {
          rewards: true
        }
      }
    }
  });

  if (!order || order.userId !== session.userId) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  if (order.status !== "DELIVERED") {
    return NextResponse.json({ error: "Order must be delivered to open box" }, { status: 400 });
  }

  // Check if already opened (we'll use deliveryNote to store the result for now or a new field)
  if (order.deliveryNote?.includes("BOX_OPENED")) {
    return NextResponse.json({ error: "Box already opened" }, { status: 400 });
  }

  if (!order.product.isMysteryBox || order.product.rewards.length === 0) {
    return NextResponse.json({ error: "Not a mystery box" }, { status: 400 });
  }

  // Draw reward
  const reward = drawMysteryReward(order.product.rewards);

  // Update order with result
  await prisma.order.update({
    where: { id: order.id },
    data: {
      deliveryNote: `BOX_OPENED: ${reward.name} (${reward.amount})`
    }
  });

  // Here we would normally trigger fulfillment of the ACTUAL reward.
  // For now, we return the result to the UI.

  return NextResponse.json({
    ok: true,
    reward: {
      name: reward.name,
      amount: reward.amount,
      isJackpot: reward.isJackpot
    }
  });
}
