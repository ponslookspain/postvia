/**
 * Content-signature verification for stored uploads (P1.3).
 *
 * WHY THIS EXISTS
 * The MIME type travels through the whole upload flow as a client-supplied
 * value: the browser declares it in `clientPayload`, the server pins it into
 * the signed token's `allowedContentTypes`, and the Blob store echoes it back
 * on the completed object. Every one of those steps proves the client's
 * INTENT and none of them inspects a single byte. Until this module, a caller
 * could declare `image/jpeg` and PUT arbitrary content: the canonical
 * transform would fail, the availability-first fallback would keep the
 * original bytes, and a Media row would be created describing them as a JPEG.
 *
 * WHAT THIS IS NOT
 * This is a container/format check, not a decoder and not a virus scanner. It
 * answers exactly one question: "do the leading bytes agree with the declared
 * type?" It does not validate that a file is well-formed, that a video is
 * playable, or that an image decodes within sane bounds. See
 * docs/backend-audit-followup.md for the limits that still need a worker.
 *
 * Pure functions only — no Prisma, no network — so every case is unit-testable.
 */

import type { MediaKind } from "@/lib/media";

/** Bytes needed to decide any supported type (WebP needs 12). */
export const SIGNATURE_PROBE_BYTES = 32;

export type SignatureCheck =
  | { ok: true }
  | { ok: false; error: string };

function startsWith(bytes: Uint8Array, prefix: readonly number[]): boolean {
  if (bytes.length < prefix.length) return false;
  return prefix.every((byte, i) => bytes[i] === byte);
}

function asciiAt(bytes: Uint8Array, offset: number, text: string): boolean {
  if (bytes.length < offset + text.length) return false;
  for (let i = 0; i < text.length; i++) {
    if (bytes[offset + i] !== text.charCodeAt(i)) return false;
  }
  return true;
}

/** JPEG: SOI marker + the start of the first segment. */
function isJpeg(bytes: Uint8Array): boolean {
  return startsWith(bytes, [0xff, 0xd8, 0xff]);
}

/** PNG: the 8-byte signature, including the CRLF/EOF transfer guards. */
function isPng(bytes: Uint8Array): boolean {
  return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
}

/** GIF: either revision of the header. */
function isGif(bytes: Uint8Array): boolean {
  return asciiAt(bytes, 0, "GIF87a") || asciiAt(bytes, 0, "GIF89a");
}

/** WebP: a RIFF container whose form type is WEBP (bytes 8..11). */
function isWebp(bytes: Uint8Array): boolean {
  return asciiAt(bytes, 0, "RIFF") && asciiAt(bytes, 8, "WEBP");
}

/**
 * ISO base media (MP4 / QuickTime MOV): a `ftyp` box. The 4 bytes before it
 * are the box size, which varies, so the brand marker is checked at its fixed
 * offset rather than from position 0.
 */
function isIsoBaseMedia(bytes: Uint8Array): boolean {
  return asciiAt(bytes, 4, "ftyp");
}

/** Matroska / WebM: the EBML header shared by both. */
function isMatroska(bytes: Uint8Array): boolean {
  return startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3]);
}

/**
 * Declared MIME type → the predicate its bytes must satisfy.
 *
 * Every entry in `MEDIA_LIMITS` must appear here, and `mediaSignatureCoverage`
 * (exported below) lets a test pin that — an unlisted type would otherwise
 * silently skip verification.
 *
 * WebM and MOV share their container check with their siblings on purpose:
 * `video/webm` is Matroska, and `video/quicktime` and `video/mp4` are both
 * ISO base media. Distinguishing brand codes further would reject valid files
 * for no security gain.
 */
const SIGNATURES: Record<string, (bytes: Uint8Array) => boolean> = {
  "image/jpeg": isJpeg,
  "image/png": isPng,
  "image/gif": isGif,
  "image/webp": isWebp,
  "video/mp4": isIsoBaseMedia,
  "video/quicktime": isIsoBaseMedia,
  "video/webm": isMatroska,
};

/** Declared types this module can verify. Used by the coverage test. */
export function mediaSignatureCoverage(): readonly string[] {
  return Object.keys(SIGNATURES);
}

/** True when the declared type has a byte-level check at all. */
export function hasSignatureCheck(mimeType: string): boolean {
  return Object.hasOwn(SIGNATURES, mimeType);
}

/**
 * Confirms the leading bytes agree with the declared type.
 *
 * Fails closed in both directions that matter:
 * - an unknown declared type has no predicate, so it cannot be verified and is
 *   rejected (the upload path only ever admits allowlisted types, so reaching
 *   this means the allowlist and this table drifted apart);
 * - a truncated read cannot prove the type and is rejected.
 */
export function verifyMediaSignature(
  mimeType: string,
  head: Uint8Array
): SignatureCheck {
  const predicate = SIGNATURES[mimeType];
  if (!predicate) {
    return {
      ok: false,
      error: "File type could not be verified",
    };
  }
  if (head.length === 0) {
    return { ok: false, error: "File is empty" };
  }
  if (!predicate(head)) {
    return {
      ok: false,
      error: "File contents do not match the declared file type",
    };
  }
  return { ok: true };
}

/**
 * Best-effort identification of what the bytes ACTUALLY are, for diagnostics
 * only. Never used to accept an upload — a caller that trusted this would be
 * letting the file choose its own type.
 */
export function detectSignatureKind(head: Uint8Array): MediaKind | null {
  if (isJpeg(head) || isPng(head) || isGif(head) || isWebp(head)) {
    return "IMAGE";
  }
  if (isIsoBaseMedia(head) || isMatroska(head)) return "VIDEO";
  return null;
}
