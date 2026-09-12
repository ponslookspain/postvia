/**
 * Pure bulk-scheduling helpers.
 *
 * Bulk Video Scheduling creates one ordinary scheduled Post per video
 * through the existing endpoints (POST /api/posts, media upload pipeline,
 * PATCH scheduledAt). No second publishing engine, no extra cron, no
 * transcoding: everything below is schedule math, validation and payload
 * shaping. Timezone handling is DST-aware via Intl wall-time round-trips.
 */

import { getPlatformCapabilities } from "@/lib/platforms/capabilities";
import { validateTargetMedia } from "@/lib/platforms/overrides";
import type { Platform } from "@prisma/client";

export const BULK_MAX_VIDEOS = 10;
export const BULK_MIN_INTERVAL_MINUTES = 1;
export const BULK_MAX_INTERVAL_MINUTES = 60 * 24 * 30;

export const BULK_INTERVAL_PRESETS = [30, 60, 180, 360, 720, 1440];

export const BULK_TIMEZONES = [
  "UTC",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Madrid",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Mexico_City",
  "America/Sao_Paulo",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Pacific/Auckland",
];

/**
 * Absolute instants for a batch: start + i * interval. Pure arithmetic on
 * UTC milliseconds, so DST transitions cannot skew the spacing.
 */
export function computeBulkSchedule(
  startUtcMs: number,
  intervalMinutes: number,
  count: number
): string[] {
  const schedule: string[] = [];
  for (let i = 0; i < count; i++) {
    schedule.push(new Date(startUtcMs + i * intervalMinutes * 60_000).toISOString());
  }
  return schedule;
}

type WallParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

const wallFormatterCache = new Map<string, Intl.DateTimeFormat>();

function wallParts(ms: number, timeZone: string): WallParts {
  let formatter = wallFormatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    wallFormatterCache.set(timeZone, formatter);
  }
  const parts = formatter.formatToParts(new Date(ms));
  const get = (type: string): number => {
    const part = parts.find((p) => p.type === type);
    return part ? Number(part.value) : Number.NaN;
  };
  // en-US with hour12:false can yield hour "24" at midnight.
  const hour = get("hour") % 24;
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour,
    minute: get("minute"),
  };
}

/**
 * Converts wall-clock "YYYY-MM-DD" + "HH:MM" in an IANA timezone to an
 * absolute UTC ISO instant. Returns null for malformed input, unknown
 * zones, or nonexistent wall times (DST spring-forward gap) — the caller
 * must surface a validation error instead of silently shifting the post.
 * Ambiguous fall-back times resolve deterministically (iteration from the
 * UTC guess converges on the first occurrence).
 */
export function zonedTimeToIso(
  date: string,
  time: string,
  timeZone: string
): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    return null;
  }
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  const hour = Number(time.slice(0, 2));
  const minute = Number(time.slice(3, 5));
  if (
    !Number.isInteger(year) || !Number.isInteger(month) ||
    !Number.isInteger(day) || !Number.isInteger(hour) ||
    !Number.isInteger(minute) || month < 1 || month > 12 ||
    day < 1 || day > 31 || hour > 23 || minute > 59
  ) {
    return null;
  }
  let timezoneOk = true;
  try {
    wallParts(Date.UTC(2026, 0, 1), timeZone);
  } catch {
    timezoneOk = false;
  }
  if (!timezoneOk) return null;

  const wanted = Date.UTC(year, month - 1, day, hour, minute);
  let guess = wanted;
  for (let i = 0; i < 4; i++) {
    const wall = wallParts(guess, timeZone);
    const wallMs = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute);
    const diff = wallMs - wanted;
    if (diff === 0) break;
    guess -= diff;
  }
  // Round-trip check: a nonexistent wall time can never match itself.
  const check = wallParts(guess, timeZone);
  if (
    check.year !== year || check.month !== month || check.day !== day ||
    check.hour !== hour || check.minute !== minute
  ) {
    return null;
  }
  return new Date(guess).toISOString();
}

export type BulkFileRef = {
  name: string;
  size: number;
  lastModified: number;
};

