# PostVia

Publish to social media in one place. Postvia lets you write once, preview per
platform, and publish (or schedule) to every connected social profile.

Docs: [`docs/`](docs/) (architecture, database, auth, [auth UI](docs/auth-ui.md),
social integrations,
posting, billing, [abuse protection](docs/abuse-protection.md), environment,
deployment, [workflow](docs/workflow.md), security, development). The code
is the source of truth; docs mirror it.

## Your workflow (local-first, agent-driven)

You don't write code by hand. You sit in the project directory and drive
an AI coding agent — **OpenCode** (`opencode`) or **Claude Code**
(`claude`), either one, same rules for both — through the loop below.
Full process contract, including exactly what the agent may and may not
do on its own: [`docs/workflow.md`](docs/workflow.md).

```
you describe the task
  → agent edits code
  → agent runs checks locally (typecheck/lint/test/build) and fixes red ones
  → you look at it in the browser
  → agent commits + pushes `dev`  (builds NOTHING on Vercel — no Preview)
  → agent STOPS and reports
  → you open the GitHub PR (dev → main), review, click Merge
  → merging main auto-deploys postvia.online — no other step
```

### One-time setup

```bash
npm install
npx prisma generate
cp .env.example .env.local   # fill in values — template + notes in
                              # docs/environment.md. Never commit .env.local.
npx prisma db push           # empty/dev databases only — never production
```

### Every day: running it locally

```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) — the app always runs
here. That's it for anything that isn't OAuth/social.

**Only when you need to test a real login/social connection** (X,
Threads, TikTok, Instagram — providers that redirect back to a public
HTTPS URL, which `localhost` isn't), open a second terminal:
```bash
npm run dev:tunnel   # ngrok http 3000 — the ngrok CLI must be installed
                      # and the agent running
```
This proxies a permanent HTTPS address, `https://<NGROK_HOST>` (the exact
hostname is in `.env.local` as `BETTER_AUTH_URL` — see
[`docs/local-development.md`](docs/local-development.md)), through to
your `localhost:3000`. Providers call back to that public URL, ngrok
forwards it to your machine. It is **never** Production — just a
tunnel into your own laptop. Full social-testing guide:
[`docs/local-social-dev.md`](docs/local-social-dev.md).

### Branches

- Everyday work happens **on `dev`** — the same branch every session, not
  a fresh one per task. The agent only cuts a separate `feature/*` /
  `fix/*` / `staging/*` branch when a change genuinely needs isolating.
- **`main` is Production.** Nobody commits to it directly; it only ever
  receives a merge from a reviewed Pull Request, and that merge is itself
  the release.

### Commit → push → PR → merge

The agent does the first two for you; you do the last two:

```bash
git status              # see what changed, sanity-check it
git add -A
git commit -m "short description of what changed"
git push                # pushes dev — builds nothing on Vercel (no Preview)
```

- **The agent stops right after the push** and hands you a report — it
  never opens or merges a Pull Request, and never touches `main`, without
  you explicitly telling it to.
- Open the Pull Request it points you to (`dev → main`, link printed by
  `git push` / shown in the report), read the diff, click **Merge** when
  happy.
- That merge is the release: `postvia.online` redeploys automatically,
  no extra step, no CLI command.
- Bug after merge? Same loop again: task → agent fixes → checks → commit
  → push → new PR → review → merge.

### Checks before every commit

The agent already runs these and fixes failures before it hands things
back to you; run them yourself if you ever commit by hand:

```bash
npx prisma validate
npx prisma generate
npm run typecheck
npm run lint
npm test
npm run build
```

## Stack

- **Framework:** Next.js 16 (App Router, RSC), React 19, TypeScript
- **Styling:** Tailwind CSS v4, PostVIA primitives on Radix UI
  (behavior/accessibility layer), Lucide icons, Inter body + DM Sans headings
  (`--font-sans` / `--font-heading`; Geist variables retained, not primary),
  dark theme by default with a light opt-in
- **Database:** PostgreSQL via Prisma 6
- **Auth:** Better Auth — email/password, Google OAuth, email verification
  (Resend)
- **Media:** Vercel Blob (private store, presigned uploads, webhook
  registration)
