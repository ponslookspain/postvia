import type { Platform } from "@prisma/client";
import { getPlatformCapabilities } from "@/lib/platforms/capabilities";
import { validateTargetMedia } from "@/lib/platforms/overrides";
import type { MediaKind } from "@/lib/media";

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
