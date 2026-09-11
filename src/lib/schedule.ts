/**
 * Scheduling date/time helpers.
 *
 * The pipeline is deliberately absolute-time based:
 *   browser-local "YYYY-MM-DD" + "HH:mm"
 *     -> new Date(`${date}T${time}`)   (parsed in the *browser's* timezone)
 *     -> .toISOString()                (absolute UTC instant)
 *     -> Post.scheduledAt (timestamptz)
 *     -> cron compares `scheduledAt <= now` as absolute instants.
 *
 * A user choosing 18:30 while in Europe/Madrid therefore publishes at
 * 18:30 Madrid (= 16:30 UTC) regardless of the server/Vercel timezone.
 */

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * Converts local date/time input values (as produced by
 * <input type="date"> / <input type="time">) into an absolute ISO
 * instant, interpreted in the caller environment's local timezone.
 * Returns null for missing or invalid input.
 */
export function localInputToIso(
  date: string,
  time: string
): string | null {
  if (!date || !time) return null;
  const local = new Date(`${date}T${time}`);
  if (Number.isNaN(local.getTime())) return null;
  return local.toISOString();
}

/** Formats a Date/ISO instant back into <input type="date"> value, local. */
export function localDateInputValue(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Formats a Date/ISO instant back into <input type="time"> value, local. */
export function localTimeInputValue(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export type ScheduledAtValidation =
  | { ok: true; date: Date }
  | { ok: false; error: string };

/**
 * Server-side validation of a client-submitted scheduledAt.
 * The value must be an absolute instant (ISO string with Z or an
 * explicit offset) strictly in the future.
 */
export function validateScheduledAt(
  raw: unknown,
  now: Date = new Date()
): ScheduledAtValidation {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return { ok: false, error: "Invalid scheduled time" };
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return { ok: false, error: "Invalid scheduled time" };
  }
  if (date.getTime() <= now.getTime()) {
    return { ok: false, error: "Scheduled time must be in the future" };
  }
  return { ok: true, date };
}

export type RescheduleResult =
  | {
      ok: true;
      data: { scheduledAt: Date | null; status: "SCHEDULED" | "DRAFT" };
    }
  | { ok: false; status: number; error: string };

const RESCHEDULABLE_STATUSES = new Set(["DRAFT", "SCHEDULED"]);

/**
 * Reschedule rules for PATCH /api/posts/[id]:
 * - only DRAFT/SCHEDULED posts may change their schedule
 *   (PUBLISHING/PUBLISHED are owned by the publish flow; FAILED posts
 *   are re-published through the Retry action);
 * - null/"" removes the schedule (back to DRAFT);
 * - a valid future instant schedules the post (status SCHEDULED);
 * - X posts cannot be scheduled at all.
 */
export function resolveScheduledAtUpdate(input: {
  currentStatus: string;
  platform: string;
  rawScheduledAt: unknown;
  now?: Date;
}): RescheduleResult {
  const now = input.now ?? new Date();
  const clears =
    input.rawScheduledAt === null || input.rawScheduledAt === "";

  if (!RESCHEDULABLE_STATUSES.has(input.currentStatus)) {
    return {
      ok: false,
      status: 400,
      error: `Only draft or scheduled posts can be rescheduled (current status: ${input.currentStatus})`,
    };
  }

  if (clears) {
    return { ok: true, data: { scheduledAt: null, status: "DRAFT" } };
  }

  if (input.platform === "X") {
    return {
      ok: false,
      status: 400,
      error:
        "Scheduling for X is not available yet. Use Threads to schedule a post.",
    };
  }

  const validation = validateScheduledAt(input.rawScheduledAt, now);
  if (!validation.ok) {
    return { ok: false, status: 400, error: validation.error };
  }

  return {
    ok: true,
    data: { scheduledAt: validation.date, status: "SCHEDULED" },
  };
}
