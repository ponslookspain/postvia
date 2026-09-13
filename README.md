# Postvia

Publish to social media in one place. Postvia lets you write once, preview per
platform, and publish (or schedule) to every connected social profile.

## Stack

- **Framework:** Next.js 16 (App Router, RSC), React 19, TypeScript
- **Styling:** Tailwind CSS v4, shadcn/ui (`base-nova` style, Neutral base color)
  on Base UI primitives, Lucide icons, Geist Sans / Geist Mono via `next/font`
- **Database:** PostgreSQL via Prisma 6
- **Auth:** Better Auth — email/password, Google OAuth, email verification
  (Resend)
- **Media:** Vercel Blob (private store, presigned uploads, webhook
  registration)
- **Scheduling:** Vercel Cron (`/api/cron/publish-scheduled`)

## Social platforms

Implemented and connectable via OAuth: **Threads, X, TikTok, Instagram**.
`Facebook`, `LinkedIn`, `YouTube`, `Pinterest` exist in the Prisma enum but
are not implemented yet. Platform behavior is capability-driven
(`src/lib/platforms/capabilities.ts`), so adding a platform does not require
composer changes.

## App structure

- `/dashboard` — publishing overview: Needs attention (failed / partially
  published / publishing), Up next (upcoming scheduled), stats with
  publishing/failed counters and per-platform breakdown, accounts strip,
  recent posts with search (`?q=`) and status filter (`?status=`), onboarding
  empty state for new users
- `/posts` — post list with `?status=` filter (All / Draft / Scheduled /
  Publishing / Published / Partially published / Failed)
- `/calendar` — visual content calendar (month grid, per-day posts with
  status/platform/media preview, drag & drop rescheduling via the posts
  API, unscheduled drafts panel, viewer-timezone bucketing)
- `/posts/new` — multi-target composer: global text with per-account
  overrides (TikTok uses its own title, never the global text), platform
  switcher with a single platform-aware preview (X/Threads/Instagram/TikTok
  mock posts), structured per-platform validation with stable issue codes,
  per-platform character limits and remaining counters, media attach
  (images + MP4/WebM/MOV video, per-file retry, concurrent uploads),
  TikTok posting options (privacy, duet/stitch/comments,
  cover timestamp from creator-info), save draft / schedule (Dialog) /
  publish now with live progress and cancel, dirty-form guard, mobile
  bottom action bar
- `/posts/bulk` — bulk video scheduling: several videos, start date/time
  with timezone and interval → one ordinary scheduled post per video,
  then redirect to the calendar
- `/posts/[id]` — post detail: edit text, media management, per-target
  statuses with retry, reschedule (Dialog), publish, delete (Dialog confirm)
- `/accounts` — connect / reconnect / disconnect social profiles, token-expiry
  badges, disconnect confirmation Dialog
- `/settings` — profile name, sign-in methods, password, notification
  preferences, danger-zone account deletion (Dialog + confirmation phrase)
- `/login`, `/signup`, `/verify-email` — auth flows with verification resend
- `/terms`, `/privacy` — legal pages
- `/api/*` — posts CRUD + publish/retry, media prepare/upload/status,
  settings, per-platform OAuth connect/callback + account management, TikTok
  creator-info, scheduled-publish cron

## Publishing model

- `Post` lifecycle: `DRAFT → SCHEDULED → PUBLISHING → PUBLISHED`, plus
  `PARTIALLY_PUBLISHED` and `FAILED`. Per-account `PostTarget` rows track
  `PENDING / PUBLISHING / PUBLISHED / FAILED` with error messages.
- Publish endpoints respond `202` while work continues server-side; clients
  poll until the post settles instead of assuming success.
- Media uploads go through `/api/media/prepare` (authorized pathname) →
  presigned Blob upload → server-side webhook registration, with client
  polling for registration before publishing.
- Canonical media: the webhook replaces still images (JPEG/PNG/WebP) with an
  optimized JPEG (max 2048px, quality 82) at the same pathname via
  `putImage` — only the canonical bytes are stored, the original is gone.
  GIFs stay byte-identical (animation), tiny JPEGs skip the transform, and
  any optimization failure falls back to the original instead of failing
  the upload. Videos pass through untouched (no heavy transcoding in a
  request); the webhook + polling + cron recovery is their async pipeline.
- Orphan blobs (bytes without a Media row, older than 24h) are swept by the
  cron tick in capped batches. Post and media deletion remove their blobs
  eagerly.

## Billing / Plans (test mode)

