import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  code: z.string().min(1),
  orderAmountUsd: z.number().positive(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const { code, orderAmountUsd } = parsed.data;
    const promo = await prisma.promoCode.findUnique({
      where: { code: code.toUpperCase().trim() },
    });

    if (!promo || !promo.active) {
      return NextResponse.json({ error: "Invalid promo code" }, { status: 404 });
    }

    if (promo.expiresAt && promo.expiresAt < new Date()) {
      return NextResponse.json({ error: "This promo code has expired" }, { status: 400 });
    }

    if (promo.maxUses > 0 && promo.usedCount >= promo.maxUses) {
      return NextResponse.json({ error: "This promo code has reached its usage limit" }, { status: 400 });
    }

    if (orderAmountUsd < promo.minOrderUsd) {
      return NextResponse.json(
        { error: `Minimum order of $${promo.minOrderUsd.toFixed(2)} required` },
        { status: 400 }
      );
    }

    let discountUsd =
      promo.discountType === "PERCENT"
        ? (orderAmountUsd * promo.discountValue) / 100
        : promo.discountValue;

    // Cap discount at order total
    discountUsd = Math.min(discountUsd, orderAmountUsd);
    discountUsd = Math.round(discountUsd * 100) / 100;

    return NextResponse.json({
      valid: true,
      code: promo.code,
      discountType: promo.discountType,
      discountValue: promo.discountValue,
      discountUsd,
      finalAmountUsd: Math.round((orderAmountUsd - discountUsd) * 100) / 100,
    });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

