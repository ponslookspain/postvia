/**
 * Lightweight video container inspection (audit P2).
 *
 * WHAT THIS IS
 * A bounded reader for the ISO base media (MP4/MOV) box structure, enough to
 * recover the declared duration from `moov` -> `mvhd`. Pure arithmetic over a
 * few kilobytes — no ffmpeg, no demuxer, no transcoding, nothing that could
 * blow a serverless function's time or memory budget.
 *
 * WHAT THIS IS NOT
 * Not a validity proof. A file can parse here and still be unplayable: codecs,
 * frame data and stream integrity are not examined. A real pipeline needs a
 * worker (see docs/backend-audit-followup.md). The goal is narrower and worth
 * having on its own — catch files that are *obviously* not usable video at
 * upload time instead of minutes later at publish time, when the user has
 * already left the composer.
 *
 * FAIL-OPEN BY DESIGN
 * When the duration cannot be determined, the upload is ALLOWED. The security
 * boundary is the container signature check (`media-signature.ts`), which has
 * already run by the time anything here is called. This is a quality gate, so
 * rejecting files merely because an unusual-but-valid layout defeated the
 * parser would trade a real failure for a hypothetical one.
 */

/** Bytes read from the front of the file when looking for `moov`. */
export const VIDEO_HEAD_PROBE_BYTES = 64 * 1024;
/** Bytes read from the end when `moov` is not at the front (non-faststart). */
export const VIDEO_TAIL_PROBE_BYTES = 256 * 1024;

export type VideoProbe =
  | { ok: true; durationSeconds: number }
  /** Parsed successfully and the file declares itself unusable. */
  | { ok: false; error: string }
  /** Could not determine anything — caller allows the upload. */
  | { ok: true; durationSeconds: null };

function readUint32(bytes: Uint8Array, offset: number): number | null {
  if (offset + 4 > bytes.length) return null;
  return (
    ((bytes[offset] << 24) >>> 0) +
    (bytes[offset + 1] << 16) +
    (bytes[offset + 2] << 8) +
    bytes[offset + 3]
  );
}

function readUint64(bytes: Uint8Array, offset: number): number | null {
  const high = readUint32(bytes, offset);
  const low = readUint32(bytes, offset + 4);
  if (high === null || low === null) return null;
  // Durations never approach 2^53; anything that does is nonsense anyway.
  return high * 2 ** 32 + low;
}

function isBoxType(bytes: Uint8Array, offset: number, type: string): boolean {
  if (offset + 4 > bytes.length) return false;
  for (let i = 0; i < 4; i++) {
    if (bytes[offset + i] !== type.charCodeAt(i)) return false;
  }
  return true;
}

/**
 * Finds a top-level box by type within a buffer, walking the size/type
 * chain. Returns the offset of the box's CONTENT, or null.
 *
 * Bounded: refuses zero/negative advances so a malformed size field cannot
 * produce an infinite loop, and stops at the buffer end.
 */
function findBox(
  bytes: Uint8Array,
  type: string,
  start = 0,
  end = bytes.length
): { contentStart: number; contentEnd: number } | null {
  let offset = start;
  while (offset + 8 <= end) {
    const size = readUint32(bytes, offset);
    if (size === null) return null;

    let headerSize = 8;
    let boxSize = size;
    if (size === 1) {
      // 64-bit extended size follows the type.
      const large = readUint64(bytes, offset + 8);
      if (large === null) return null;
      boxSize = large;
      headerSize = 16;
    } else if (size === 0) {
      // "to end of file"
      boxSize = end - offset;
    }

    if (boxSize < headerSize) return null; // malformed: no forward progress

    if (isBoxType(bytes, offset + 4, type)) {
      return {
        contentStart: offset + headerSize,
        contentEnd: Math.min(offset + boxSize, end),
      };
    }
    offset += boxSize;
  }
  return null;
}

/**
 * Extracts the duration declared by an ISO base media file's movie header.
 *
 * `mvhd` layout (after the 4-byte version/flags word):
 *   version 0: creation(4) modification(4) timescale(4) duration(4)
 *   version 1: creation(8) modification(8) timescale(4) duration(8)
 */
function readMvhdDuration(
  bytes: Uint8Array,
  moovStart: number,
  moovEnd: number
): number | null {
  const mvhd = findBox(bytes, "mvhd", moovStart, moovEnd);
  if (!mvhd) return null;

  const version = bytes[mvhd.contentStart];
  const base = mvhd.contentStart + 4; // skip version + flags

  let timescale: number | null;
  let duration: number | null;
  if (version === 1) {
    timescale = readUint32(bytes, base + 16);
    duration = readUint64(bytes, base + 20);
  } else {
    timescale = readUint32(bytes, base + 8);
    duration = readUint32(bytes, base + 12);
  }

  if (!timescale || timescale <= 0) return null;
  if (duration === null) return null;
  return duration / timescale;
}

/**
 * Probes an MP4/MOV buffer for its duration.
 *
 * `head` is the start of the file; `tail` (optional) is the end, needed when
 * `moov` sits after `mdat` — the non-"faststart" layout most cameras and
 * phone exports produce.
 */
export function probeIsoBaseMediaDuration(
  head: Uint8Array,
  tail?: Uint8Array
): VideoProbe {
  for (const buffer of [head, tail]) {
    if (!buffer || buffer.length === 0) continue;
    const moov = findBox(buffer, "moov");
    if (!moov) continue;
    const seconds = readMvhdDuration(buffer, moov.contentStart, moov.contentEnd);
    if (seconds === null) continue;

    if (!Number.isFinite(seconds) || seconds <= 0) {
      return {
        ok: false,
        error:
          "This video file is damaged or has no playable content. Re-export it and try again.",
      };
    }
    return { ok: true, durationSeconds: seconds };
  }
  // Undeterminable: allow (see the fail-open note at the top).
  return { ok: true, durationSeconds: null };
}

/**
 * Optional outer bound on video length.
 *
 * Deliberately NOT given a default. Every platform has its own cap and
 * choosing Postvia's is a product decision, not an engineering one — see
 * docs/backend-audit-followup.md. Unset (the shipped state) means duration is
 * measured and recorded but never used to reject.
 */
export function maxVideoDurationSeconds(
  env: Record<string, string | undefined> = process.env
): number | null {
  const raw = Number(env.MEDIA_MAX_VIDEO_SECONDS);
  if (Number.isFinite(raw) && raw > 0) return raw;
  return null;
}

export type VideoDurationCheck = { ok: true } | { ok: false; error: string };

/** Applies the optional cap. A null duration or unset cap always passes. */
export function checkVideoDuration(
  durationSeconds: number | null,
  limitSeconds: number | null = maxVideoDurationSeconds()
): VideoDurationCheck {
  if (durationSeconds === null || limitSeconds === null) return { ok: true };
  if (durationSeconds <= limitSeconds) return { ok: true };
  const limitLabel =
    limitSeconds >= 60
      ? `${Math.round(limitSeconds / 60)} minutes`
      : `${limitSeconds} seconds`;
  return {
    ok: false,
    error: `This video is longer than the ${limitLabel} limit. Trim it and try again.`,
  };
}

/** True for containers this module can inspect. */
export function isIsoBaseMediaMime(mimeType: string): boolean {
  return mimeType === "video/mp4" || mimeType === "video/quicktime";
}