- **Scheduling:** Vercel Cron (`/api/cron/publish-scheduled`)

## Social platforms

Implemented and connectable via OAuth: **Threads, X, TikTok, Instagram**.
`Facebook`, `LinkedIn`, `YouTube`, `Pinterest` exist in the Prisma enum but
are not implemented yet. Platform behavior is capability-driven from the
single registry (`src/lib/platforms/capabilities.ts` +
`src/lib/platforms/overrides.ts` + `src/lib/platforms/providers.ts`:
dispatch table, derived UI lists, display order); validation and preview
rules read that registry (see `docs/social-integrations.md`). Current media support: Threads — text / 1 image / 1 video;
X — text / up to 4 photos / 1 GIF / 1 video; TikTok — 1 video or 1–4 photos
(JPEG/WebP; global post text is the default caption, with optional
per-target title/description overrides); Instagram — 1 JPEG photo or 1 MP4 Reel.
See [`docs/social-integrations.md`](docs/social-integrations.md) for the
full matrix, retry/idempotency semantics, and portal requirements.

## App structure

- `/dashboard` — opens with one sentence about where things stand, then
  in order of what can be acted on: Needs a look (failed / still
  publishing), alerts without a block of their own (dead connection, plan
  running out), Next up (the focal block — countdown, time, channel and
  the post itself), recent posts with search (`?q=`) and status filter
  (`?status=`), channels, a quiet plan row, and activity charts that
  appear only once there is history worth charting; onboarding empty
  state for new users
- `/posts` — post list with `?status=` filter (All / Draft / Scheduled /
  Publishing / Published / Partially published / Failed)
- `/calendar` — visual content calendar (month grid, per-day posts with
  status/platform/media preview, drag & drop rescheduling via the posts
  API, unscheduled drafts panel, viewer-timezone bucketing)
