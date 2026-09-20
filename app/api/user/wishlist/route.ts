import { NextRequest, NextResponse } from "next/server";
import { guardUserApi } from "@/lib/api-security";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const addSchema = z.object({
  productId: z.string().min(1),
});

export async function GET(req: NextRequest) {
  const security = await guardUserApi(req);
  if ("response" in security) return security.response;

  const wishlist = await prisma.wishlist.findMany({
    where: { userId: security.user.userId },
    include: {
      product: {
        include: {
          game: { select: { id: true, name: true, slug: true, imageUrl: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(wishlist);
}

export async function POST(req: NextRequest) {
  const security = await guardUserApi(req);
  if ("response" in security) return security.response;

  const body = await req.json().catch(() => ({}));
  const parsed = addSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid product ID" }, { status: 400 });
  }

  const product = await prisma.product.findUnique({
    where: { id: parsed.data.productId },
  });
  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  const wishlist = await prisma.wishlist.upsert({
    where: {
      userId_productId: {
        userId: security.user.userId,
        productId: parsed.data.productId,
      },
    },
    update: {},
    create: {
      userId: security.user.userId,
      productId: parsed.data.productId,
    },
  });

  return NextResponse.json(wishlist);
}

export async function DELETE(req: NextRequest) {
  const security = await guardUserApi(req);
  if ("response" in security) return security.response;

  const body = await req.json().catch(() => ({}));
  const parsed = addSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Product ID required" }, { status: 400 });
  }

  await prisma.wishlist.deleteMany({
    where: {
      userId: security.user.userId,
      productId: parsed.data.productId,
    },
  });

  return NextResponse.json({ ok: true });
}
