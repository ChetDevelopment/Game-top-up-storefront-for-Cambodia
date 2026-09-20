import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";

import { guardAdminApi } from "@/lib/api-security";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const productSchema = z.object({
  gameId: z.string().min(1),
  name: z.string().min(1),
  amount: z.number().int().min(0),
  bonus: z.number().int().min(0).default(0),
  priceUsd: z.number().positive(),
  salePriceUsd: z.number().positive().optional().nullable(),
  saleEndsAt: z.string().datetime().optional().nullable(),
  badge: z.string().optional().nullable(),
  imageUrl: z.string().optional().nullable(),
  active: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
  gameDropOfferId: z.number().int().optional().nullable(),
  g2bulkCatalogueName: z.string().optional().nullable(),
});

export async function GET(req: NextRequest) {
  const security = await guardAdminApi(req);
  if ("response" in security) return security.response;

  const gameId = req.nextUrl.searchParams.get("gameId");
  const products = await prisma.product.findMany({
    where: gameId ? { gameId } : undefined,
    include: { game: { select: { name: true, slug: true } } },
    orderBy: [{ game: { sortOrder: "asc" } }, { sortOrder: "asc" }],
  });
  return NextResponse.json(products);
}

export async function POST(req: NextRequest) {
  const security = await guardAdminApi(req);
  if ("response" in security) return security.response;

  const body = await req.json().catch(() => ({}));
  const parsed = productSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid data", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const product = await prisma.product.create({ data: parsed.data });
  return NextResponse.json(product);
}
