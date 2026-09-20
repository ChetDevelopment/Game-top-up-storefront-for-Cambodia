import { prisma } from "@/lib/prisma";
export const revalidate = 60;

import { NextResponse } from "next/server";

export async function GET() {
  const games = await prisma.game.findMany({
    where: { active: true },
    orderBy: [{ featured: "desc" }, { sortOrder: "asc" }],
    select: {
      id: true,
      slug: true,
      name: true,
      publisher: true,
      currencyName: true,
      imageUrl: true,
      featured: true,
    },
  });
  return NextResponse.json(games);
}

