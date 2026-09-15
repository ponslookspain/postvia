import { validateMediaInput, type MediaKind } from "@/lib/media";
import type { PlanId } from "@/lib/plans";

/**
 * Stage A helpers for the new-post composer. Pure functions only — no DOM,
 * no toasts, no state — so the add-media and failure-recovery contracts are
 * unit-testable without a renderer.
 */

export type MediaFileLike = {
  name: string;
  type: string;
  size: number;
};

export type MediaAddPlan = {
  /**
   * Files that passed validation and fit within the limit, in order. The
   * original file reference is preserved untouched (never spread — a File
   * must stay a File for upload and createObjectURL).
   */
  accepted: { file: MediaFileLike; kind: MediaKind }[];
  /** Files rejected by per-file validation, with user-facing reasons. */
  rejected: { name: string; error: string }[];
  /**
   * True when the accepted files would overflow the limit. In that case
   * NOTHING is added (accepted is still listed for the message count) so
   * callers must not create object URLs or touch account selection.
   */
  limitExceeded: boolean;
  /**
   * Selected account ids that must be deselected. Always empty: every
   * implemented platform (including X, via its v2 media upload) accepts
   * media, so adding files must never silently drop a platform. The
   * field stays so callers keep a single handling path; per-platform
   * incompatibilities surface as explicit validation errors instead.
   */
  deselectAccountIds: string[];
};

/**
 * Decide what adding files does, before any side effect happens. The caller
 * must only create object URLs / update state when `accepted` is non-empty
 * and `limitExceeded` is false.
 */
export function planMediaAdd(args: {
  files: readonly MediaFileLike[];
  existingCount: number;
  maxMedia: number;
  selectedAccountIds: readonly string[];
  accounts: readonly { id: string; platform: string }[];
}): MediaAddPlan {
  const accepted: { file: MediaFileLike; kind: MediaKind }[] = [];
  const rejected: { name: string; error: string }[] = [];
  const tiktokSelected = args.accounts.some(
    (account) =>
      account.platform === "TIKTOK" &&
      args.selectedAccountIds.includes(account.id)
  );
  for (const file of args.files) {
    const validation = validateMediaInput(file.type, file.size);
    if (!validation.ok) {
      rejected.push({
        name: file.name,
        error: withTiktokSizeHint(validation.error, file, tiktokSelected),
      });
      continue;
    }
    accepted.push({ file, kind: validation.kind });
  }
  if (accepted.length === 0) {
    return {
      accepted,
      rejected,
      limitExceeded: false,
      deselectAccountIds: [],
    };
  }
  if (args.existingCount + accepted.length > args.maxMedia) {
    return {
      accepted,
      rejected,
      limitExceeded: true,
      deselectAccountIds: [],
    };
  }
  // NOTE: selectedAccountIds/accounts stay in the signature for callers,
  // but media never deselects a platform anymore (see deselectAccountIds).
  return {
    accepted,
    rejected,
    limitExceeded: false,
    deselectAccountIds: [],
  };
}

export type FailedPublishAction = "try-again" | "open-draft";

/**
 * Actions available on the publish-failure screen. A saved draft id must
 * always keep the "open-draft" action — clearing it destroys the only
 * recovery path ("retry from the saved draft").
 */
export function getFailedPublishActions(
  savedId: string | null
): FailedPublishAction[] {
  return savedId ? ["try-again", "open-draft"] : ["try-again"];
}

export type ScheduleClickAction = "open-dialog" | "show-x-hint";

/**
 * What the Schedule button does. X-only selection must never silently
 * no-op and never open the dialog — it shows an inline explanation instead.
 */
export function resolveScheduleClick(
  schedulingForX: boolean
): ScheduleClickAction {
  return schedulingForX ? "show-x-hint" : "open-dialog";
}

export type ScheduleErrorAction = "open-draft";

/**
 * Actions available next to a schedule error. Shown only when a draft was
 * actually created (media/PATCH failure path) — without a draft id there
 * is nothing to open.
 */
