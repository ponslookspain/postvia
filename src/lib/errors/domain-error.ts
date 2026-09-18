/**
 * Unified domain error primitives.
 *
 * Server-side only as thrown objects; only `safeMessage` (+ `code`,
 * `retryable`, safe `details`) ever crosses the API boundary via
 * `toApiResponse`. `cause` is internal and never serialized.
 *
 * No Prisma/Stripe/Sentry/Next imports — safe for `src/domain/*`.
 */
import type { ErrorCode } from "./codes";

export type ErrorProvider =
  | "x"
  | "tiktok"
  | "threads"
  | "instagram"
  | "stripe"
  | "blob"
  | "resend";

export type DomainErrorOptions = {
  status?: number;
  code?: ErrorCode;
  safeMessage?: string;
  retryable?: boolean;
  details?: Record<string, unknown>;
  provider?: ErrorProvider;
  providerCode?: string;
  cause?: unknown;
};

const FALLBACK_MESSAGE = "Something went wrong. Please try again.";

export class DomainError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly safeMessage: string;
  readonly retryable: boolean;
  readonly details?: Record<string, unknown>;
  readonly provider?: ErrorProvider;
  readonly providerCode?: string;
  override readonly cause?: unknown;

  constructor(message: string, options: DomainErrorOptions & { code: ErrorCode; status: number }) {
    super(message);
    this.name = new.target.name;
    this.code = options.code;
    this.status = options.status;
    this.safeMessage = options.safeMessage ?? message;
    this.retryable = options.retryable ?? false;
    if (options.details !== undefined) this.details = options.details;
    if (options.provider !== undefined) this.provider = options.provider;
    if (options.providerCode !== undefined) this.providerCode = options.providerCode;
    if (options.cause !== undefined) this.cause = options.cause;
  }
}

/** Input failed domain rules. Always 400, never retryable, never reported. */
export class ValidationError extends DomainError {
  constructor(message: string, options: Omit<DomainErrorOptions, "code" | "status"> = {}) {
    super(message, { ...options, code: "VALIDATION_FAILED", status: 400, retryable: false });
    this.name = "ValidationError";
  }
}

/**
 * Missing session / чужой ресурс / нет прав. 401 по умолчанию, 403/404
 * через options (code выводится из status: 401 → UNAUTHENTICATED,
 * 403 → FORBIDDEN, 404 → NOT_FOUND).
 */
export class AuthorizationError extends DomainError {
  constructor(message: string, options: Omit<DomainErrorOptions, "code"> & { status?: 401 | 403 | 404 } = {}) {
    const status = options.status ?? 401;
    const code: ErrorCode =
      status === 403 ? "FORBIDDEN" : status === 404 ? "NOT_FOUND" : "UNAUTHENTICATED";
    super(message, { ...options, code, status, retryable: false });
    this.name = "AuthorizationError";
  }
}

/** Тариф не позволяет. Всегда 403 + UPGRADE_REQUIRED-совместимые details. */
export class EntitlementError extends DomainError {
  constructor(
    reason: string,
    options: { upgradeTo?: string | null; details?: Record<string, unknown>; cause?: unknown } = {}
  ) {
    super(reason, {
      code: "ENTITLEMENT_DENIED",
      status: 403,
      retryable: false,
      details: {
        ...(options.details ?? {}),
        ...(options.upgradeTo !== undefined ? { upgradeTo: options.upgradeTo } : {}),
      },
      ...(options.cause !== undefined ? { cause: options.cause } : {}),
    });
    this.name = "EntitlementError";
  }
}

/** Flood/abuse gate. Всегда 429, всегда с retryAfterSeconds в details. */
export class RateLimitError extends DomainError {
  constructor(
    message = "Too many requests. Please wait before trying again.",
    options: { retryAfterSeconds?: number | null; details?: Record<string, unknown>; cause?: unknown } = {}
  ) {
    const retryAfter =
      typeof options.retryAfterSeconds === "number" &&
      Number.isFinite(options.retryAfterSeconds) &&
      options.retryAfterSeconds > 0
        ? Math.min(Math.ceil(options.retryAfterSeconds), 3600)
        : undefined;
    super(message, {
      code: "RATE_LIMITED",
      status: 429,
      retryable: true,
      details: {
        ...(options.details ?? {}),
        ...(retryAfter !== undefined ? { retryAfterSeconds: retryAfter } : {}),
      },
      ...(options.cause !== undefined ? { cause: options.cause } : {}),
    });
    this.name = "RateLimitError";
  }
}

/**
 * Наша ошибка интеграции: нет конфига, unsupported platform, кривое
 * состояние, упавшая token-ротация по нашей вине. 502/500, не retryable.
 */
export class ProviderError extends DomainError {
  constructor(
    message: string,
    options: Omit<DomainErrorOptions, "code"> & {
      code?: Extract<ErrorCode, "PROVIDER_UNAVAILABLE" | "UPSTREAM_UNAVAILABLE" | "INTERNAL">;
      status?: number;
    } = {}
  ) {
    super(message, {
      ...options,
      code: options.code ?? "PROVIDER_UNAVAILABLE",
      status: options.status ?? 502,
      retryable: false,
    });
    this.name = "ProviderError";
  }
}

/**
 * Провайдер корректно ответил отказом: его rate limit / spam / reject /
 * его 5xx. retryable — по семантике провайдера.
 */
export class ExternalProviderError extends DomainError {
  constructor(
    safeMessage: string,
    options: Omit<DomainErrorOptions, "code"> & {
      code?: Extract<ErrorCode, "PROVIDER_REJECTED" | "EXTERNAL_AUTH_EXPIRED" | "UPSTREAM_UNAVAILABLE">;
      status?: number;
      retryable?: boolean;
    } = {}
  ) {
    super(safeMessage, {
      ...options,
      code: options.code ?? "PROVIDER_REJECTED",
      status: options.status ?? 502,
      retryable: options.retryable ?? false,
    });
    this.name = "ExternalProviderError";
  }
}

export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError;
}

export { FALLBACK_MESSAGE };
