/**
 * Client-operation idempotency for post creation.
 *
 * One user action = one key. The client mints a UUID when an editing
 * session (single composer) or a batch item (bulk) is born and reuses it
 * for every retry / double-submit of that same action. POST /api/posts
 * stores the key on the Post row (unique index) and collapses any repeat
 * delivery — including two truly simultaneous HTTP requests, which
 * serialize on the unique index into exactly one row (P2002 → return the
 * winner).
 *
 * The key is NEVER derived from post content: two genuinely identical
 * posts are allowed as long as they carry different keys. No dedup on
 * `text + scheduledAt` exists anywhere in this pipeline by design.
 *
 * Pure functions only — no DOM, no Prisma — so the contracts are
 * unit-testable without a database.
 */

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Header carrying the idempotency key on POST /api/posts. */
export const IDEMPOTENCY_KEY_HEADER = "Idempotency-Key";

/**
 * Mint a fresh operation id (UUID v4). Uses the Web Crypto API so the
 * same helper works in browsers, edge/server runtimes and tests.
 */
export function newOperationId(): string {
  return globalThis.crypto.randomUUID();
}

/**
 * True for keys the server will honor. Only UUID-shaped values are
 * accepted — anything else is ignored (treated as "no key") so a buggy
 * or hostile client can never collide with real keys or poison the
 * unique index with garbage.
 */
export function isValidOperationId(value: unknown): value is string {
  return typeof value === "string" && UUID_V4.test(value);
}

/**
 * Normalize a client-supplied key: valid UUIDs pass through, everything
 * else becomes null (no key → legacy non-idempotent create).
 */
export function normalizeOperationId(value: unknown): string | null {
  return isValidOperationId(value) ? (value as string) : null;
}

/**
 * Deterministic per-item key for a bulk batch: stable for the lifetime
 * of the batch item, independent of list position. `slot` is assigned
 * once when the item enters the batch (a monotonic counter) so removing
 * another item — or retrying only the failed ones — never re-keys an
 * item onto somebody else's post.
 */
export function bulkItemOperationId(batchId: string, slot: number): string {
  return `${batchId}:${slot}`;
}

/**
 * Validate a bulk item key without parsing UUIDs: `<uuid>:<slot>`.
 */
export function isValidBulkOperationId(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const separator = value.lastIndexOf(":");
  if (separator <= 0) return false;
  const batch = value.slice(0, separator);
  const slot = value.slice(separator + 1);
  return UUID_V4.test(batch) && /^\d+$/.test(slot);
}

/**
 * Synchronous single-flight guard. React state updates are async — two
 * clicks in the same tick both see `scheduling === false` — but a ref
 * read + set is synchronous, so the second entrant always observes the
 * first. The component keeps one instance per action
 * (schedule / save / publish) and calls `tryAcquire()` FIRST, before any
 * validation or await; `release()` runs in `finally`.
 *
 * Deliberately not keyed: one guard instance protects exactly one action.
 */
export function createSingleFlight(): {
  readonly inFlight: boolean;
  tryAcquire: () => boolean;
  release: () => void;
} {
  let flight = false;
  return {
    get inFlight() {
      return flight;
    },
    tryAcquire() {
      if (flight) return false;
      flight = true;
      return true;
    },
    release() {
      flight = false;
    },
  };
}

/**
 * True when a Prisma error is a unique-constraint violation on the
 * Post idempotency key (the loser of a simultaneous double-create).
 * Other P2002 targets (Media pathname, SocialAccount pairs, …) must NOT
 * be mistaken for an idempotent replay.
 */
export function isIdempotencyConflict(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as Record<string, unknown>;
  if (record.code !== "P2002") return false;
  const target = (record.meta as Record<string, unknown> | undefined)?.target;
  if (typeof target === "string") {
    return target.includes("clientOperationId");
  }
  if (Array.isArray(target)) {
    return target.some(
      (entry) => typeof entry === "string" && entry.includes("clientOperationId")
    );
  }
  // Prisma meta shape varies by version/driver: a bare P2002 during a
  // create that carried an idempotency key is treated as a conflict only
  // by callers that check the key first — this helper stays strict.
  return false;
}
