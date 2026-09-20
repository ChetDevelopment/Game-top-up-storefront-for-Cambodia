import { getRedisClient, isRedisConfigured } from "./redis";

const DEFAULT_TTL_SECONDS = 300;

/**
 * Cache-aside pattern for Redis-backed caching.
 * Used for frequently accessed, rarely changed data (games, products, settings).
 */
export async function cachedQuery<T>(
  key: string,
  fetch: () => Promise<T>,
  ttlSeconds: number = DEFAULT_TTL_SECONDS
): Promise<T> {
  if (!isRedisConfigured()) {
    return fetch();
  }

  try {
    const redis = getRedisClient();
    const cached = await redis.get(key);

    if (cached) {
      return JSON.parse(cached as string) as T;
    }
  } catch {
    // Cache miss or error — fetch from DB
  }

  const data = await fetch();

  try {
    const redis = getRedisClient();
    await redis.setex(key, ttlSeconds, JSON.stringify(data));
  } catch {
    // Non-critical cache write failure
  }

  return data;
}

export async function invalidateCache(key: string): Promise<void> {
  if (!isRedisConfigured()) return;
  try {
    const redis = getRedisClient();
    await redis.del(key);
  } catch {
    // Non-critical
  }
}

export async function invalidateCachePattern(pattern: string): Promise<void> {
  if (!isRedisConfigured()) return;
  try {
    const redis = getRedisClient();
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch {
    // Non-critical
  }
}

// Specific cache key builders
export const cacheKeys = {
  game: (slug: string) => `cache:game:${slug}`,
  gameById: (id: string) => `cache:game:id:${id}`,
  product: (id: string) => `cache:product:${id}`,
  productsByGame: (gameId: string) => `cache:products:game:${gameId}`,
  settings: () => "cache:settings",
  featuredGames: () => "cache:games:featured",
  activeGames: () => "cache:games:active",
  heroBanners: () => "cache:banners:hero",
  faqs: (category?: string) => category ? `cache:faqs:${category}` : "cache:faqs:all",
};

export const CACHE_TTL = {
  SHORT: 60,
  DEFAULT: 300,
  LONG: 3600,
  DAY: 86400,
};
