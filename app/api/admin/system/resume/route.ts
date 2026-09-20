import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { guardAdminApi } from "@/lib/api-security";
import { resumeSystem } from "@/lib/system-control";

export async function POST(req: NextRequest) {
  const security = await guardAdminApi(req);
  if ("response" in security) return security.response;

  try {
    await resumeSystem("MANUAL");
    return NextResponse.json({ success: true, status: "ACTIVE" });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
