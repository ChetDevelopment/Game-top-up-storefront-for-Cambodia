import { NextRequest, NextResponse } from "next/server";
import { guardAdminApi } from "@/lib/api-security";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { decryptField } from "@/lib/encryption";
import { z } from "zod";

const resellerSchema = z.object({
  resellerId: z.string(),
  action: z.enum(["approve", "revoke", "set_discount"]),
  discount: z.number().min(0).max(100).optional(),
});

export async function GET(req: NextRequest) {
  const security = await guardAdminApi(req);
  if ("response" in security) return security.response;

  const resellers = await prisma.user.findMany({
    where: { role: "RESELLER" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      name: true,
      totalSpentUsd: true,
      pointsBalance: true,
      resellerDiscount: true,
      createdAt: true,
      _count: { select: { orders: true } },
    },
  });

  // Decrypt emails
  const decryptedResellers = resellers.map((reseller: any) => ({
    ...reseller,
    email: reseller.email ? (decryptField(reseller.email) || reseller.email) : reseller.email,
  }));

  return NextResponse.json(decryptedResellers);
}

export async function PATCH(req: NextRequest) {
  const security = await guardAdminApi(req);
  if ("response" in security) return security.response;

  const body = await req.json().catch(() => ({}));
  const parsed = resellerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid data" }, { status: 400 });
  }

  const { resellerId, action, discount } = parsed.data;
  const reseller = await prisma.user.findUnique({ where: { id: resellerId } });
  if (!reseller) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  switch (action) {
    case "approve":
      await prisma.user.update({
        where: { id: resellerId },
        data: { role: "RESELLER" },
      });
      await writeAudit({
        action: "reseller.approve",
        targetType: "user",
        targetId: resellerId,
      });
      break;

    case "revoke":
      await prisma.user.update({
        where: { id: resellerId },
        data: { role: "USER", resellerDiscount: 0 },
      });
      await writeAudit({
        action: "reseller.revoke",
        targetType: "user",
        targetId: resellerId,
      });
      break;

    case "set_discount":
      if (discount === undefined) {
        return NextResponse.json({ error: "Discount required" }, { status: 400 });
      }
      await prisma.user.update({
        where: { id: resellerId },
        data: { role: "RESELLER", resellerDiscount: discount },
      });
      await writeAudit({
        action: "reseller.set_discount",
        targetType: "user",
        targetId: resellerId,
        details: { discount },
      });
      break;
  }

  return NextResponse.json({ ok: true });
}