- `/posts/new` — multi-target composer: global text with per-account
  overrides (TikTok uses global post text as the default caption, with
  optional per-target title/description overrides), platform switcher with a single platform-aware preview (X/Threads/Instagram/TikTok
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
- `/login`, `/signup`, `/verify-otp`, `/onboarding` — email OTP auth
  (6-digit code; password optional; Google via `/post-auth`), `/verify-email`
  — legacy verification-link fallback
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

## Billing / Plans

- Plans: Free (€0), Growth (€20), Scale (€50). Single source of truth:
  `src/lib/plans.ts` (prices, features, entitlements) — never duplicated.
- Limits: Free `{1 account total, 15 posts/month, no bulk}`,
  Growth `{5 accounts total, 300/month, 10-video bulk}`, Scale `{unlimited
  accounts/posts, 10-video bulk}`. Media limits stay global. Monthly quota
  counts created posts via an atomic ledger (`PostUsage`) — deleting a post
  never refills it, and concurrent creates on the last slot grant one
  winner. Bulk batches attest their size server-side per item.
- New users pick a plan during onboarding (Free → dashboard, paid →
  `/billing` for checkout); the choice is stored server-side
  (`User.selectedPlan`, never localStorage/`?plan=`). No `Subscription` row → active Free.
- Data: `Subscription` row per user (plan, status, period end,
  cancel-at-periodEnd, Stripe fields reserved). No row → active Free.
- Downgrades and expirations never delete data; only new actions are gated.
- Enforcement lives in `src/lib/entitlements.ts` and is applied
  server-side: `POST /api/posts` (monthly quota → 403 `UPGRADE_REQUIRED`),
  OAuth callbacks (global total account quota, reconnects exempt), retry +
  reschedule PATCH, calendar page, bulk (plan cap + quota pre-check, with
  per-post server backstop). UI only reflects denials.
- Test-mode billing API: `POST /api/billing/change` and
  `POST /api/billing/cancel` are admin-only testing tools (403 for ordinary
  users). Real plan changes go through Stripe: `POST /api/billing/checkout`
  (Growth/Scale Checkout), `POST /api/billing/portal` (Customer Portal for
  plan changes and cancellation), and `POST /api/billing/webhook` (verified
  Stripe subscription events are the only authoritative writer of paid
  `Subscription` state — ordered, mismatch- and ownership-guarded,
  idempotent via `StripeEvent`; invoice events are telemetry only, and
  `GET /billing?checkout=success` reconciles once through the same guards).
  No Stripe, no charges without `STRIPE_SECRET_KEY`.
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

## Anti-abuse (Free multi-account protection)

Free monthly value belongs to an `AbuseIdentity`, not to a `User`: shared
email/Google/social signals resolve to one identity with one shared ledger,
so new accounts, re-registrations and re-links never mint fresh quota.
`POST /api/posts` runs resolve + identity claim + per-user claim + insert
in a single transaction (no phantom quota, one last-slot winner); merges
preserve max risk and conserve usage; device/IP stay secondary signals.
Paid plans and the admin bypass never touch the Free ledger. Details,
invariants and the fail-open/fail-closed matrix:
[`docs/abuse-protection.md`](docs/abuse-protection.md).

## Design system

- CSS-variable tokens (`src/app/globals.css`), semantic colors only, no
  hardcoded palette values.
- **Dark by default, light opt-in.** The theme class is set on `<html>`
  before first paint (`src/hooks/use-theme.ts`), persists in
  `localStorage` and is switched from Appearance in the account menu.
- **PostVIA Blue brand hue** for primary actions, kept distinct from the
  error red; the scheduled state uses info blue so routine work never
  looks like an alert.
- **Blocks carry no outline:** a tile is `--panel`, one shade off the
  page; a block nested inside a tile goes inset (`bg-background`). List rows are
  rounded surfaces separated by spacing, not hairline bands.
- Shared components (`src/components`): `PageHeader`, `StatusBadge`,
  `AuthShell`, `MobileTopBar`, `PageContainer` (page-width tokens
  `--page-narrow/default/wide`), plus PostVIA primitives in
  `src/components/ui` (Radix UI as the behavior/accessibility layer) and
  PostVIA custom components
  (`Field` forms, `Toast` notifications).
- Conventions: `FieldGroup` + `Field` forms with `data-invalid` /
  `aria-invalid`, `Card` sections with full header composition, `Alert` for
  callouts, `Empty`/`StateBlock` for empty/error/loading states, custom
  `Toast` (not `alert()`), `gap-*` utilities (no `space-*`), `size-*` for
  square elements, `cn()` for conditionals, Lucide icons with `data-icon`
  inside buttons.
- Responsive: sidebar on desktop + top bar navigation on mobile
  (`MobileTopBar`, `MobileComposerBar` with safe-area padding).
- Full contract: [`docs/design-system.md`](docs/design-system.md).

## Scripts

```bash
npm run dev        # start dev server (http://localhost:3000), webpack —
                   # see docs/local-development.md for why not Turbopack
npm run dev:local  # same, explicit local-only dev server
npm run dev:tunnel # ngrok http 3000 (permanent dev HTTPS for OAuth
                   # callbacks; needs the `ngrok` CLI)
npm run build      # prisma generate + next build
npm run start      # start production server
npm run lint       # eslint
npm run typecheck  # tsc --noEmit
npm test           # node --test suite (unit tests, fake stores)
npm run test:pg    # real-PostgreSQL concurrency suite —
                   # needs PG_INTEGRATION=1 + isolated test DB, never prod
```

Canonical local guide (env, ngrok, DB, Blob, OAuth, smoke tests):
[`docs/local-development.md`](docs/local-development.md).

## Vercel: release platform, not a preview environment

Vercel only ever builds two things for this repo: nothing (on a `dev`
push — no Preview, by policy) and Production (on a merge to `main`).
That policy lives in the Vercel Project's dashboard settings, outside
this repository — the code and docs describe it but cannot change it:
Production Branch = `main` (auto-deploys on merge), non-production
branches skipped (no Preview builds). See
[`docs/deployment.md`](docs/deployment.md).

Full process contract (what the agent may/may not do, the "ship it"
confirmation rule, environment variables): [`docs/workflow.md`](docs/workflow.md).
Scheduled publishing runs on the cron defined in `vercel.json` (daily at
03:00 UTC — the maximum frequency on the current Hobby plan, so scheduled
posts can go out up to ~24h late; a paid plan unlocks sub-daily
schedules).
