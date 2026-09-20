import { NextRequest, NextResponse } from "next/server";
import { guardAdminApi } from "@/lib/api-security";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const security = await guardAdminApi(req);
  if ("response" in security) return security.response;

  try {
    const settings = await prisma.settings.findUnique({ where: { id: 1 } });

    if (!settings?.g2bulkToken) {
      return NextResponse.json(
        { error: "G2Bulk token not configured" },
        { status: 400 }
      );
    }

    // Fetch G2Bulk catalogue for Free Fire SGMY
    const res = await fetch("https://api.g2bulk.com/v1/games/freefire_sgmy/catalogue", {
      headers: { "X-API-Key": settings.g2bulkToken },
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `G2Bulk API error: ${res.status}` },
        { status: 502 }
      );
    }

    const data = await res.json();

    if (!data.success) {
      return NextResponse.json(
        { error: "Failed to fetch G2Bulk catalogue" },
        { status: 502 }
      );
    }

    // Fetch existing products (only Free Fire)
    const products = await prisma.product.findMany({
      where: { game: { slug: "free-fire" } },
      include: { game: { select: { slug: true, name: true } } },
      orderBy: { amount: "asc" },
    });

    return NextResponse.json({
      catalogue: data.catalogues || [],
      products,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}