/**
 * Splits incoming files into fresh additions vs repeats of an already
 * selected video (same name + size + lastModified). Repeats are NOT
 * rejected: each confirmed instance becomes its own Post with its own
 * scheduled slot and Media row. The UI must show the repeats and require
 * explicit confirmation before appending them.
 */
export function partitionDuplicateAdds(
  existing: readonly BulkFileRef[],
  incoming: readonly BulkFileRef[]
): { unique: BulkFileRef[]; duplicates: BulkFileRef[] } {
  const seen = new Set(
    existing.map((file) => [file.name, file.size, file.lastModified].join("|"))
  );
  const unique: BulkFileRef[] = [];
  const duplicates: BulkFileRef[] = [];
  for (const file of incoming) {
    const key = [file.name, file.size, file.lastModified].join("|");
    if (seen.has(key)) duplicates.push(file);
    else {
      seen.add(key);
      unique.push(file);
    }
  }
  return { unique, duplicates };
}

/**
 * Double-submit guard for the batch runner: a run may only start when no
 * run is in flight. Done items are never reprocessed (each run filters by
 * status), so an accidental second submit cannot duplicate posts.
 */
export function shouldAcceptRunRequest(running: boolean): boolean {
  return !running;
}

export type BulkConfigValidation =
  | { ok: true }
  | { ok: false; error: string };

/** Cheap synchronous guards before any upload starts. */
export function validateBulkConfig(input: {
  fileCount: number;
  intervalMinutes: number;
  startUtcMs: number | null;
  accountCount: number;
  nowMs?: number;
}): BulkConfigValidation {
  if (input.accountCount === 0) {
    return { ok: false, error: "Select at least one connected account." };
  }
  if (input.fileCount === 0) {
    return { ok: false, error: "Add at least one video." };
  }
  if (input.fileCount > BULK_MAX_VIDEOS) {
    return {
      ok: false,
      error: `A batch holds at most ${BULK_MAX_VIDEOS} videos.`,
    };
  }
  if (
    !Number.isFinite(input.intervalMinutes) ||
    input.intervalMinutes < BULK_MIN_INTERVAL_MINUTES ||
    input.intervalMinutes > BULK_MAX_INTERVAL_MINUTES
  ) {
    return {
      ok: false,
      error: `Interval must be between ${BULK_MIN_INTERVAL_MINUTES} minute and 30 days.`,
    };
  }
  if (input.startUtcMs === null) {
    return { ok: false, error: "Choose a valid start date and time." };
  }
  const now = input.nowMs ?? Date.now();
  if (input.startUtcMs <= now) {
    return { ok: false, error: "The batch must start in the future." };
  }
  return { ok: true };
}

export type BulkAccountRef = {
  id: string;
  platform: Platform;
  username: string;
};

/**
 * Capability check for one video against every selected account, reusing
 * the platform registry (same rules as the manual composer). Returns one
 * message per problem so the UI can block incompatible combinations
 * before any upload starts.
 */
export function validateBulkVideoForAccounts(
  mimeType: string,
  accounts: readonly BulkAccountRef[]
): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const account of accounts) {
    const caps = getPlatformCapabilities(account.platform);
    const result = validateTargetMedia(caps, [{ type: "VIDEO", mimeType }]);
    if (!result.ok && !seen.has(result.error)) {
      seen.add(result.error);
      errors.push(result.error);
    }
  }
  return errors;
}

/**
 * POST /api/posts body for one batch item. The post starts life as a
 * DRAFT; the scheduler flips it to SCHEDULED via PATCH after the media
 * row is registered — the same transitions as the manual flow.
 */
export function buildBulkPostBody(input: {
  text: string;
  accountIds: string[];
}): {
  text: string;
  hasMedia: boolean;
  accountIds: string[];
  targets: { accountId: string; overrides: null }[];
} {
  return {
    text: input.text.trim(),
    hasMedia: true,
    accountIds: input.accountIds,
    targets: input.accountIds.map((accountId) => ({
      accountId,
      overrides: null,
    })),
  };
}
