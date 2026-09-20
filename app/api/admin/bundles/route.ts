import { NextRequest, NextResponse } from "next/server";
import { guardAdminApi } from "@/lib/api-security";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { z } from "zod";

const bundleSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  products: z.array(z.string()).min(2),
  bundlePrice: z.number().positive(),
  badge: z.string().optional(),
  expiresAt: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const security = await guardAdminApi(req);
  if ("response" in security) return security.response;

  const bundles = await prisma.bundle.findMany({
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(bundles);
}

export async function POST(req: NextRequest) {
  const security = await guardAdminApi(req);
  if ("response" in security) return security.response;

  const body = await req.json().catch(() => ({}));
  const parsed = bundleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid data" }, { status: 400 });
  }

  const { products, expiresAt, ...data } = parsed.data;

  let originalPrice = 0;
  for (const productId of products) {
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (product) {
      originalPrice += product.priceUsd;
    }
  }

  const bundle = await prisma.bundle.create({
    data: {
      ...data,
      products: JSON.stringify(products),
      originalPrice,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    },
  });

  await writeAudit({
    action: "bundle.create",
    targetType: "bundle",
    targetId: bundle.id,
    details: `Created bundle: ${bundle.name}`,
  });

  return NextResponse.json(bundle);
}

export async function DELETE(req: NextRequest) {
  const security = await guardAdminApi(req);
  if ("response" in security) return security.response;

  const body = await req.json().catch(() => ({}));
  const { id } = body;

  if (!id) {
    return NextResponse.json({ error: "Bundle ID required" }, { status: 400 });
  }

  const bundle = await prisma.bundle.findUnique({ where: { id } });
  if (!bundle) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.bundle.delete({ where: { id } });

  await writeAudit({
    action: "bundle.delete",
    targetType: "bundle",
    targetId: id,
    details: "Deleted bundle",
  });

  return NextResponse.json({ ok: true });
}
