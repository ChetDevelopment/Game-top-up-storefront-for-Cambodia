import { NextRequest, NextResponse } from "next/server";
import { getCsrfTokenForClient } from "@/lib/csrf-protection";

export async function GET(req: NextRequest) {
  return getCsrfTokenForClient(req);
}
