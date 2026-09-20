import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

const CSRF_SECRET = process.env.CSRF_SECRET || process.env.JWT_SECRET;
if (!CSRF_SECRET) {
  throw new Error("CSRF_SECRET or JWT_SECRET environment variable is required");
}
const CSRF_HEADER = "x-csrf-token";

export function generateCsrfToken(sessionToken: string): string {
  const hmac = crypto.createHmac("sha256", CSRF_SECRET);
  hmac.update(sessionToken);
  return hmac.digest("hex");
}

export function validateCsrfToken(token: string, sessionToken: string): boolean {
  if (!token || !sessionToken) return false;
  if (token.length !== 64 || sessionToken.length < 10) return false;

  const expected = generateCsrfToken(sessionToken);
  try {
    return crypto.timingSafeEqual(
      Buffer.from(token, "hex"),
      Buffer.from(expected, "hex")
    );
  } catch {
    return false;
  }
}

export async function checkCsrfProtection(req: NextRequest): Promise<NextResponse | null> {
  if (!["POST", "PATCH", "PUT", "DELETE"].includes(req.method || "")) {
    return null;
  }

  const cookies = req.headers.get("cookie") || "";

  const adminMatch = cookies.match(/tykhai_admin=([^;]+)/);
  const userMatch = cookies.match(/tykhai_user=([^;]+)/);
  const sessionToken = adminMatch?.[1] || userMatch?.[1];

  if (!sessionToken) {
    return NextResponse.json(
      { error: "CSRF: No session" },
      { status: 403 }
    );
  }

  const csrfToken = req.headers.get(CSRF_HEADER);

  if (!csrfToken) {
    return NextResponse.json(
      { error: "CSRF: Missing token" },
      { status: 403 }
    );
  }

  const isValid = validateCsrfToken(csrfToken, sessionToken);
  if (!isValid) {
    return NextResponse.json(
      { error: "CSRF: Invalid token" },
      { status: 403 }
    );
  }

  return null;
}

export async function getCsrfTokenForClient(req: NextRequest): Promise<NextResponse> {
  const cookies = req.headers.get("cookie") || "";
  const adminMatch = cookies.match(/tykhai_admin=([^;]+)/);
  const userMatch = cookies.match(/tykhai_user=([^;]+)/);
  const sessionToken = adminMatch?.[1] || userMatch?.[1];

  if (!sessionToken) {
    return NextResponse.json(
      { error: "No session" },
      { status: 401 }
    );
  }

  const token = generateCsrfToken(sessionToken);
  return NextResponse.json({ csrfToken: token });
}
