import type { Prisma } from "@prisma/client";

/**
 * Cursor pagination for user-scoped post lists (B6).
 *
 * Keyset on (createdAt DESC, id DESC): stable under inserts, no
 * offset drift. The cursor is an opaque post id — never a timestamp —
 * resolved server-side to its createdAt (one indexed lookup) and
 * ownership-checked, so tampering only yields an empty page or 400.
 */

export const POST_PAGE_DEFAULT = 50;
export const POST_PAGE_MAX = 100;

export type ListPagination = {
  limit: number;
  cursor: string | null;
};

/**
 * Parse `?limit=` / `?cursor=` defensively: non-numeric, fractional,
 * zero, negative and oversized limits collapse to the default or the
 * clamp bounds; empty cursors become null (first page).
 */
export function parseListPagination(input: {
  limit?: unknown;
  cursor?: unknown;
}): ListPagination {
  let limit = POST_PAGE_DEFAULT;
  const text = typeof input.limit === "string" ? input.limit.trim() : null;
  const raw = text !== null ? (text === "" ? undefined : Number(text)) : input.limit;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    limit = Math.min(POST_PAGE_MAX, Math.max(1, Math.floor(raw)));
  }
  const cursor =
    typeof input.cursor === "string" && input.cursor.length > 0
      ? input.cursor
      : null;
  return { limit, cursor };
}

/**
 * Keyset predicate for "strictly before (createdAt, id)" in
 * createdAt-DESC/id-DESC order. Spread into the caller-owned `where`
 * (userId/status scoping stays with the caller).
 */
export function createdBeforeWhere(createdAt: Date, id: string): Prisma.PostWhereInput {
  return {
    OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: id } }],
  };
}

/**
 * Slice a `take: limit + 1` result into a page plus the next cursor.
 * Rows beyond the limit prove another page exists without a COUNT query.
 */
export function paginateByCursor<T extends { id: string }>(
  rows: T[],
  limit: number
): { page: T[]; nextCursor: string | null } {
  if (rows.length <= limit) return { page: rows, nextCursor: null };
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return { page, nextCursor: last ? last.id : null };
}
