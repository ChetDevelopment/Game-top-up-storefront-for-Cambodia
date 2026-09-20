import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { rateLimit, RATE_LIMITS, checkIPBlock, blockIP } from "./lib/rate-limit";
import { checkCsrfProtection } from "./lib/csrf-protection";
import { isSuspiciousRequest } from "./lib/security";

const SESSION_COOKIE = "tykhai_admin";
const USER_COOKIE = "tykhai_user";

function getSecret(): Uint8Array | null {
  const secret = process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret || secret.length < 32) return null;
  return new TextEncoder().encode(secret);
}

const loginLimiter = rateLimit(RATE_LIMITS.LOGIN);
const registerLimiter = rateLimit(RATE_LIMITS.REGISTER);
const paymentLimiter = rateLimit(RATE_LIMITS.PAYMENT);
const ordersLimiter = rateLimit(RATE_LIMITS.ORDERS);
const publicApiLimiter = rateLimit(RATE_LIMITS.PUBLIC_API);
const adminApiLimiter = rateLimit(RATE_LIMITS.ADMIN_API);

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1. IP block check
  const ipBlockResponse = checkIPBlock(req);
  if (ipBlockResponse) return ipBlockResponse;

  // 2. Suspicious request detection
  if (isSuspiciousRequest(req)) {
    const forwarded = req.headers.get("x-forwarded-for");
    const ip = forwarded ? forwarded.split(",")[0]?.trim() : "unknown";
    blockIP(ip);
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403 }
    );
  }

  // 3. Rate limiting by path
  let rateLimitResponse: NextResponse | null = null;

  if (pathname.startsWith("/api/auth/signin") || pathname.startsWith("/api/auth/register") || pathname.startsWith("/api/user/auth/login") || pathname.startsWith("/api/user/auth/register")) {
    rateLimitResponse = await loginLimiter(req);
  } else if (pathname.startsWith("/api/payment")) {
    rateLimitResponse = await paymentLimiter(req);
  } else if (pathname.startsWith("/api/orders")) {
    if (!pathname.includes("/verify")) {
      rateLimitResponse = await ordersLimiter(req);
    }
  } else if (pathname.startsWith("/api/admin/")) {
    rateLimitResponse = await adminApiLimiter(req);
  } else if (pathname.startsWith("/api/")) {
    rateLimitResponse = await publicApiLimiter(req);
  }

  if (rateLimitResponse) {
    const forwarded = req.headers.get("x-forwarded-for");
    const ip = forwarded ? forwarded.split(",")[0]?.trim() : "unknown";
    blockIP(ip);
    return rateLimitResponse;
  }

  // 4. CSRF protection for state-changing requests on API routes
  if (pathname.startsWith("/api/") && ["POST", "PATCH", "PUT", "DELETE"].includes(req.method || "")) {
    const csrfResponse = await checkCsrfProtection(req);
    if (csrfResponse) return csrfResponse;
  }

  // 5. Admin route protection
  if (pathname.startsWith("/admin") && pathname !== "/admin/login") {
    if (!pathname.startsWith("/api/admin/auth")) {
      const token = req.cookies.get(SESSION_COOKIE)?.value;
      const secret = getSecret();

      if (!token || !secret) {
        if (pathname.startsWith("/api/")) {
          return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        return NextResponse.redirect(new URL("/admin/login", req.url));
      }

      try {
        const { payload } = await jwtVerify(token, secret);
        if (!payload.adminId || !payload.email || !payload.role) {
          throw new Error("Invalid admin token");
        }
      } catch {
        if (pathname.startsWith("/api/")) {
          return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        return NextResponse.redirect(new URL("/admin/login", req.url));
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/api/admin/:path*",
    "/api/:path*",
  ],
};
