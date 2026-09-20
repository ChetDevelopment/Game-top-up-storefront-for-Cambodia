import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";

import { writeAudit } from "@/lib/audit";
import { guardAdminApi } from "@/lib/api-security";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  type: z.enum(["email", "phone", "ip", "uid"]),
  value: z.string().min(1),
  reason: z.string().optional().nullable(),
});

export async function GET(req: NextRequest) {
  const security = await guardAdminApi(req);
  if ("response" in security) return security.response;

  const list = await prisma.blockedIdentity.findMany({
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(list);
}

export async function POST(req: NextRequest) {
  const security = await guardAdminApi(req);
  if ("response" in security) return security.response;

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid" }, { status: 400 });
  }

  try {
    const entry = await prisma.blockedIdentity.create({
      data: {
        ...parsed.data,
        value: parsed.data.value.trim().toLowerCase(),
      },
    });

    await writeAudit({
      action: "banlist.add",
      targetType: "banlist",
      targetId: entry.id,
      details: { type: entry.type, value: entry.value },
    });

    return NextResponse.json(entry);
  } catch (err: unknown) {
    const error = err as { code?: string };
    if (error.code === "P2002") {
      return NextResponse.json({ error: "Already banned" }, { status: 409 });
    }
    throw err;
  }
}
