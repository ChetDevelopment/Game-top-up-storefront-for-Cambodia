import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic";

import { requireAdmin } from "@/lib/admin-guard";
import { validateEnv, getEnvStatus, ENV_VERSION } from "@/lib/env-validation";

export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req);
  if ("response" in guard) return guard.response;

  const result = validateEnv();

  return NextResponse.json({
    valid: result.valid,
    version: ENV_VERSION,
    errors: result.errors,
    warnings: result.warnings,
    status: getEnvStatus(),
    summary: {
      total: result.errors.length + result.warnings.length,
      errors: result.errors.length,
      warnings: result.warnings.length,
    },
  });
}
