import { NextRequest, NextResponse } from "next/server";
import { guardAdminApi } from "@/lib/api-security";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { z } from "zod";

const vipSchema = z.object({
  userIds: z.array(z.string()).min(1),
  vipRank: z.enum(["BRONZE", "SILVER", "GOLD", "DIAMOND_LEGEND"]),
});

export async function PATCH(req: NextRequest) {
  const security = await guardAdminApi(req);
  if ("response" in security) return security.response;

  const body = await req.json().catch(() => ({}));
  const parsed = vipSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid data" }, { status: 400 });
  }

  const { userIds, vipRank } = parsed.data;
  const result = await prisma.user.updateMany({
    where: { id: { in: userIds } },
    data: { vipRank },
  });

  await writeAudit({
    action: "users.vip_bulk_update",
    targetType: "user",
    details: `Updated ${result.count} users to ${vipRank}`,
  });

  return NextResponse.json({ ok: true, updated: result.count });
}
