import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const gameId = req.nextUrl.searchParams.get("gameId");
  const gameSlug = req.nextUrl.searchParams.get("slug");

  if (!gameId && !gameSlug) {
    return NextResponse.json({ error: "gameId or slug required" }, { status: 400 });
  }

  const products = await prisma.product.findMany({
    where: {
      active: true,
      ...(gameId
        ? { gameId }
        : { game: { slug: gameSlug! } }),
    },
    orderBy: { sortOrder: "asc" },
  });

  return NextResponse.json(products);
}

