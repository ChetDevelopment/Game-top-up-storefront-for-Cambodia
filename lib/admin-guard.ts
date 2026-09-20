import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { rateLimit, RATE_LIMITS, checkIPBlock } from "@/lib/rate-limit";
import { checkCsrfProtection } from "@/lib/csrf-protection";
import { isSuspiciousRequest } from "@/lib/security";

const SESSION_COOKIE = "tykhai_admin";

function getSecret(): Uint8Array | null {
  const secret = process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret || secret.length < 32) return null;
  return new TextEncoder().encode(secret);
}

const adminApiLimiter = rateLimit(RATE_LIMITS.ADMIN_API);

export interface AdminSession {
  adminId: string;
  email: string;
  role: string;
}

export async function requireAdmin(req: NextRequest): Promise<
  { admin: AdminSession } | { response: NextResponse }
> {
  const ipBlocked = checkIPBlock(req);
  if (ipBlocked) return { response: ipBlocked };

  const rateLimited = await adminApiLimiter(req);
  if (rateLimited) return { response: rateLimited };

  if (["POST", "PATCH", "PUT", "DELETE"].includes(req.method || "")) {
    const csrfCheck = await checkCsrfProtection(req);
    if (csrfCheck) return { response: csrfCheck };
  }

  if (isSuspiciousRequest(req)) {
    return {
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const secret = getSecret();

  if (!token || !secret) {
    return {
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  try {
    const { payload } = await jwtVerify(token, secret);
    if (!payload.adminId || !payload.email || !payload.role) {
      throw new Error("Invalid token payload");
    }
    return {
      admin: {
        adminId: payload.adminId as string,
        email: payload.email as string,
        role: payload.role as string,
      },
    };
  } catch {
    return {
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
}

export function adminGuardApi(action: string) {
  return async function handler(
    req: NextRequest,
    { params }: { params: Record<string, string> },
    apiHandler: (req: NextRequest, admin: AdminSession, params: Record<string, string>) => Promise<NextResponse>
  ): Promise<NextResponse> {
    const guard = await requireAdmin(req);
    if ("response" in guard) {
      if (action) {
        console.warn(`[ADMIN_AUDIT] ${action} blocked:`, {
          ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
          path: req.nextUrl.pathname,
        });
      }
      return guard.response;
    }
    return apiHandler(req, guard.admin, params);
  };
}
