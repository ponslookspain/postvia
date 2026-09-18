# Architecture

PostVia is a Next.js 16 (App Router, RSC) + React 19 + TypeScript app on
PostgreSQL (Prisma 6, Neon hosting). No middleware file exists
(`src/middleware.ts` absent by design) — every route enforces auth itself
via `getApiUser()` (API) or `requireUser()` (RSC pages).

## Layers

```
UI (src/app/*, src/components/*)
  ↓ fetch / server components
API routes (src/app/api/*)
  ↓
Domain (src/domain/* — pure business logic, no Prisma/Stripe/Blob/Next I/O)
  ↓ (domain may use pure shared helpers from src/lib only)
Application / infrastructure libs (src/lib/*)
  ↓ PrismaClient (src/lib/prisma.ts, singleton)
Neon PostgreSQL
```

Migration is incremental by design: new or actively changing business
logic goes to `src/domain/<domain>`; existing `src/lib` modules stay
where they are until a real change justifies a split. `src/lib`
modules that already moved keep compatibility re-export shims
(e.g. `@/lib/platforms/capabilities` → `@/domain/social/capabilities`)
so old imports keep working. `src/lib` never depends on `src/app`
(shared view-model types live in `src/lib/*-types.ts`, not in pages).

External services: Better Auth (auth), Stripe (billing), Resend (email),
Vercel Blob (media), provider APIs (X / Threads / TikTok / Instagram),
Sentry (error reporting), Vercel Cron (scheduler trigger).

## Modules (`src/lib`)

| Module | Owns |
|---|---|
| `auth.ts` | Better Auth instance, session helpers, auth lifecycle hooks (abuse bookkeeping) |
| `abuse.ts` | Identity resolution/merge, risk, tombstones, rate limits, OAuth gates, ledgers |
| `free-post-kernel.ts` | Atomic Free post creation (identity + per-user claim + insert in one `$transaction`) |
| `entitlements.ts` | Effective plan, usage, per-user quota ledger (`PostUsage`) |
| `dashboard.ts` | Server-side dashboard fetch + view model (`parseDashboardParams` / `getDashboard` / `buildDashboardViewModel`); reuses `dashboard-analytics.ts` pure utilities and `entitlements.ts` billing rules, never replaces them |
| `dashboard-types.ts` | Shared dashboard view-model types (`ChannelRow`, `OutcomeSegment`) — single source so `lib` never imports from `app` |
| `dashboard-analytics.ts` | Pure dashboard analytics/formatting utilities (no Prisma, no I/O) |
| `plans.ts` | Plan ids, prices, entitlements (single source of truth) |
| `social-accounts.ts` | Race-safe `SocialAccount` create/disconnect lookup |
| `social/` | Per-provider OAuth, token refresh, publish primitives (`x`, `threads`, `tiktok`, `instagram`) — infrastructure clients, stay in `lib` |
| `domain/social/` | Pure social domain: platform capability registry (`capabilities`), target overrides/content validation (`overrides`), provider interfaces (`provider`), PKCE helpers (`pkce`). `src/lib/platforms/*` and `src/lib/social/{provider,pkce}.ts` are re-export shims. Runtime clients (`ensureFresh*Token`, fetch/poll/upload, Prisma CAS) stay in `src/lib/social/*`. Consumes `domain/media` (`MediaKind`, `isMediaKind`), never `lib/media` |
| `domain/media/` | Pure media core: global kind/limit/MIME policy + validation (`policy`), byte-signature verification (`signature`), video probe + duration check with caller-supplied cap (`video`), canonical-image decision (`optimize`), upload validation/codecs/security decisions (`upload-rules`: TTL, authorize, client-payload codec, reserved-pathname rules, token-payload codec, completed-upload validation, rejection error) + registration contract (`MediaRegistrationTx/Store` ports with the withPostLock serialization contract, `claimMediaSlot` duplicate→cap→create claim, `MediaSlotClaim`). Zero deps (no Prisma/Blob/Next/env/diagnostics). `src/lib/media{,-signature,-video,-optimize,-upload}.ts` are re-export shims; `lib/media.ts` additionally keeps `makeBlobPathname` (storage layout + random) and `resolveThreadsMediaPolicy` (Threads rule, later social-policies step); `lib/media-video.ts` keeps `maxVideoDurationSeconds` (env reader, lib passes the limit into the domain check); `lib/media-upload.ts` keeps orchestration (reserve/register, `txFromClient`, `liveMediaRegistrationStore` with `pg_advisory_xact_lock`, Blob verify wrappers, orphan cleanup, P2002 mapping) |
| `publish.ts` / `scheduling.ts` / `schedule.ts` | Publish engine, due-post claiming, schedule validation |
| `bulk-schedule.ts` | Client/server bulk helpers (fan-out through `POST /api/posts`) |
| `media*.ts`, `blob.ts` | Upload reservation, presigned flow, optimization, orphan sweep |
| `stripe.ts`, `stripe-redirect.ts` | Stripe config/prices, webhook snapshot processing, redirect safety |
| `email.ts` | Resend verification mail only |
| `diagnostics.ts` | Console pipeline + scrubbed Sentry bridge (`reportError`) |
| `base-url.ts` | `BETTER_AUTH_URL` / Vercel URL resolution |
| `rate-limit.ts` | Legacy in-memory limiter — test-only, not used by routes (persistent `AbuseRateBucket` is authoritative) |

## Critical flows

- **Signup/login:** Better Auth (`/api/auth/[...all]`) → email/password (+verification mail) or Google (trusted provider, auto-links by verified email). Abuse hooks only *record* signals here; enforcement happens downstream.
- **OAuth connect:** `GET /api/auth/:provider/connect` (auth → `gateOAuthInit` per-IP → state cookie → authorize URL) → provider → `GET .../callback` (state check → `gateOAuthCallback` IP+user → token exchange → profile → reconnect-update **or** `gateNewSocialLink` + `createSocialAccountRaceSafe`).
- **Post creation:** `POST /api/posts` → plan gate → validation → Free: atomic kernel; paid/bypass: per-user ledger only → 201/403/500.
- **Publishing:** `POST /api/posts/[id]/publish|retry` claims targets (`→PUBLISHING`) and continues in `waitUntil`; cron `/api/cron/publish-scheduled` (Bearer `CRON_SECRET`) picks up `SCHEDULED` posts and stale `PUBLISHING` rows.
- **Billing:** Stripe Checkout/Portal create sessions; **only** the verified webhook writes paid `Subscription` state (idempotent via `StripeEvent`).

## Security boundaries

1. Route edge: `getApiUser`/`requireUser` on every authenticated surface.
2. Ownership: every mutation re-scopes queries by `userId` (posts, accounts, media, settings).
3. Entitlement: server-side `getEffectivePlan` + ledger checks; client UI only reflects denials.
4. Anti-abuse: identity ledger (Free), global total account limits, OAuth rate buckets, unique DB constraints as the final arbiter.

## Transaction boundaries

- `createFreePostAtomic`: resolve + identity claim + per-user claim + `post.create` in **one** `$transaction` (Free posts).
- `mergeIdentitiesWithClient`: full merge (links, signals, usage carry, risk) in **one** `$transaction`, retried once.
- Webhook processing: claim-first (`StripeEvent`) then apply.
- Publish claiming: conditional `updateMany` transitions (no long transactions; stale recovery by cron/retry).
- Everything else is single-statement autocommit; races are closed with unique constraints + conditional updates, never with read-then-act alone.
