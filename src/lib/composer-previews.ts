import type { Platform } from "@prisma/client";
import { getPlatformCapabilities } from "@/lib/platforms/capabilities";
import { validateTargetMedia } from "@/lib/platforms/overrides";
import type { MediaKind } from "@/lib/media";
import { validateMediaInput } from "@/lib/media";

export type PreviewAccount = {
  id: string;
  platform: Platform;
  username: string;
};

export type PreviewOverride = {
  accountId: string;
  text?: string | null;
};

export type ComposerPreview = {
  accountId: string;
  platform: Platform;
  username: string;
  label: string;
  /** Effective content: platform override when set, otherwise global. */
  text: string;
  /** True when the target uses its own override instead of global content. */
  customized: boolean;
  maxLength: number;
  overLimit: boolean;
  /** Capability-driven field keys for this platform's customize panel. */
  fieldKeys: string[];
};

function textLimit(platform: Platform): number {
  const caps = getPlatformCapabilities(platform);
  return caps.fields.find((field) => field.type === "text")?.maxLength ?? 500;
}

/**
 * Character count in Unicode code points (not UTF-16 units), matching the
 * server contract (`Array.from().length` in validateTargetOverrides).
 * Emoji and other astral characters count once on both sides.
 */
export function countCharacters(text: string): number {
  return Array.from(text).length;
}

/**
 * Display order of the platform switcher. Tabs cover platforms, never
 * individual accounts.
 */
export const PREVIEW_PLATFORM_ORDER: readonly Platform[] = [
  "X",
  "THREADS",
  "INSTAGRAM",
  "TIKTOK",
];

export type PreviewTarget = {
  platform: Platform;
  accountId: string;
};

/**
 * Resolve which platform/account the single preview shows: the preferred
 * platform when still selected, otherwise the first selected one in
 * switcher order. One account per platform tab — the first selected
 * account of that platform. Null when nothing is selected.
 */
export function resolvePreviewTarget(
  selected: readonly { platform: Platform; accountId: string }[],
  preferredPlatform: Platform | null
): PreviewTarget | null {
  if (selected.length === 0) return null;
  const ordered = [...selected].sort(
    (a, b) =>
      PREVIEW_PLATFORM_ORDER.indexOf(a.platform) -
      PREVIEW_PLATFORM_ORDER.indexOf(b.platform)
  );
  const preferred =
    preferredPlatform === null
      ? undefined
      : ordered.find((entry) => entry.platform === preferredPlatform);
  const winner = preferred ?? ordered[0];
  if (!winner) return null;
  return { platform: winner.platform, accountId: winner.accountId };
}

/**
 * Characters left before a platform limit, clamped at zero so screen
 * readers hear "0 remaining" instead of a negative count (the over-limit
 * error itself is announced separately).
 */
export function remainingCharacters(text: string, maxLength: number): number {
  return Math.max(0, maxLength - countCharacters(text));
}

/**
 * The single source of truth for the composer preview model:
 * one preview per selected account, global text by default, and a
 * per-account override that only affects that account's preview.
 */
export function buildComposerPreviews(
  accounts: readonly PreviewAccount[],
  globalText: string,
  overrides: readonly PreviewOverride[]
): ComposerPreview[] {
  const overrideByAccount = new Map<string, string>();
  for (const entry of overrides) {
    if (
      entry &&
      typeof entry.accountId === "string" &&
      typeof entry.text === "string" &&
      entry.text.length > 0
    ) {
      overrideByAccount.set(entry.accountId, entry.text);
    }
  }

  return accounts.map((account) => {
    const caps = getPlatformCapabilities(account.platform);
    const override = overrideByAccount.get(account.id);
    const text = override ?? globalText;
    const maxLength = textLimit(account.platform);
    return {
      accountId: account.id,
      platform: account.platform,
      username: account.username,
      label: caps.label,
      text,
      customized: override !== undefined,
      maxLength,
      overLimit: countCharacters(text) > maxLength,
      fieldKeys: caps.fields.map((field) => field.key),
    };
  });
}

/**
 * Capability-driven media gate: for each selected account, does the global
 * media set satisfy that platform's media rules? Returns one error message
 * per offending platform (deduped by message). Replaces the old per-platform
 * hardcoded checks so adding a platform needs no composer change.
 */
