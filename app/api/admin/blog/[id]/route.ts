import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";

import { writeAudit } from "@/lib/audit";
import { guardAdminApi } from "@/lib/api-security";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/).optional(),
  title: z.string().min(1).optional(),
  excerpt: z.string().optional().nullable(),
  content: z.string().min(1).optional(),
  coverUrl: z.string().optional().nullable(),
  tag: z.string().optional().nullable(),
  published: z.boolean().optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await guardAdminApi(req);
  if ("response" in security) return security.response;

  const { id } = await params;
  const post = await prisma.blogPost.findUnique({ where: { id } });
  if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(post);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await guardAdminApi(req);
  if ("response" in security) return security.response;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid" }, { status: 400 });

  const existing = await prisma.blogPost.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.published === true && !existing.publishedAt) {
    data.publishedAt = new Date();
  }
  if (parsed.data.published === false) {
    data.publishedAt = null;
  }

  const post = await prisma.blogPost.update({ where: { id }, data });
  await writeAudit({
    action: "blog.update",
    targetType: "blog",
    targetId: id,
    details: parsed.data,
  });
  return NextResponse.json(post);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await guardAdminApi(req);
  if ("response" in security) return security.response;

  const { id } = await params;
  const existing = await prisma.blogPost.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.blogPost.delete({ where: { id } });
  await writeAudit({
    action: "blog.delete",
    targetType: "blog",
    targetId: id,
  });
  return NextResponse.json({ ok: true });
}
