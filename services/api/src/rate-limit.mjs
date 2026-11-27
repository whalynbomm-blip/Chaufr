/**
 * Bounded, process-local fixed-window limiter.
 * Production deployments with multiple instances should use a shared store.
 */
export function createWindowRateLimiter({ limit, windowMs, maxEntries = 10_000, now = () => Date.now() }) {
  if (!Number.isInteger(limit) || limit < 1) throw new TypeError("limit must be a positive integer");
  if (!Number.isInteger(windowMs) || windowMs < 1) throw new TypeError("windowMs must be a positive integer");
  if (!Number.isInteger(maxEntries) || maxEntries < 1) throw new TypeError("maxEntries must be a positive integer");
  const entries = new Map();

  function pruneExpired(currentTime) {
    for (const [key, entry] of entries) {
      if (entry.resetAt <= currentTime) entries.delete(key);
    }
  }

  return {
    consume(key) {
      if (typeof key !== "string" || !key) throw new TypeError("rate-limit key must be a non-empty string");
      const currentTime = now();
      let entry = entries.get(key);
      if (entry && entry.resetAt <= currentTime) {
        entries.delete(key);
        entry = undefined;
      }
      if (!entry) {
        if (entries.size >= maxEntries) {
          pruneExpired(currentTime);
          if (entries.size >= maxEntries) return { allowed: false, retryAfterMs: windowMs };
        }
        entry = { count: 0, resetAt: currentTime + windowMs };
        entries.set(key, entry);
      }
      if (entry.count >= limit) return { allowed: false, retryAfterMs: Math.max(0, entry.resetAt - currentTime) };
      entry.count += 1;
      return { allowed: true, remaining: limit - entry.count, resetAt: entry.resetAt };
    },
    get size() { return entries.size; },
  };
}
