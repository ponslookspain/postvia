/**
 * Pure calendar helpers for the Visual Content Calendar.
 *
 * All date math is timezone-explicit: the month grid is computed in UTC
 * (stable structure everywhere), while post bucketing uses the viewer's
 * IANA timezone via `dayKeyInTimeZone` (the server cannot know it, the
 * browser reports it with `Intl.DateTimeFormat().resolvedOptions()`).
 *
 * Drag & drop and quick scheduling reuse the existing reschedule API
 * (`PATCH /api/posts/[id]` with `scheduledAt`); nothing here duplicates
 * the scheduling engine.
 */

import type { MediaKind } from "@/lib/media";

export type CalendarTarget = {
  platform: string;
  username?: string | null;
};

export type CalendarPost = {
  id: string;
  text: string;
  status: string;
  scheduledAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  targets: CalendarTarget[];
  previewMedia: { id: string; type: MediaKind } | null;
};

/** Statuses the calendar renders. Everything else is ignored upstream. */
export const CALENDAR_STATUSES = [
  "DRAFT",
  "SCHEDULED",
  "PUBLISHING",
  "PUBLISHED",
  "PARTIALLY_PUBLISHED",
  "FAILED",
] as const;

/** Only these may change days via drag & drop (the API enforces the rest). */
export function isMovableStatus(status: string): boolean {
  return status === "SCHEDULED" || status === "DRAFT";
}

export function parseMonthParam(
  raw: unknown,
  fallback: Date = new Date()
): { year: number; monthIndex: number } {
  if (typeof raw === "string") {
    const match = /^(\d{4})-(\d{2})$/.exec(raw.trim());
    if (match) {
      const year = Number(match[1]);
      const month = Number(match[2]);
      if (year >= 2000 && year <= 2100 && month >= 1 && month <= 12) {
        return { year, monthIndex: month - 1 };
      }
    }
  }
  return { year: fallback.getFullYear(), monthIndex: fallback.getMonth() };
}

export function monthKey(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

export function addMonths(
  year: number,
  monthIndex: number,
  delta: number
): { year: number; monthIndex: number } {
  const total = year * 12 + monthIndex + delta;
  return { year: Math.floor(total / 12), monthIndex: ((total % 12) + 12) % 12 };
}

/**
 * 42 day keys (6 Monday-start weeks) covering the month view, computed in
 * UTC so the grid structure is identical on server and client.
 */
export function gridDayKeys(year: number, monthIndex: number): string[] {
  const first = new Date(Date.UTC(year, monthIndex, 1));
  // Monday-start: Sunday (0) belongs to the previous week (-6), else shift.
  const leadDays = (first.getUTCDay() + 6) % 7;
  const startMs = first.getTime() - leadDays * 86_400_000;
  const keys: string[] = [];
  for (let i = 0; i < 42; i++) {
    keys.push(
      new Date(startMs + i * 86_400_000).toISOString().slice(0, 10)
    );
  }
  return keys;
}

const dayFormatterCache = new Map<string, Intl.DateTimeFormat>();

function dayFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = dayFormatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    dayFormatterCache.set(timeZone, formatter);
  }
  return formatter;
}

/** "YYYY-MM-DD" key of an instant in the given IANA timezone. */
export function dayKeyInTimeZone(iso: string, timeZone: string): string {
  return dayFormatter(timeZone).format(new Date(iso));
}

/** Reference instant for placement: scheduled, else published, else created. */
export function postReferenceIso(post: CalendarPost): string {
  return post.scheduledAt ?? post.publishedAt ?? post.createdAt;
}

export function bucketCalendarPosts(
  posts: readonly CalendarPost[],
  timeZone: string
): Map<string, CalendarPost[]> {
  const buckets = new Map<string, CalendarPost[]>();
  for (const post of posts) {
    const key = dayKeyInTimeZone(postReferenceIso(post), timeZone);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(post);
    else buckets.set(key, [post]);
  }
  return buckets;
}

/**
 * "HH:MM" for a drop: keeps the source time for reschedules, defaults to
 * 09:00 for unscheduled drafts. Parsed from the ISO string itself so the
 * result does not depend on the runtime timezone.
 */
export function dropTimeFor(sourceScheduledAt: string | null): string {
  if (sourceScheduledAt) {
    const match = /T(\d{2}):(\d{2})/.exec(sourceScheduledAt);
    if (match) return `${match[1]}:${match[2]}`;
  }
  return "09:00";
}
