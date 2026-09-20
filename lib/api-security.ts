import { NextRequest, NextResponse } from "next/server";
import {
  type AdminSession,
  type UserSession,
  requireAdmin,
  requireUser,
} from "@/lib/auth";
import { RATE_LIMITS, checkIPBlock, rateLimit } from "@/lib/rate-limit";
import { checkCsrfProtection } from "@/lib/csrf-protection";

export const adminApiRateLimit = rateLimit(RATE_LIMITS.ADMIN_API);
export const userApiRateLimit = rateLimit(RATE_LIMITS.USER_API);
export const loginApiRateLimit = rateLimit(RATE_LIMITS.LOGIN);
export const ordersApiRateLimit = rateLimit(RATE_LIMITS.ORDERS);

function isUnauthorizedError(error: unknown) {
  return error instanceof Error && error.message === "UNAUTHORIZED";
}

export async function applyRequestProtections(
  req: NextRequest,
  limiter = userApiRateLimit
) {
  const ipBlocked = checkIPBlock(req);
  if (ipBlocked) {
    return ipBlocked;
  }

  const rateLimited = await limiter(req);
  if (rateLimited) {
    return rateLimited;
  }

  return null;
}

export async function guardAdminApi(
  req: NextRequest,
  limiter = adminApiRateLimit
): Promise<{ admin: AdminSession } | { response: NextResponse }> {
  const response = await applyRequestProtections(req, limiter);
  if (response) {
    return { response };
  }

  // CSRF protection for state-changing methods
  if (["POST", "PATCH", "PUT", "DELETE"].includes(req.method || "")) {
    const csrfCheck = await checkCsrfProtection(req);
    if (csrfCheck) {
      return { response: csrfCheck };
    }
  }

  try {
    const admin = await requireAdmin();
    return { admin };
  } catch (error) {
    if (isUnauthorizedError(error)) {
      return {
        response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      };
    }
    throw error;
  }
}

export async function guardUserApi(
  req: NextRequest,
  limiter = userApiRateLimit
): Promise<{ user: UserSession } | { response: NextResponse }> {
  const response = await applyRequestProtections(req, limiter);
  if (response) {
    return { response };
  }

  // CSRF protection for state-changing methods
  if (["POST", "PATCH", "PUT", "DELETE"].includes(req.method || "")) {
    const csrfCheck = await checkCsrfProtection(req);
    if (csrfCheck) {
      return { response: csrfCheck };
    }
  }

  try {
    const user = await requireUser();
    return { user };
  } catch (error) {
    if (isUnauthorizedError(error)) {
      return {
        response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      };
    }
    throw error;
  }
}
