import { NextRequest, NextResponse } from "next/server";
import { generateCsrfToken as genToken, validateCsrfToken, checkCsrfProtection, getCsrfTokenForClient } from "./csrf-protection";

const HEADER_NAME = "x-csrf-token";

// Middleware to check CSRF for state-changing requests
export async function checkCsrf(req: NextRequest): Promise<NextResponse | null> {
  return checkCsrfProtection(req);
}

// Get CSRF token for client
export async function getCsrfToken(req: NextRequest): Promise<NextResponse> {
  return getCsrfTokenForClient(req);
}

// Re-export for backward compatibility
export { validateCsrfToken };
export function generateCsrfToken(sessionToken: string): string {
  return genToken(sessionToken);
}
