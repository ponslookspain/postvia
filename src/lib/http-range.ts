/**
 * HTTP Range parsing for private media delivery (P1.8).
 *
 * `GET /api/media/[id]` used to set a `Content-Range` header while returning
 * status 200. That combination is not a valid partial response: a 200 tells
 * the client the body IS the whole entity, so a browser handed 1 MB of a
 * 40 MB video treats it as a complete 1 MB file. Video seeking and resumable
 * playback both depend on the distinction.
 *
 * Only single byte-ranges are handled. Multi-range requests (`bytes=0-9,20-29`)
 * require a multipart/byteranges body, which nothing in this product needs —
 * per RFC 9110 a server MAY ignore a Range header it does not support, so
 * those degrade to a normal 200 full-body response rather than an error.
 *
 * Pure functions only — no Prisma, no network, no Response objects.
 */

export type RangeRequest =
  /** No Range header, or one that should be ignored → serve the full entity. */
  | { kind: "full" }
  /** A satisfiable single range → 206 Partial Content. */
  | { kind: "partial"; start: number; end: number; contentRange: string }
  /** Syntactically valid but outside the entity → 416. */
  | { kind: "unsatisfiable"; contentRange: string };

const SINGLE_BYTE_RANGE = /^bytes=(\d*)-(\d*)$/;

/**
 * Resolves a Range header against a known entity size.
 *
 * `size` must be the true byte length of the stored object. Both inclusive
 * bounds are clamped to the entity, matching RFC 9110: an `end` past the last
 * byte is not an error, it simply means "to the end".
 */
export function resolveRange(
  header: string | null | undefined,
  size: number
): RangeRequest {
  if (!header) return { kind: "full" };
  if (!Number.isFinite(size) || size < 0) return { kind: "full" };

  const match = SINGLE_BYTE_RANGE.exec(header.trim());
  // Unsupported syntax (multi-range, non-byte units, garbage): ignore it.
  if (!match) return { kind: "full" };

  const [, rawStart, rawEnd] = match;

  // `bytes=-N` — the final N bytes.
  if (rawStart === "") {
    if (rawEnd === "") return { kind: "full" };
    const suffixLength = Number(rawEnd);
    if (!Number.isSafeInteger(suffixLength)) return { kind: "full" };
    // A zero-length suffix is unsatisfiable by definition.
    if (suffixLength === 0) {
      return { kind: "unsatisfiable", contentRange: `bytes */${size}` };
    }
    if (size === 0) {
      return { kind: "unsatisfiable", contentRange: `bytes */${size}` };
    }
    const start = Math.max(0, size - suffixLength);
    const end = size - 1;
    return {
      kind: "partial",
      start,
      end,
      contentRange: `bytes ${start}-${end}/${size}`,
    };
  }

  const start = Number(rawStart);
  if (!Number.isSafeInteger(start) || start < 0) return { kind: "full" };

  // A start at or past the end of the entity is the canonical 416 case.
  if (start >= size) {
    return { kind: "unsatisfiable", contentRange: `bytes */${size}` };
  }

  // `bytes=N-` — from N to the end.
  if (rawEnd === "") {
    const end = size - 1;
    return {
      kind: "partial",
      start,
      end,
      contentRange: `bytes ${start}-${end}/${size}`,
    };
  }

  const requestedEnd = Number(rawEnd);
  if (!Number.isSafeInteger(requestedEnd)) return { kind: "full" };
  if (requestedEnd < start) {
    return { kind: "unsatisfiable", contentRange: `bytes */${size}` };
  }

  const end = Math.min(requestedEnd, size - 1);
  return {
    kind: "partial",
    start,
    end,
    contentRange: `bytes ${start}-${end}/${size}`,
  };
}

/** Byte count a resolved partial range will deliver. */
export function rangeLength(range: Extract<RangeRequest, { kind: "partial" }>): number {
  return range.end - range.start + 1;
}

/** Canonical `Range` header for a resolved partial range (sent upstream). */
export function toRangeHeader(
  range: Extract<RangeRequest, { kind: "partial" }>
): string {
  return `bytes=${range.start}-${range.end}`;
}
