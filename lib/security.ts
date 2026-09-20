import { NextRequest, NextResponse } from "next/server";

const SUSPICIOUS_PATTERNS = [
  /\.\.\/?/,              // Path traversal
  /<script[\s>]/i,        // XSS
  /union[\s]+.*select/i,  // SQL injection
  /exec.*(?:cmd|shell)/i, // Command injection
  /\/proc\/self\//i,      // File access
  /(?:base64|hex):.*[A-Za-z0-9+/]{40,}/i, // Encoded payloads
  /['"];\s*\/\*/i,        // SQL comment injection
  /\b(?:DROP|TRUNCATE|ALTER|DELETE|INSERT|UPDATE)\s/i, // Dangerous SQL
  /\b(?:system|popen|exec|shell_exec|passthru|eval)\s*\(/i, // PHP/Node injection
];

export function sanitizeInput(input: string, maxLength: number = 1000): string {
  if (typeof input !== "string") return "";
  return input
    .replace(/[<>]/g, "")
    .replace(/javascript:/gi, "")
    .replace(/on\w+=/gi, "")
    .replace(/data:\s*text\/html/gi, "")
    .trim()
    .slice(0, maxLength);
}

export function sanitizeEmail(email: string): string {
  if (typeof email !== "string") return "";
  return email.toLowerCase().trim().slice(0, 255);
}

export function validateUid(uid: string): boolean {
  if (typeof uid !== "string") return false;
  return /^[a-zA-Z0-9-_]{4,20}$/.test(uid);
}

export function validateServerId(serverId: string): boolean {
  if (typeof serverId !== "string") return false;
  return /^[a-zA-Z0-9-_]{1,20}$/.test(serverId);
}

export function addSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-XSS-Protection", "1; mode=block");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export function isSuspiciousRequest(req: NextRequest): boolean {
  const url = req.url;
  const searchParams = req.nextUrl.search;
  const userAgent = req.headers.get("user-agent") || "";
  const contentType = req.headers.get("content-type") || "";

  for (const pattern of SUSPICIOUS_PATTERNS) {
    if (pattern.test(url) || pattern.test(searchParams)) {
      return true;
    }
  }

  // Check for suspicious content type
  if (contentType.includes("text/html") && !url.includes("/admin")) {
    return true;
  }

  if (contentType.includes("application/x-www-form-urlencoded")) {
    return true;
  }

  if (!userAgent || userAgent.length < 10) {
    return true;
  }

  return false;
}

export function secureJson(data: unknown, status: number = 200): NextResponse {
  const response = NextResponse.json(data, { status });
  return addSecurityHeaders(response);
}

export function logSecurityEvent(event: string, details: unknown, req: NextRequest): void {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const timestamp = new Date().toISOString();
  console.warn(`[SECURITY] ${timestamp} | ${event} | IP: ${ip} |`, details);
}

export function sanitizeHeaders(headers: Headers): Headers {
  const sanitized = new Headers(headers);
  sanitized.delete("cookie");
  sanitized.delete("authorization");
  return sanitized;
}

export function isValidOrderNumber(orderNumber: string): boolean {
  return /^TY[a-zA-Z0-9]{6,}$/.test(orderNumber);
}

export function isValidPaymentRef(ref: string): boolean {
  return /^[a-zA-Z0-9_-]{6,64}$/.test(ref);
}

export function isValidAmount(amount: unknown): amount is number {
  return typeof amount === "number" && !isNaN(amount) && amount > 0 && amount < 1000000;
}
