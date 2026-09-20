import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic";

import { z } from "zod";
import { lookupNickname } from "@/lib/uidLookup";
import { checkRateLimit } from "@/lib/rateLimit";

const bodySchema = z.object({
  gameSlug: z.string().min(1).max(60),
  uid: z.string().regex(/^\d{5,20}$/, "UID must be 5–20 digits"),
  server: z.string().regex(/^\d{1,6}$/).optional(),
});

export async function POST(req: NextRequest) {
  // ── rate limit: 10 req / min per IP ──
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!checkRateLimit(`uid-lookup:${ip}`, 10, 60_000)) {
    return NextResponse.json(
      { nickname: null, verified: false, error: "Too many requests — try again shortly" },
      { status: 429 },
    );
  }

  // ── parse body ──
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { nickname: null, verified: false, error: "Invalid JSON" },
      { status: 400 },
    );
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        nickname: null,
        verified: false,
        error: parsed.error.issues[0]?.message ?? "Invalid input",
      },
      { status: 400 },
    );
  }

  const { gameSlug, uid, server } = parsed.data;

  // ── lookup ──
  const nickname = await lookupNickname(gameSlug, uid, server);

  return NextResponse.json({
    nickname,
    verified: nickname !== null,
  });
}

