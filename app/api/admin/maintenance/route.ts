import { NextRequest, NextResponse } from "next/server";
import { guardAdminApi } from "@/lib/api-security";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { z } from "zod";

const maintenanceSchema = z.object({
  enabled: z.boolean(),
  message: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const security = await guardAdminApi(req);
  if ("response" in security) return security.response;

  const settings = await prisma.settings.findUnique({
    where: { id: 1 },
    select: { maintenanceMode: true, maintenanceMessage: true },
  });

  return NextResponse.json(settings || { maintenanceMode: false });
}

async function updateMaintenance(req: NextRequest) {
  const security = await guardAdminApi(req);
  if ("response" in security) return security.response;

  const body = await req.json().catch(() => ({}));
  const parsed = maintenanceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid data" }, { status: 400 });
  }

  await prisma.settings.upsert({
    where: { id: 1 },
    update: {
      maintenanceMode: parsed.data.enabled,
      maintenanceMessage: parsed.data.message || null,
    },
    create: {
      id: 1,
      maintenanceMode: parsed.data.enabled,
      maintenanceMessage: parsed.data.message || null,
    },
  });

  await writeAudit({
    action: parsed.data.enabled ? "maintenance.enable" : "maintenance.disable",
    targetType: "settings",
    details: parsed.data.message || undefined,
  });

  return NextResponse.json({
    success: true,
    maintenanceMode: parsed.data.enabled,
    message: parsed.data.message,
  });
}

export async function POST(req: NextRequest) {
  return updateMaintenance(req);
}

export async function PATCH(req: NextRequest) {
  return updateMaintenance(req);
}
