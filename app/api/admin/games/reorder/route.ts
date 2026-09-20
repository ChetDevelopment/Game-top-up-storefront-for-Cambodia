import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";

import { writeAudit } from "@/lib/audit";
import { guardAdminApi } from "@/lib/api-security";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  id: z.string(),
  direction: z.enum(["up", "down"]),
});

/**
 * Swap two adjacent games by sortOrder. Lets admins reorder the homepage
 * lineup without a drag-drop library.
 */
export async function POST(req: NextRequest) {
  const security = await guardAdminApi(req);
  if ("response" in security) return security.response;

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid" }, { status: 400 });

  const all = await prisma.game.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  const idx = all.findIndex((game: any) => game.id === parsed.data.id);
  if (idx === -1) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const swapIdx = parsed.data.direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= all.length) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const a = all[idx];
  const b = all[swapIdx];
  await prisma.$transaction([
    prisma.game.update({ where: { id: a.id }, data: { sortOrder: b.sortOrder } }),
    prisma.game.update({ where: { id: b.id }, data: { sortOrder: a.sortOrder } }),
  ]);

  // Normalize if both had the same sortOrder (happens with defaults of 0).
  if (a.sortOrder === b.sortOrder) {
    await prisma.$transaction(
      all.map((game: any, index: number) =>
        prisma.game.update({
          where: { id: game.id },
          data: { sortOrder: index * 10 },
        })
      )
    );
  }

  await writeAudit({
    action: "game.reorder",
    targetType: "game",
    targetId: a.id,
    details: { direction: parsed.data.direction },
  });

  return NextResponse.json({ ok: true });
}
