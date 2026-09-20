/**
 * Simple in-memory rate limiter using a sliding window.
 * Stores timestamps per key, prunes expired entries on every call.
 *
 * NOT suitable for multi-process/serverless — good enough for a single
 * Node process (which is what SQLite + `next dev` / `next start` gives us).
 */

const store = new Map<string, number[]>();

/**
 * Returns `true` if the request is allowed, `false` if rate-limited.
 *
 * @param key      Unique identifier (e.g. IP address)
 * @param max      Maximum requests allowed in the window
 * @param windowMs Window duration in milliseconds
 */
export function checkRateLimit(
  key: string,
  max: number,
  windowMs: number,
): boolean {
  const now = Date.now();
  const cutoff = now - windowMs;

  // Get or create the timestamp list for this key
  let timestamps = store.get(key);

  if (timestamps) {
    // Prune entries older than the window
    timestamps = timestamps.filter((t) => t > cutoff);
  } else {
    timestamps = [];
  }

  if (timestamps.length >= max) {
    // Over limit — store the pruned list and reject
    store.set(key, timestamps);
    return false;
  }

  // Under limit — record this request
  timestamps.push(now);
  store.set(key, timestamps);
  return true;
}
