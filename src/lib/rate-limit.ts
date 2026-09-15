/**
 * Legacy ephemeral in-memory limiter. Abuse-relevant scopes use the
 * persistent ledger in `abuse.ts` (`rateTakeWithClient`) so limits hold
 * across instances. Do not use this for abuse/security decisions — it is
 * kept for local ephemeral UX throttling and its unit test only.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

const DEFAULT_MAX = 3;
const DEFAULT_WINDOW_MS = 15 * 60_000;

export function checkRateLimit(
  key: string,
  { max = DEFAULT_MAX, windowMs = DEFAULT_WINDOW_MS } = {}
): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (bucket.count >= max) return false;
  bucket.count += 1;
  return true;
}

export function resetRateLimit(key?: string): void {
  if (key) buckets.delete(key);
  else buckets.clear();
}