export function getScheduleErrorActions(
  savedId: string | null
): ScheduleErrorAction[] {
  return savedId ? ["open-draft"] : [];
}

/**
 * "Continue editing" from the Draft-saved screen. Takes only the two
 * setters it is allowed to touch — text and media state are deliberately
 * out of reach so continuing can never wipe the draft content.
 */
export function continueEditingFromSaved(controls: {
  setSaved: (value: boolean) => void;
  setSavedId: (value: string | null) => void;
}): void {
  controls.setSaved(false);
  controls.setSavedId(null);
}

/**
 * Unsaved-changes guard input: the composer holds content the server does
 * not have yet (draft creation happens on explicit save/schedule/publish).
 */
export function hasUnsavedChanges(text: string, mediaCount: number): boolean {
  return text.trim().length > 0 || mediaCount > 0;
}

/**
 * Default composer selection: implemented Threads accounts. Single source
 * for the initial state and the unsaved-changes baseline.
 */
export function defaultSelectedAccountIds(
  accounts: readonly { id: string; implemented: boolean; platform: string }[]
): string[] {
  return accounts
    .filter(
      (account) => account.implemented && account.platform === "THREADS"
    )
    .map((account) => account.id);
}

/**
 * Full dirty check for the unsaved-changes guard: text/media plus account
 * selection drift from the initial selection plus any platform overrides.
 * Order-insensitive on account ids.
 */
export function isComposerDirty(input: {
  text: string;
  mediaCount: number;
  selectedAccountIds: readonly string[];
  initialAccountIds: readonly string[];
  hasOverrides: boolean;
}): boolean {
  if (hasUnsavedChanges(input.text, input.mediaCount)) return true;
  if (input.hasOverrides) return true;
  if (input.selectedAccountIds.length !== input.initialAccountIds.length) {
    return true;
  }
  const current = [...input.selectedAccountIds].sort();
  const initial = [...input.initialAccountIds].sort();
  return current.some((id, index) => id !== initial[index]);
}

/**
 * Accurate platform guidance at the global image gate: TikTok photos
 * support up to 20 MB JPEG/WebP at the API, but the shared 10 MB upload
 * ceiling binds first (raising it is a separate infra decision). When a
 * TikTok target is selected, say so explicitly instead of letting the
 * generic limit read as a TikTok rejection.
 */
const TIKTOK_PHOTO_MAX_BYTES = 20 * 1024 * 1024;

function withTiktokSizeHint(
  error: string,
  file: MediaFileLike,
  tiktokSelected: boolean
): string {
  if (
    tiktokSelected &&
    (file.type === "image/jpeg" || file.type === "image/webp") &&
    file.size > 10 * 1024 * 1024 &&
    file.size <= TIKTOK_PHOTO_MAX_BYTES
  ) {
    return `${error} TikTok supports photos up to 20 MB, but uploads here are currently limited to 10 MB — use a smaller file.`;
  }
  return error;
}

/** Upload parallelism: faster batches without hammering the webhook. */
export const MEDIA_UPLOAD_CONCURRENCY = 2;

/**
 * Worker-pool map with a hard concurrency cap. Results keep input order;
 * one item never blocks the others beyond the pool size.
 */
export async function mapWithConcurrencyLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workerCount = Math.max(1, Math.min(limit, items.length));
  const workers = Array.from({ length: workerCount }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      const item = items[index] as T;
      results[index] = await fn(item, index);
    }
  });
  await Promise.all(workers);
  return results;
}

export type UploadableMediaItem = {
  key: string;
  status: "pending" | "uploading" | "done" | "error";
  /** Post the item was registered to, if its upload completed. */
  registeredPostId?: string | null;
};

/**
 * Which items an upload run must (re-)upload for a post. Done items
 * registered to THIS post are skipped (no duplicate upload); done items
 * from another post must upload again (blob paths are post-scoped).
 * `onlyKeys` narrows a run to failed items for per-file retry.
 */
