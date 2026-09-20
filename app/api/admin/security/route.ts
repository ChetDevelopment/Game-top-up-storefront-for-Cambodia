import { NextRequest, NextResponse } from "next/server";
import { guardAdminApi } from "@/lib/api-security";
import { logSecurityEvent, getSecurityLogs, getSecurityStats } from "@/lib/logger";
import { isSuspiciousRequest } from "@/lib/security";

export async function GET(req: NextRequest) {
  const security = await guardAdminApi(req);
  if ("response" in security) return security.response;

  if (isSuspiciousRequest(req)) {
    logSecurityEvent("SECURITY", "Suspicious security log access attempt", req);
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const type = url.searchParams.get("type") || "stats";
  const count = parseInt(url.searchParams.get("count") || "50");

  if (type === "stats") {
    const stats = getSecurityStats();
    return NextResponse.json(stats);
  }

  const logs = getSecurityLogs(count);
  return NextResponse.json({ logs, total: logs.length });
}

export async function POST(req: NextRequest) {
  const security = await guardAdminApi(req);
  if ("response" in security) return security.response;

  const body = await req.json().catch(() => ({}));
  const { event, details } = body;

  logSecurityEvent("AUDIT", event || "Manual admin log", req, details);
  return NextResponse.json({ success: true });
}
