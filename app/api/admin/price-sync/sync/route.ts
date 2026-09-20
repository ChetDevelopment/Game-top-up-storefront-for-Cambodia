import { NextRequest, NextResponse } from "next/server";
import { guardAdminApi } from "@/lib/api-security";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const security = await guardAdminApi(req);
  if ("response" in security) return security.response;

  try {
    const body = await req.json();
    const { updates } = body;

    if (!Array.isArray(updates) || updates.length === 0) {
      return NextResponse.json(
        { error: "No updates provided" },
        { status: 400 }
      );
    }

    let updated = 0;

    for (const item of updates) {
      const { productId, newPrice, catalogueName } = item;

      if (!productId || !newPrice) continue;

      await prisma.product.update({
        where: { id: productId },
        data: {
          priceUsd: newPrice,
          g2bulkCatalogueName: catalogueName,
        },
      });

      updated++;
    }

    return NextResponse.json({ success: true, updated });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}
