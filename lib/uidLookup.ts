/**
 * Game-specific UID → in-game nickname lookup.
 *
 * FREE FIRE: Uses G2Bulk API (Global support, no region restrictions)
 * OTHER GAMES: Uses CamRapidSecure API at v1.camrapidx.com
 * Every function has a timeout and catches all errors → returns null.
 */

import { prisma } from "./prisma";

// ---------- helpers ----------

interface CamRapidResponse {
  status?: string;
  username?: string;
  user_id?: string;
  message?: string;
}

interface G2BulkResponse {
  valid?: string;
  name?: string;
  nickname?: string;
  username?: string;
}

async function fetchG2Bulk(
  uid: string,
  serverId?: string,
  timeoutMs = 8000,
): Promise<string | null> {
  try {
    const settings = await prisma.settings.findUnique({ where: { id: 1 } });
    
    if (!settings?.g2bulkToken) {
      console.warn("[uidLookup] G2Bulk token not configured");
      return null;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

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
      cache: "no-store",
      signal: controller.signal,
    });
    
    clearTimeout(timer);

    if (!res.ok) return null;

    const data: G2BulkResponse = await res.json();
    if (data.valid === "valid" && (data.name || data.nickname || data.username)) {
      return data.name || data.nickname || data.username || null;
    }
    return null;
  } catch {
    return null;
  }
}

async function fetchCamRapid(
  gameFile: string,
  uid: string,
  zoneId?: string,
  timeoutMs = 6000,
): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let url = `https://v1.camrapidx.com/validate_user/${gameFile}.php?UserID=${encodeURIComponent(uid)}`;
    if (zoneId) url += `&ZoneID=${encodeURIComponent(zoneId)}`;

    const res = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "Ty Khai TopUp/1.0",
      },
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) return null;

    const data: CamRapidResponse = await res.json();
    if (data.status === "APPROVED" && data.username) return data.username;
    return null;
  } catch {
    return null;
  }
}

// ---------- per-game lookups ----------

export async function lookupMobileLegends(
  uid: string,
  zone: string,
): Promise<string | null> {
  return fetchCamRapid("Mobile_Legends_KH", uid, zone);
}

export async function lookupFreeFire(uid: string, serverId?: string): Promise<string | null> {
  // Use G2Bulk for Free Fire (global support)
  return fetchG2Bulk(uid, serverId);
}

export async function lookupGenshin(
  uid: string,
  _server?: string,
): Promise<string | null> {
  return fetchCamRapid("Genshin_Impact", uid);
}

export async function lookupHonkaiStarRail(
  uid: string,
  _server?: string,
): Promise<string | null> {
  return fetchCamRapid("Honkai_Star_Rail", uid);
}

// ---------- router ----------

/**
 * Looks up the in-game nickname for a given game + UID + optional server.
 * Returns the nickname string or null if lookup is unsupported / fails.
 */
export async function lookupNickname(
  gameSlug: string,
  uid: string,
  server?: string,
): Promise<string | null> {
  switch (gameSlug) {
    case "mobile-legends":
      return server ? lookupMobileLegends(uid, server) : null;
    case "free-fire":
      return lookupFreeFire(uid, server);
    case "genshin-impact":
      return lookupGenshin(uid, server);
    case "honkai-star-rail":
      return lookupHonkaiStarRail(uid, server);
    default:
      return null;
  }
}
