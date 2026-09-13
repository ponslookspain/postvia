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
Domain libs (src/lib/*)
  ↓ PrismaClient (src/lib/prisma.ts, singleton)
Neon PostgreSQL
```

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
| `plans.ts` | Plan ids, prices, entitlements (single source of truth) |
| `social-accounts.ts` | Race-safe `SocialAccount` create/disconnect lookup |
| `social/` | Per-provider OAuth, token refresh, publish primitives (`x`, `threads`, `tiktok`, `instagram`, `provider`, `pkce`) |
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
