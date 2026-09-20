import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic";

import { z } from "zod";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// In-game ID → nickname check.
// Upstream: https://v1.camrapidx.com/validate_user/
// For Free Fire SGMY with G2Bulk: uses G2Bulk API
//
// Route is public (used by the checkout form) but intentionally narrow:
// we only forward a fixed set of game slugs and strip out anything else.

const schema = z.object({
  slug: z.enum(["mobile-legends", "genshin-impact", "honkai-star-rail", "free-fire"]),
  uid: z.string().min(4, "UID must be at least 4 characters").max(64, "UID too long"),
  // Allow longer serverIds (some games have descriptive names like "SG(Khmer)")
  serverId: z.string().max(32).optional(),
});

// Safe parsing: accept both serverId as string or undefined
function sanitizeServerId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

// Maps our game slugs → camrapidx endpoint path + whether a server param is needed.
// IMPORTANT: Verify these endpoint names with camrapidx.com documentation
// Note: honkai-star-rail is NOT supported by camrapidx.com
const CAMRAPIDX_GAMES: Record<
  z.infer<typeof schema>["slug"],
  { file: string; needsZone: boolean }
> = {
  "mobile-legends":    { file: "Mobile_Legends_KH", needsZone: true },
  "genshin-impact":    { file: "Genshin_Impact",    needsZone: false },
  "free-fire":         { file: "FreeFire_Global",    needsZone: false },
};

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    console.error("[check-id] Validation error:", parsed.error.issues);
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message || "Invalid input" },
      { status: 400 }
    );
  }
  const { slug, uid, serverId: rawServerId } = parsed.data;
  
  // Handle serverId: convert empty string to undefined
  const serverId = rawServerId && rawServerId.trim().length > 0 ? rawServerId.trim() : undefined;
  
  // Validate UID format based on game
  // Mobile Legends: 5-12 digits
  // Free Fire, Genshin, HSR: use general validation
  if (slug === "mobile-legends") {
    if (!/^\d{5,12}$/.test(uid.trim())) {
      return NextResponse.json(
        { success: false, error: "Mobile Legends UID must be 5-12 digits" },
        { status: 400 }
      );
    }
  } else if (slug === "free-fire") {
    // Free Fire UIDs can be hexadecimal, up to 32 chars
    if (!/^[a-fA-F0-9]{4,32}$/.test(uid.trim())) {
      return NextResponse.json(
        { success: false, error: "Free Fire UID must be 4-32 hex characters" },
        { status: 400 }
      );
    }
  } else {
    // General validation for other games (Genshin, HSR)
    if (!/^[a-zA-Z0-9-_]{4,64}$/.test(uid.trim())) {
      return NextResponse.json(
        { success: false, error: "Invalid UID format (4-64 characters, letters/digits only)" },
        { status: 400 }
      );
    }
  }

  // FREE FIRE: Use G2Bulk ONLY (CamRapid has region restrictions)
  if (slug === "free-fire") {
    const settings = await prisma.settings.findUnique({ where: { id: 1 } });
    
    // G2Bulk is required for Free Fire SGMY
    if (!settings?.g2bulkToken) {
      console.error("[check-id] G2Bulk token not configured!");
      return NextResponse.json(
        { success: false, error: "G2Bulk not configured. Please contact admin." },
        { status: 503 }
      );
    }
    
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      
      const res = await fetch("https://api.g2bulk.com/v1/games/checkPlayerId", {
        method: "POST",
        headers: {
          "X-API-Key": settings.g2bulkToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          game: "freefire_sgmy",
          user_id: uid,
          server_id: serverId,
        }),
        signal: controller.signal,
        cache: "no-store",
      });
      clearTimeout(timeout);

      if (!res.ok) {
        console.error("[check-id] G2Bulk API error:", res.status);
        return NextResponse.json(
          { success: false, error: "G2Bulk validation failed" },
          { status: 502 }
        );
      }

      const data = await res.json();
      
      if (data.valid !== "valid") {
        return NextResponse.json(
          { success: false, error: "Player not found — check your ID and server." },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        name: data.name || data.nickname || "Player",
        uid: uid,
        serverId: serverId ?? null,
      });
    } catch (err) {
      const aborted = err instanceof Error && err.name === "AbortError";
      console.error("[check-id] G2Bulk error:", aborted ? "Timeout" : err.message);
      return NextResponse.json(
        { success: false, error: aborted ? "Lookup timed out" : "Network error" },
        { status: 504 }
      );
    }
  }
  
  // Other games use CamRapid (Mobile Legends, Genshin, HSR)
  const cfg = CAMRAPIDX_GAMES[slug];

  if (cfg.needsZone && !serverId) {
    return NextResponse.json(
      { success: false, error: "Server/Zone ID is required for this game" },
      { status: 400 }
    );
  }

  // Build camrapidx URL
  let upstreamUrl = `https://v1.camrapidx.com/validate_user/${cfg.file}.php?UserID=${encodeURIComponent(uid)}`;
  if (cfg.needsZone && serverId) {
    upstreamUrl += `&ZoneID=${encodeURIComponent(serverId)}`;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(upstreamUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "Ty Khai TopUp/1.0",
      },
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return NextResponse.json(
        { success: false, error: "Lookup failed" },
        { status: 502 }
      );
    }

    const data: unknown = await res.json().catch(() => null);
    if (!data || typeof data !== "object") {
      return NextResponse.json(
        { success: false, error: "Invalid response" },
        { status: 502 }
      );
    }

    const d = data as { status?: string; username?: string; user_id?: string; message?: string };
    
    if (d.status !== "APPROVED" || !d.username) {
      // Check if it's a region issue - suggest using G2Bulk
      const isRegionIssue = d.message?.includes("Not Support Region");
      const msg = isRegionIssue 
        ? "CamRapid API region restriction. Please use G2Bulk for global validation."
        : (d.message && d.message !== "Successfully Verified" 
          ? d.message 
          : "Player not found — check your ID and zone.");
      
      console.log("[check-id] CamRapid validation failed:", msg);
      return NextResponse.json(
        { success: false, error: msg },
        { status: isRegionIssue ? 503 : 404 }
      );
    }

    return NextResponse.json({
      success: true,
      name: d.username,
      uid: d.user_id || uid,
      serverId: serverId ?? null,
    });
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return NextResponse.json(
      { success: false, error: aborted ? "Lookup timed out" : "Network error" },
      { status: 504 }
    );
  }
}

