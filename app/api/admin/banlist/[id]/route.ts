import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";

import { writeAudit } from "@/lib/audit";
import { guardAdminApi } from "@/lib/api-security";
import { NextRequest, NextResponse } from "next/server";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await guardAdminApi(req);
  if ("response" in security) return security.response;

  const { id } = await params;
  const entry = await prisma.blockedIdentity.findUnique({ where: { id } });
  if (!entry) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.blockedIdentity.delete({ where: { id } });
  await writeAudit({
    action: "banlist.remove",
    targetType: "banlist",
    targetId: id,
  });

  return NextResponse.json({ ok: true });
}
