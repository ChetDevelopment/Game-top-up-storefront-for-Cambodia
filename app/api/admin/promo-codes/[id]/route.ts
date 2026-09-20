import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";

import { guardAdminApi } from "@/lib/api-security";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await guardAdminApi(req);
  if ("response" in security) return security.response;

  const { id } = await params;
  const existing = await prisma.promoCode.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const promo = await prisma.promoCode.update({
    where: { id },
    data: {
      ...(typeof body.active === "boolean" ? { active: body.active } : {}),
      ...(typeof body.maxUses === "number" ? { maxUses: body.maxUses } : {}),
      ...(body.expiresAt !== undefined
        ? { expiresAt: body.expiresAt ? new Date(body.expiresAt) : null }
        : {}),
    },
  });

  return NextResponse.json(promo);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await guardAdminApi(req);
  if ("response" in security) return security.response;

  const { id } = await params;
  const existing = await prisma.promoCode.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.promoCode.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
