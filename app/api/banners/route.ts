import { prisma } from "@/lib/prisma";
export const revalidate = 60;

import { NextResponse } from "next/server";

export async function GET() {
  const banners = await prisma.heroBanner.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      title: true,
      subtitle: true,
      imageUrl: true,
      linkUrl: true,
      ctaLabel: true,
      active: true,
    },
  });
  return NextResponse.json(banners);
}

