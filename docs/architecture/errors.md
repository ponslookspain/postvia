# Unified error model

Gradual, backward-compatible unification of errors across
`domain → API → UI → Sentry`. New and touched code uses this model;
old code is NOT rewritten without need.

## Taxonomy

All primitives live in `src/lib/errors/` (no Prisma/Stripe/Sentry/Next
imports, so `src/domain/*` can import them):

| Class | Code(s) | HTTP | Retryable | Sentry |
| ----- | ------- | ---- | --------- | ------ |
| `ValidationError` | `VALIDATION_FAILED` | 400 | no | no |
| `AuthorizationError` | `UNAUTHENTICATED` (401) / `FORBIDDEN` (403) / `NOT_FOUND` (404 mask) | 401/403/404 | no | no |
| `EntitlementError` | `ENTITLEMENT_DENIED` | 403 + `details.upgradeTo` | no | no |
| `RateLimitError` | `RATE_LIMITED` | 429 + `details.retryAfterSeconds` | yes | no |
| `ProviderError` (our side: missing config, unsupported platform, malformed state) | `PROVIDER_UNAVAILABLE` | 500/502 | no | error |
| `ExternalProviderError` (provider refused: rate limit, spam, reject, its 5xx) | `PROVIDER_REJECTED` / `EXTERNAL_AUTH_EXPIRED` / `UPSTREAM_UNAVAILABLE` | 502 | per provider semantics | error, or warning when retryable |
| `DomainError` base (rare infra: `NOT_FOUND`, `CONFLICT`, `INTERNAL`) | as set | 404/409/500 | no | only `INTERNAL` |

`AuthorizationError` vs `EntitlementError`: the first is "who are you /
whose is this" (session, ownership, admin), the second is "what does
your plan allow" (always with an upgrade hint). Never mix them.

`ProviderError` vs `ExternalProviderError`: the first is "we failed to
call correctly", the second is "we called correctly and the provider
said no". Only the second carries `providerCode` + `retryable` from
provider semantics.

## Domain → API → UI → Sentry

- **Domain**: throw (or return, at lib boundaries) a `DomainError`
  with a user-safe `safeMessage`. `cause` stays internal.
- **API**: `toApiResponse(err)` returns the flat shape
  `{ error: string, code, retryable?, details? }`. `error` is ALWAYS
  the safe string — old `typeof data?.error === "string"` clients keep
  working. `cause`, internal messages and secrets never serialize.
  A nested `{ error: { code, message } }` shape is a possible future
  migration, explicitly NOT implemented now.
- **UI**: `parseApiError(body)` (`src/lib/client-error-message.ts`)
  understands the new flat shape, the legacy `{ error: string }` and
  the legacy `{ code: "UPGRADE_REQUIRED", reason, upgradeTo }`. Unknown
  codes fall back to "Something went wrong. Please try again." The
  OAuth `?error=` redirect protocol is unchanged.
- **Sentry**: `reportError(scope, event, error, extra)` classifies
  `DomainError`: expected categories (validation, auth, entitlement,
  rate-limit, not-found, conflict) are console-only; provider errors
  add safe tags (`code`, `provider`) and context (`providerCode`,
  `httpStatus`), retryable ones as warnings. `cause` is stripped
  before capture. `scrubSentryEvent` privacy model unchanged.

## Rules for new routes

1. Throw `DomainError` subclasses; convert with `toApiResponse`.
2. Keep the existing HTTP status; keep the existing `error` string;
   add `code` (+ `retryable`/`details` where safe).
3. New provider code goes through `normalizeProviderError(platform,
   raw, safeMessage)`; user strings stay in the existing
   `*ErrorMessage` dictionaries.
4. Never put `cause`, tokens, OAuth credentials or internal detail in
   JSON (covered by `tests/errors.test.ts` no-leakage cases).

## Provider normalization

`src/lib/errors/normalize.ts` duck-types `{ code, httpStatus }`
(TikTok tables: auth codes → `EXTERNAL_AUTH_EXPIRED`; spam/rate/cap
codes and HTTP 429/5xx → retryable; terminal rejects → non-retryable;
config-missing messages → `ProviderError`). Pilots: TikTok publish
only. X/Threads/Instagram/Stripe keep their current mappers.

## Publishing observability (companion, not error telemetry)

Per-target structured events live in `src/lib/publish-observability.ts`
and reuse this model without extending it: raw errors are classified
with the existing taxonomy/`normalizeProviderError` (and
`isRateLimitSignal` for provable 429/rate-limit detection), but only a
safe `status` enum reaches the logs — never `message`, `stack`,
`providerCode` values, responses, or bodies. Payload is exactly
`provider|postId|targetId|duration|attempt|status` (compile-time type +
runtime allowlist pick). Emission goes through `logDiagnostic` only;
`reportError`/Sentry are deliberately NOT called per attempt (terminal
provider rejections are user-visible outcomes, not incidents). See
`docs/posting.md` ("Publishing observability") for the taxonomy and
`tests/publish-observability.test.ts` for the contract, negative, and
multi-target cases.

## Backward compatibility

- `{ error: string }` is the contract; `code`/`retryable`/`details`
  are additive.
- `postTarget.errorMessage` / `Post.errorMessage` stay plain strings
  (`safeMessage` is persisted, no schema change).
- No `?v=2`, no `Accept` negotiation, no `Result<T,E>`, no Zod, no
  i18n in this phase.

## Explicitly NOT migrated yet

All 39 routes except `media/prepare` (+ `media/upload` status fix);
`publish.ts` except TikTok failure boundary; OAuth callback protocol;
Stripe webhook ack strategy; Prisma `P2002` control-flow; DB schema;
all `error.tsx` boundaries; X/Threads/Instagram providers.
