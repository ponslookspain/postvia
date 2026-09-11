import type { Platform } from "@prisma/client";
import type { MediaKind } from "@/lib/media";
import {
  getPlatformCapabilities,
  type CapabilityField,
  type PlatformCapabilities,
} from "./capabilities";

export type TargetOverrides = {
  content?: Record<string, unknown>;
  settings?: Record<string, unknown>;
};

export type EffectiveTargetContent = {
  text: string;
  content: Record<string, unknown>;
  settings: Record<string, unknown>;
};

export type OverrideValidation =
  | { ok: true; overrides: TargetOverrides }
  | { ok: false; error: string };

export type TargetAccountSelection = {
  id: string;
  userId: string;
  platform: Platform;
};

export function validateTargetAccountSelection(
  accounts: readonly TargetAccountSelection[],
  requestedIds: readonly string[],
  userId: string,
  hasMedia: boolean
): { ok: true; accounts: TargetAccountSelection[] } | { ok: false; error: string } {
  const uniqueIds = [...new Set(requestedIds)];
  if (uniqueIds.length === 0) {
    return { ok: false, error: "Select at least one connected social account" };
  }
  const selected = uniqueIds.map((id) => accounts.find((account) => account.id === id));
  if (selected.some((account) => !account || account.userId !== userId)) {
    return { ok: false, error: "One or more selected social accounts are unavailable" };
  }
  const resolved = selected as TargetAccountSelection[];
  if (hasMedia && resolved.some((account) => account.platform === "X")) {
    return {
      ok: false,
      error: "X media publishing is not implemented yet. Remove media or deselect X.",
    };
  }
  for (const account of resolved) {
    if (!getPlatformCapabilities(account.platform).implemented) {
      return {
        ok: false,
        error: `${getPlatformCapabilities(account.platform).label} publishing is not implemented yet`,
      };
    }
  }
  return { ok: true, accounts: resolved };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validateField(
  field: CapabilityField,
  value: unknown
): string | null {
  if (field.type === "text") {
    if (typeof value !== "string") return `${field.key} must be a string`;
    if (field.maxLength !== undefined && value.length > field.maxLength) {
      return `${field.key} exceeds the ${field.maxLength} character limit`;
    }
    return null;
  }
  if (field.type === "boolean") {
    return typeof value === "boolean" ? null : `${field.key} must be a boolean`;
  }
  if (field.type === "enum") {
    if (typeof value !== "string") return `${field.key} must be a string`;
    if (!field.options?.includes(value)) {
      return `${field.key} has an unsupported value`;
    }
    return null;
  }
  return `${field.key} has an unsupported type`;
}

export function validateTargetOverrides(
  platform: Platform,
  input: unknown
): OverrideValidation {
  if (input === null || input === undefined) {
    return { ok: true, overrides: {} };
  }
  if (!isRecord(input)) {
    return { ok: false, error: "Target overrides must be an object" };
  }

  const content = input.content === undefined ? {} : input.content;
  const settings = input.settings === undefined ? {} : input.settings;
  if (!isRecord(content) || !isRecord(settings)) {
    return { ok: false, error: "Target override content/settings must be objects" };
  }

  const caps = getPlatformCapabilities(platform);
  const fields = new Map(caps.fields.map((field) => [field.key, field]));
  for (const [key, value] of Object.entries(content)) {
    const field = fields.get(key);
    if (!field) return { ok: false, error: `${key} is not supported on ${platform}` };
    const error = validateField(field, value);
    if (error) return { ok: false, error };
  }
  for (const [key, value] of Object.entries(settings)) {
    const field = fields.get(key);
    if (!field) return { ok: false, error: `${key} is not supported on ${platform}` };
    const error = validateField(field, value);
    if (error) return { ok: false, error };
  }

  return {
    ok: true,
    overrides: {
      content: { ...content },
      settings: { ...settings },
    },
  };
}

export function resolveEffectiveTargetContent(
  globalText: string,
  overrides: unknown
): EffectiveTargetContent {
  const source = isRecord(overrides) ? overrides : {};
  const content = isRecord(source.content) ? source.content : {};
  const settings = isRecord(source.settings) ? source.settings : {};
  const text = typeof content.text === "string" ? content.text : globalText;
  return { text, content, settings };
}

export function validateTargetMedia(
  caps: PlatformCapabilities,
  media: readonly { type: MediaKind; mimeType: string }[]
): { ok: true } | { ok: false; error: string } {
  if (media.length > 0 && caps.media.maxItems === 0) {
    return {
      ok: false,
      error: `${caps.label} does not support image or video media publishing yet`,
    };
  }
  if (media.length > caps.media.maxItems) {
    return {
      ok: false,
      error: `${caps.label} supports at most ${caps.media.maxItems} media item${caps.media.maxItems === 1 ? "" : "s"}`,
    };
  }
  if (media.length === 0) {
    return caps.supportsText
      ? { ok: true }
      : { ok: false, error: `${caps.label} requires media` };
  }
  if (!caps.implemented) {
    return { ok: false, error: `${caps.label} publishing is not implemented yet` };
  }
  for (const item of media) {
    if (item.type === "IMAGE" && !caps.media.image) {
      return { ok: false, error: `${caps.label} does not support image media yet` };
    }
    if (item.type === "VIDEO" && !caps.media.video) {
      return { ok: false, error: `${caps.label} does not support video media yet` };
    }
    if (caps.media.mimeTypes && !caps.media.mimeTypes.includes(item.mimeType)) {
      return { ok: false, error: `${caps.label} does not support ${item.mimeType}` };
    }
  }
  return { ok: true };
}