export function buildComposerMediaErrors(
  accounts: readonly PreviewAccount[],
  media: readonly { type: MediaKind; mimeType: string }[]
): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const account of accounts) {
    const caps = getPlatformCapabilities(account.platform);
    const result = validateTargetMedia(caps, media);
    if (!result.ok && !seen.has(result.error)) {
      seen.add(result.error);
      errors.push(result.error);
    }
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Stage 2A: platform-aware preview foundation (data model only, no UI).
// Built on top of the helpers above plus capabilities/overrides — no
// parallel validation system. PreviewCard keeps consuming ComposerPreview,
// which ComposerPreviewModel extends.
// ---------------------------------------------------------------------------

/** Where the effective content came from: override present or not. */
export type PreviewContentSource = "global" | "override";

export type PreviewIssueCode =
  | "text-over-limit"
  | "tiktok-title-missing"
  | "content-empty"
  | "platform-unimplemented"
  | "media-not-supported"
  | "media-required"
  | "media-too-many"
  | "media-kind-required"
  | "media-kind-unsupported"
  | "media-mime-unsupported"
  | "media-unknown-type"
  | "media-empty"
  | "media-too-large"
  | "media-invalid";

export type PreviewIssue = {
  code: PreviewIssueCode;
  message: string;
};

export type PreviewValidation = {
  valid: boolean;
  errors: PreviewIssue[];
  warnings: PreviewIssue[];
};

export type PreviewMediaItem = {
  type: MediaKind;
  mimeType: string;
  name?: string;
  size?: number;
  issues: PreviewIssue[];
};

export type ComposerPreviewModel = ComposerPreview & {
  /** Override present for this target's content key, else global. */
  source: PreviewContentSource;
  /** Capability field key driving this preview ("text" | "title"). */
  contentKey: string;
  /** Capability field label ("Text" | "Title" | "Caption"). */
  contentLabel: string;
  characterCount: number;
  remaining: number;
  /** Composer-level media snapshot shared by all previews. */
  media: PreviewMediaItem[];
  /** "error" when this account has any platform media issue. */
  mediaState: "ok" | "error";
  validation: PreviewValidation;
  /** Override settings (e.g. TikTok privacy) for this account. */
  settings: Record<string, unknown>;
  hasSettingsOverride: boolean;
  /**
   * Effective content truly inherits the global value. False when a
   * content override exists — and for TikTok without a title, where
   * nothing is inherited at all.
   */
  inheritsGlobal: boolean;
};

/**
 * True when any model carries a per-file media issue (today: oversized
 * files only — see the per-file layer above). Used to gate submit paths;
 * platform-level issues already gate via buildComposerMediaErrors.
 */
export function hasBlockingFileIssues(
  models: readonly ComposerPreviewModel[]
): boolean {
  return models.some((model) =>
    model.media.some((file) => file.issues.length > 0)
  );
}

/**
 * Maps existing validator messages (validateTargetMedia,
 * validateMediaInput) to stable codes. Single mapping over the existing
 * message contracts — not a second validation system.
 */
export function classifyMediaIssue(message: string): PreviewIssueCode {
  if (message.includes("does not support image or video media publishing yet")) {
    return "media-not-supported";
  }
  if (message.includes("requires exactly one media item")) {
    return "media-required";
  }
  if (message.includes("supports at most")) return "media-too-many";
  if (message.includes("requires exactly one MP4/WebM video")) {
    return "media-kind-required";
  }
  if (message.includes("publishing is not implemented yet")) {
    return "platform-unimplemented";
  }
  if (
    message.includes("does not support image media yet") ||
    message.includes("does not support video media yet")
  ) {
    return "media-kind-unsupported";
  }
  if (message.includes("does not support ") && message.includes("accepts")) {
    return "media-mime-unsupported";
  }
  if (message.includes("File type could not be determined")) {
    return "media-unknown-type";
  }
  if (message.includes("Unsupported file type")) {
    return "media-mime-unsupported";
  }
  if (message.includes("File is empty")) return "media-empty";
  if (message.includes("File exceeds")) return "media-too-large";
  return "media-invalid";
}

function toIssue(message: string): PreviewIssue {
  return { code: classifyMediaIssue(message), message };
}

export type PreviewModelInput = {
  accounts: readonly PreviewAccount[];
  globalText: string;
  /** Per-account text/title override (TikTok title travels as text). */
  overrides: readonly PreviewOverride[];
  overrideSettings?: Readonly<Record<string, Record<string, unknown>>>;
  media?: readonly {
    type: MediaKind;
    mimeType: string;
    name?: string;
    size?: number;
  }[];
};

/**
 * Global composer state -> effective per-account preview model.
 * Rules: text platforms use global text unless overridden (override
 * replaces only that target); TikTok uses its title and never shows
 * global text as title when the title is missing; Instagram caption vs
 * Threads/X text stay distinguishable via contentKey/contentLabel.
 */
export function buildComposerPreviewModel(
  input: PreviewModelInput
): ComposerPreviewModel[] {
  const overrideByAccount = new Map<string, string>();
  for (const entry of input.overrides) {
    if (
      entry &&
      typeof entry.accountId === "string" &&
      typeof entry.text === "string" &&
      entry.text.length > 0
    ) {
      overrideByAccount.set(entry.accountId, entry.text);
    }
  }
  const mediaInput = input.media ?? [];
  const baseByAccount = new Map(
    buildComposerPreviews(input.accounts, input.globalText, input.overrides).map(
      (preview) => [preview.accountId, preview] as const
    )
  );

  return input.accounts.map((account) => {
    const caps = getPlatformCapabilities(account.platform);
    const base = baseByAccount.get(account.id);
    const textField = caps.fields.find((field) => field.type === "text");
    const contentKey = textField?.key ?? "text";
    const contentLabel = textField?.label ?? "Text";
    const override = overrideByAccount.get(account.id);
    const source: PreviewContentSource =
      override !== undefined ? "override" : "global";
    // Platform rule: TikTok publishes its title only — global text must
    // never leak into the TikTok preview as a title.
    const text =
      account.platform === "TIKTOK"
        ? (override ?? "")
        : (base?.text ?? input.globalText);
    const maxLength = base?.maxLength ?? textLimit(account.platform);
    const characterCount = countCharacters(text);
    const remaining = remainingCharacters(text, maxLength);
    const overLimit = characterCount > maxLength;
    const settings = input.overrideSettings?.[account.id] ?? {};
    const hasSettingsOverride = Object.keys(settings).length > 0;
    const customized = override !== undefined;

    const media: PreviewMediaItem[] = mediaInput.map((item) => {
      const issues: PreviewIssue[] = [];
      // Per-file layer reports SIZE violations only. MIME/kind/empty are
      // enforced at add-time (planMediaAdd) and per platform
      // (validateTargetMedia) — repeating them here would show the same
      // root cause twice. Size is the one file signal the platform
      // check cannot see (it receives no sizes).
      if (item.size !== undefined) {
        const fileCheck = validateMediaInput(item.mimeType, item.size);
        if (
          !fileCheck.ok &&
          classifyMediaIssue(fileCheck.error) === "media-too-large"
        ) {
          issues.push(toIssue(fileCheck.error));
        }
      }
      return { ...item, issues };
    });

    const mediaResult = validateTargetMedia(
      caps,
      mediaInput.map((item) => ({ type: item.type, mimeType: item.mimeType }))
    );
    const mediaIssues = mediaResult.ok ? [] : [toIssue(mediaResult.error)];

    const errors: PreviewIssue[] = [];
    const warnings: PreviewIssue[] = [];
    if (overLimit) {
      errors.push({
        code: "text-over-limit",
        message: `Exceeds the ${maxLength} character limit for ${caps.label}`,
      });
    }
    if (account.platform === "TIKTOK" && text.length === 0) {
      errors.push({
        code: "tiktok-title-missing",
        message: "TikTok posts require a title — customize it for TikTok",
      });
    }
    errors.push(...mediaIssues);
    if (text.length === 0 && account.platform !== "TIKTOK") {
      warnings.push({
        code: "content-empty",
        message: `Post text is empty for ${caps.label}`,
      });
    }

    return {
      accountId: account.id,
      platform: account.platform,
      username: account.username,
      label: base?.label ?? caps.label,
      text,
      customized,
      maxLength,
      overLimit,
      fieldKeys: base?.fieldKeys ?? caps.fields.map((field) => field.key),
      source,
      contentKey,
      contentLabel,
      characterCount,
      remaining,
      media,
      mediaState: mediaIssues.length > 0 ? "error" : "ok",
      validation: { valid: errors.length === 0, errors, warnings },
      settings,
      hasSettingsOverride,
      inheritsGlobal: !customized && account.platform !== "TIKTOK",
    };
  });
}
