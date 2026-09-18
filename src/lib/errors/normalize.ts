/**
 * Provider error normalization: raw SDK/transport error → DomainError.
 *
 * Duck-types provider errors (`{ code, httpStatus }`) instead of
 * importing `*ApiError` classes — this module stays dependency-free so
 * `src/domain/*` can import the primitives. User-safe strings come from
 * the existing per-provider `*ErrorMessage` dictionaries (unchanged);
 * here we only decide category / code / retryable.
 */
import {
  DomainError,
  ExternalProviderError,
  ProviderError,
} from "./domain-error";
import type { ErrorProvider } from "./domain-error";

type ProviderLike = {
  code?: string;
  httpStatus?: number;
  message?: string;
};

function readProviderLike(raw: unknown): ProviderLike | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const nested = record.error && typeof record.error === "object"
    ? (record.error as Record<string, unknown>)
    : null;
  const code = record.code ?? nested?.code;
  const httpStatus = record.httpStatus ?? record.status ?? nested?.httpStatus;
  const message = record.message ?? nested?.message;
  if (typeof code !== "string" && typeof httpStatus !== "number" && typeof message !== "string") {
    return null;
  }
  return {
    ...(typeof code === "string" ? { code } : {}),
    ...(typeof httpStatus === "number" ? { httpStatus } : {}),
    ...(typeof message === "string" ? { message } : {}),
  };
}

const TIKTOK_AUTH_CODES = new Set([
  "scope_not_authorized",
  "token_expired",
  "invalid_refresh_token",
  "refresh_token_expired",
  "access_token_invalid",
  "access_token_expired",
  "invalid_token",
]);

/** Provider said "slow down / duplicate" — safe to retry later. */
const TIKTOK_RETRYABLE_CODES = new Set([
  "rate_limit_exceeded",
  "spam_risk_too_many_posts",
  "reached_active_user_cap",
]);

const CONFIG_MESSAGE_PATTERNS = [
  "is not configured",
  "is required in production",
  "Billing is not configured",
  "CLIENT_ID",
  "CLIENT_SECRET",
  "APP_ID",
  "APP_SECRET",
];

/**
 * Classify a TikTok failure without changing its user-facing semantics:
 * returns the category/code/retryable triple; the safeMessage is still
 * produced by `tiktokErrorMessage` / `tiktokFailReasonMessage`.
 */
export function classifyTiktokError(raw: unknown): {
  kind: "external-auth" | "external-retryable" | "external-rejected" | "external-upstream" | "internal" | "unknown";
  code: "EXTERNAL_AUTH_EXPIRED" | "PROVIDER_REJECTED" | "UPSTREAM_UNAVAILABLE" | "PROVIDER_UNAVAILABLE" | "INTERNAL";
  retryable: boolean;
  providerCode?: string;
  httpStatus?: number;
} {
  if (raw instanceof DomainError) {
    return {
      kind: "unknown",
      code: "INTERNAL",
      retryable: raw.retryable,
      providerCode: raw.providerCode,
      httpStatus: raw.status,
    };
  }
  const like = readProviderLike(raw);
  const providerCode = like?.code;
  const httpStatus = like?.httpStatus;
  if (providerCode && TIKTOK_AUTH_CODES.has(providerCode)) {
    return { kind: "external-auth", code: "EXTERNAL_AUTH_EXPIRED", retryable: false, providerCode, httpStatus };
  }
  if (providerCode && TIKTOK_RETRYABLE_CODES.has(providerCode)) {
    return { kind: "external-retryable", code: "PROVIDER_REJECTED", retryable: true, providerCode, httpStatus };
  }
  if (typeof httpStatus === "number" && httpStatus >= 500) {
    return { kind: "external-upstream", code: "UPSTREAM_UNAVAILABLE", retryable: true, providerCode, httpStatus };
  }
  if (typeof httpStatus === "number" && httpStatus === 429) {
    return { kind: "external-retryable", code: "PROVIDER_REJECTED", retryable: true, providerCode, httpStatus };
  }
  if (providerCode || typeof httpStatus === "number") {
    return { kind: "external-rejected", code: "PROVIDER_REJECTED", retryable: false, providerCode, httpStatus };
  }
  const message = like?.message ?? (raw instanceof Error ? raw.message : "");
  if (typeof message === "string" && CONFIG_MESSAGE_PATTERNS.some((p) => message.includes(p))) {
    return { kind: "internal", code: "PROVIDER_UNAVAILABLE", retryable: false, providerCode, httpStatus };
  }
  return { kind: "unknown", code: "INTERNAL", retryable: false, providerCode, httpStatus };
}

/**
 * Normalize any provider failure to a DomainError.
 * `safeMessage` must be supplied by the caller (existing `*ErrorMessage`
 * dictionary) so semantics stay identical; when omitted, a generic
 * provider-unavailable message is used.
 */
export function normalizeProviderError(
  provider: ErrorProvider,
  raw: unknown,
  safeMessage = "The provider is temporarily unavailable. Please try again."
): DomainError {
  if (raw instanceof DomainError) return raw;
  if (provider === "tiktok") {
    const classified = classifyTiktokError(raw);
    switch (classified.kind) {
      case "external-auth":
        return new ExternalProviderError(safeMessage, {
          code: "EXTERNAL_AUTH_EXPIRED",
          status: 502,
          retryable: false,
          provider,
          providerCode: classified.providerCode,
        });
      case "external-retryable":
        return new ExternalProviderError(safeMessage, {
          code: "PROVIDER_REJECTED",
          status: 502,
          retryable: true,
          provider,
          providerCode: classified.providerCode,
        });
      case "external-upstream":
        return new ExternalProviderError(safeMessage, {
          code: "UPSTREAM_UNAVAILABLE",
          status: 502,
          retryable: true,
          provider,
          providerCode: classified.providerCode,
        });
      case "external-rejected":
        return new ExternalProviderError(safeMessage, {
          code: "PROVIDER_REJECTED",
          status: 502,
          retryable: false,
          provider,
          providerCode: classified.providerCode,
        });
      case "internal":
        return new ProviderError(safeMessage, {
          code: "PROVIDER_UNAVAILABLE",
          status: 500,
          provider,
          providerCode: classified.providerCode,
        });
      default:
        return new ProviderError(safeMessage, {
          code: "PROVIDER_UNAVAILABLE",
          status: 502,
          provider,
          providerCode: classified.providerCode,
        });
    }
  }
  const like = readProviderLike(raw);
  const httpStatus = like?.httpStatus;
  if (typeof httpStatus === "number" && httpStatus >= 500) {
    return new ExternalProviderError(safeMessage, {
      code: "UPSTREAM_UNAVAILABLE",
      status: 502,
      retryable: true,
      provider,
      providerCode: like?.code,
    });
  }
  if (typeof httpStatus === "number" && httpStatus === 429) {
    return new ExternalProviderError(safeMessage, {
      code: "PROVIDER_REJECTED",
      status: 502,
      retryable: true,
      provider,
      providerCode: like?.code,
    });
  }
  if (like?.code || typeof httpStatus === "number") {
    return new ExternalProviderError(safeMessage, {
      code: "PROVIDER_REJECTED",
      status: 502,
      retryable: false,
      provider,
      providerCode: like?.code,
    });
  }
  return new ProviderError(safeMessage, {
    code: "PROVIDER_UNAVAILABLE",
    status: 502,
    provider,
  });
}