- Plans: Free ($0), Growth ($20), Scale ($50). Single source of truth:
  `src/lib/plans.ts` (prices, features, entitlements) — never duplicated.
- Limits: Free `{1 account/platform, 15 posts/month, no bulk}`,
  Growth `{5/platform, 300/month, 10-video bulk}`, Scale `{unlimited
  accounts/posts, 10-video bulk}`. Media limits stay global. Monthly quota
  counts created posts via an atomic ledger (`PostUsage`) — deleting a post
  never refills it, and concurrent creates on the last slot grant one
  winner. Bulk batches attest their size server-side per item.
- New users start on Free automatically — no plan selection, no checkout.
  Paid landing CTAs route signup → `/billing` for an instant upgrade.
- Data: `Subscription` row per user (plan, status, period end,
  cancel-at-periodEnd, Stripe fields reserved). No row → active Free.
  Downgrades and expirations never delete data; only new actions are gated.
- Enforcement lives in `src/lib/entitlements.ts` and is applied
  server-side: `POST /api/posts` (monthly quota → 403 `UPGRADE_REQUIRED`),
  OAuth callbacks (per-platform account quota, reconnects exempt), retry +
  reschedule PATCH, calendar page, bulk (plan cap + quota pre-check, with
  per-post server backstop). UI only reflects denials.
- Test-mode billing API: `POST /api/billing/change` and
  `POST /api/billing/cancel` are admin-only testing tools (403 for ordinary
  users). Real plan changes go through Stripe: `POST /api/billing/checkout`
  (Growth/Scale Checkout), `POST /api/billing/portal` (Customer Portal for
  plan changes and cancellation), and `POST /api/billing/webhook` (verified
  Stripe events are the only writer of paid `Subscription` state, idempotent
  via `StripeEvent`). No Stripe, no charges without `STRIPE_SECRET_KEY`.
  Preview deployments use `sk_test_*` keys with separate test webhook
  secrets and test price ids (Vercel Preview env); a test key without
  explicit test prices refuses checkout instead of touching live prices.
- Plan management lives on `/billing` (current plan, usage, change,
  cancel); Settings stays account-only. Dashboard shows a compact
  `Plan · usage` line linking to `/billing`.
- Admin testing without paying: `ADMIN_EMAILS` env (server-side only).
  With a `BillingTestOverride` row an admin gets BYPASS (unlimited) or
  ENFORCEMENT (chosen plan enforced exactly like a real user), plus
  cancellation/expiration simulation on `/billing`. Ordinary users can
  never activate it (403 + hidden UI).
- Stripe later: fill `stripeCustomerId`/`stripeSubId` and map webhooks onto
  the same `Subscription` fields (`plan`, `status`, `currentPeriodEnd`,
  `cancelAtPeriodEnd`) — UI and entitlements stay unchanged.

## Design system

- Nova neutral CSS-variable tokens (`src/app/globals.css`), semantic colors
  only, dark mode via `.dark` overrides, no hardcoded palette values.
- Shared components (`src/components`): `PageHeader`, `StatusBadge`,
  `AuthShell`, `MobileTopBar`, plus shadcn/ui primitives in
  `src/components/ui` (Base UI only — no Radix).
- Conventions: `FieldGroup` + `Field` forms with `data-invalid` /
  `aria-invalid`, `Card` sections with full header composition, `Alert` for
  callouts, `Empty` for empty states, Base UI `toast` (not `alert()`), `Gap`
  spacing (no `space-*`), `size-*` for square elements, `cn()` for
  conditionals, Lucide icons with `data-icon` inside buttons.
- Responsive: `max-w-5xl/3xl/6xl` containers with `p-4 md:p-8`, sidebar on
  desktop + top bar navigation on mobile.

## Getting started

```bash
npm install
# configure .env (DATABASE_URL_POSTGRES_PRISMA_URL, auth + OAuth + Resend + Blob keys)
npx prisma db push
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

```bash
npm run dev        # start dev server
npm run build      # prisma generate + next build
npm run start      # start production server
npm run lint       # eslint
npm run typecheck  # tsc --noEmit
npm test           # node --test suite (402 tests)
```

## Deploy

Connected Vercel project `postvia` (see `.vercel/project.json`). Pushing to
`main` deploys via the linked project; `vercel --prod` deploys the working
tree explicitly. Scheduled publishing runs on the cron defined in
`vercel.json` (daily at 03:00 UTC — the maximum frequency on the current
Hobby plan, so scheduled posts can go out up to ~24h late; a paid plan
unlocks sub-daily schedules).