export function selectMediaForUpload<T extends UploadableMediaItem>(
  items: readonly T[],
  postId: string,
  onlyKeys?: readonly string[]
): T[] {
  const keys = onlyKeys ? new Set(onlyKeys) : null;
  return items.filter(
    (item) =>
      (!keys || keys.has(item.key)) &&
      (item.status !== "done" || item.registeredPostId !== postId)
  );
}

/**
 * Single gate for Save / Schedule / Publish. Quota is checked first so a
 * known-exhausted plan never fires a request the server would 403 — the
 * server gate stays as defense-in-depth.
 */
export function canSubmitComposer(input: {
  textPresent: boolean;
  overLimit: boolean;
  mediaError: boolean;
  hasSelection: boolean;
  busy: boolean;
  quotaBlocked: boolean;
  /** Per-target preview validation errors (e.g. missing TikTok title). */
  previewError?: boolean;
  /**
   * TikTok photo description present while global text is empty: a
   * description-only photo post is publishable (the server accepts empty
   * text for TikTok-description targets), so it counts as content.
   */
  descriptionPresent?: boolean;
}): boolean {
  return (
    (input.textPresent || input.descriptionPresent === true) &&
    !input.overLimit &&
    !input.mediaError &&
    input.hasSelection &&
    !input.busy &&
    !input.quotaBlocked &&
    !input.previewError
  );
}

/**
 * Whether a TikTok creator-info failure means the account must be
 * reconnected (auth scope/token codes from the existing API messages)
 * rather than just retried.
 */
export function isTikTokReconnectNeeded(
  message: string | null | undefined
): boolean {
  if (!message) return false;
  return /reconnect/i.test(message);
}

// ---------------------------------------------------------------------------
// Safe schedule flow (Stage B): DRAFT -> media upload -> PATCH scheduledAt.
// A post must never sit in SCHEDULED with unregistered/failed media, so the
// schedule is applied only after every file is uploaded and registered.
// Pure orchestration over injected steps — unit-testable without fetch.
// ---------------------------------------------------------------------------

export type ScheduleFlowDenial = {
  reason: string;
  upgradeTo: PlanId | null;
};

export type ScheduleFlowDeps = {
  scheduledIso: string;
  hasMedia: boolean;
  createDraft: () => Promise<
    | { ok: true; id: string }
    | { ok: false; denial: ScheduleFlowDenial }
    | { ok: false; error: string }
  >;
  uploadMedia: (postId: string) => Promise<string[]>;
  applySchedule: (
    postId: string,
    scheduledIso: string
  ) => Promise<
    | { ok: true }
    | { ok: false; denial: ScheduleFlowDenial }
    | { ok: false; error: string }
  >;
};

export type ScheduleFlowResult =
  /** Media (if any) registered, schedule applied. */
  | { outcome: "scheduled"; postId: string }
  /** Plan gate (create or reschedule) refused. Nothing to recover. */
  | { outcome: "denied"; denial: ScheduleFlowDenial }
  /** Draft creation itself failed — no post exists. */
  | { outcome: "failed-before-create"; error: string }
  /**
   * Draft exists but is NOT scheduled (media failed or PATCH failed).
   * The caller must surface the draft id so the user can continue.
   */
  | { outcome: "failed-as-draft"; postId: string; error: string };

export async function runScheduleFlow(
  deps: ScheduleFlowDeps
): Promise<ScheduleFlowResult> {
  const created = await deps.createDraft();
  if (!created.ok) {
    if ("denial" in created) {
      return { outcome: "denied", denial: created.denial };
    }
    return { outcome: "failed-before-create", error: created.error };
  }
  const postId = created.id;
  if (deps.hasMedia) {
    const errors = await deps.uploadMedia(postId);
    if (errors.length > 0) {
      return {
        outcome: "failed-as-draft",
        postId,
        error: errors[0] ?? "Failed to upload media.",
      };
    }
  }
  const applied = await deps.applySchedule(postId, deps.scheduledIso);
  if (!applied.ok) {
    if ("denial" in applied) {
      return { outcome: "denied", denial: applied.denial };
    }
    return { outcome: "failed-as-draft", postId, error: applied.error };
  }
  return { outcome: "scheduled", postId };
}
