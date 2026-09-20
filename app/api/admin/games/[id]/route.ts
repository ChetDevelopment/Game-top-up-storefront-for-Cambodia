import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";

import { guardAdminApi } from "@/lib/api-security";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const imagePath = z
  .string()
  .min(1)
  .refine(
    (value) =>
      /^https?:\/\//i.test(value) ||
      value.startsWith("/uploads/") ||
      value.startsWith("/"),
    { message: "Must be a URL or uploaded file path" }
  );

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  publisher: z.string().min(1).optional(),
  description: z.string().optional(),
  imageUrl: imagePath.optional(),
  bannerUrl: imagePath.optional().or(z.literal("")),
  currencyName: z.string().min(1).optional(),
  uidLabel: z.string().optional(),
  uidExample: z.string().optional(),
  requiresServer: z.boolean().optional(),
  servers: z.string().optional(),
  featured: z.boolean().optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await guardAdminApi(req);
  if ("response" in security) return security.response;

  const { id } = await params;
  const game = await prisma.game.findUnique({
    where: { id },
    include: {
      products: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!game) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(game);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await guardAdminApi(req);
  if ("response" in security) return security.response;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid" }, { status: 400 });
  }

  const existing = await prisma.game.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const game = await prisma.game.update({
    where: { id },
    data: parsed.data,
  });
  return NextResponse.json(game);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await guardAdminApi(req);
  if ("response" in security) return security.response;

  const { id } = await params;
  const existing = await prisma.game.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.game.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
