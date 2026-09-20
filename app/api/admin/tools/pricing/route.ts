import { prisma } from "@/lib/prisma";
import { guardAdminApi } from "@/lib/api-security";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

const bulkPricingSchema = z.object({
  gameId: z.string().min(1),
  value: z.number().positive(),
  type: z.enum(["percentage", "fixed"]),
  direction: z.enum(["up", "down"]),
  targetFields: z.array(z.enum(["priceUsd", "resellerPriceUsd"])).min(1),
  rounding: z.enum(["none", "99", "95", "00"]),
});

function applyRounding(price: number, rounding: string): number {
  if (rounding === "none") return Math.round(price * 100) / 100;

  const integerPart = Math.floor(price);
  if (rounding === "99") return integerPart + 0.99;
  if (rounding === "95") return integerPart + 0.95;
  if (rounding === "00") return Math.round(price);

  return price;
}

export async function POST(req: NextRequest) {
  const security = await guardAdminApi(req);
  if ("response" in security) return security.response;

  try {
    const body = await req.json().catch(() => ({}));
    const parsed = bulkPricingSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid data", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { gameId, value, type, direction, targetFields, rounding } = parsed.data;
    const products = await prisma.product.findMany({
      where: { gameId },
    });

    const updates = products.flatMap((product) => {
        const data: Record<string, number> = {};

        targetFields.forEach((field) => {
          const currentPrice = product[field];
          if (currentPrice === null || currentPrice === undefined) return;

          let newPrice: number;
          if (type === "percentage") {
            const factor = direction === "up" ? 1 + value / 100 : 1 - value / 100;
            newPrice = currentPrice * factor;
          } else {
            newPrice = direction === "up" ? currentPrice + value : currentPrice - value;
          }

          newPrice = Math.max(0.01, newPrice);
          data[field] = applyRounding(newPrice, rounding);
        });

        if (Object.keys(data).length === 0) return [];

        return [
          prisma.product.update({
            where: { id: product.id },
            data,
          }),
        ];
      });

    if (updates.length > 0) {
      await prisma.$transaction(updates);
    }

    return NextResponse.json({ ok: true, updatedCount: updates.length });
  } catch (error) {
    console.error("[bulk-pricing] error:", error);
    return NextResponse.json({ error: "Operation failed" }, { status: 500 });
  }
}
