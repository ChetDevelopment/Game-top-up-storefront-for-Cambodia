import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const reviewSchema = z.object({
  orderNumber: z.string().min(1),
  rating: z.number().min(1).max(5),
  comment: z.string().optional(),
  customerName: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = reviewSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid data" }, { status: 400 });
    }

    const { orderNumber, rating, comment, customerName } = parsed.data;

    // 1. Find the order and verify it's DELIVERED
    const order = await prisma.order.findUnique({
      where: { orderNumber },
      include: { product: true }
    });

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    if (order.status !== "DELIVERED") {
      return NextResponse.json({ error: "Only delivered orders can be reviewed" }, { status: 403 });
    }

    // 2. Check if a review already exists for this order
    const existingReview = await prisma.review.findUnique({
      where: { orderId: order.id }
    });

    if (existingReview) {
      return NextResponse.json({ error: "Review already submitted for this order" }, { status: 409 });
    }

    // 3. Create the review
    const review = await prisma.review.create({
      data: {
        orderId: order.id,
        productId: order.productId,
        rating,
        comment,
        customerName,
        isPublic: true,
      }
    });

    return NextResponse.json({ ok: true, review });
  } catch (err) {
    console.error("[reviews] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const productId = searchParams.get("productId");
  const gameId = searchParams.get("gameId");

  try {
    const where: any = { isPublic: true };
    if (productId) where.productId = productId;
    if (gameId) where.product = { gameId };

    const reviews = await prisma.review.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    return NextResponse.json(reviews);
  } catch (err) {
    return NextResponse.json({ error: "Failed to fetch reviews" }, { status: 500 });
  }
}
