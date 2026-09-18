# PostVIA browser E2E (Playwright)

Chromium-only browser suite for real user journeys. It complements (never
replaces) `npm test` (unit/business), `npm run test:pg` (DB races) and
`npm run e2e:otp` (HTTP/DB OTP runner).

## Scope

CI (`e2e` job) covers, each on an isolated `pw-e2e-*@example.com` throwaway user:

- login (password UI), signup OTP UI (1 flow, needs secrets — see below),
  onboarding gate, create post (draft), media upload UI subset,
  schedule dialog + persisted state, calendar render/nav, post details
  (reschedule/delete), accounts UI states, billing safe subset, settings,
  account deletion.

Explicitly NOT in CI: real OAuth round-trips (X/Threads/TikTok/Instagram),
full Blob chain (`prepare → PUT → webhook → Media row`), live Stripe
Checkout/Portal, cron execution. Those are local/manual smoke (below).

## Browser smoke

`tests/e2e/browser-smoke.spec.ts` is the fast fail-fast gate in front of
the journey suite (the CI `e2e` job runs it first; a red smoke stops the
job before the full suite). One throwaway free user (`withFakeAccount`)
covers all 8 routes; no form submits, no Stripe/OAuth/Blob/OTP, no
destructive actions — depth lives in the journey specs below.

- **Public smoke** (logged-out context): `/login` renders 200 + Email
  field; `/dashboard` bounces to `/login` (a redirect is the correct
  outcome and is asserted as such — never mistaken for a dashboard
  render); `/billing` renders its signed-out contract — HTTP 200 with
  "Sign in to view your plan" and a Sign in link, NOT a redirect.
- **Authenticated smoke**: `response.status() === 200` + final URL + one
  stable key-UI anchor per route (`/dashboard`, `/posts`, `/posts/new`,
  `/calendar`, `/accounts`, `/billing`, `/settings`). Dashboard asserts
  structure (Create post / View all links), never greeting copy.
- **Navigation smoke**: real Sidebar clicks
  (Dashboard → Posts → Calendar → Create post → Accounts → Dashboard)
  plus account-menu clicks (Settings, Billing), each followed by
  `toHaveURL`.
- **Runtime policy**: `pageerror` fails the test; `console.error` is only
  captured as a `smoke-console.error` annotation for diagnostics
  (React/Next dev warnings must not make CI flaky).

Run just the smoke locally (same env as the full suite):

```bash
E2E_BASE=http://127.0.0.1:3100 npx playwright test tests/e2e/browser-smoke.spec.ts
```

Headed / debug:

```bash
E2E_BASE=http://127.0.0.1:3100 npx playwright test tests/e2e/browser-smoke.spec.ts --headed
```

## Prerequisites

- Local Postgres (the suite refuses production-like origins; see
  `tests/e2e/helpers/env.ts`). Point `DATABASE_URL_POSTGRES_PRISMA_URL`
  at a throwaway DB and push the schema:
  `npx prisma db push` (never against production).
- `BETTER_AUTH_SECRET` (any 32+ char value locally).
- Browsers: `npx playwright install chromium`.

## Run locally

Ordinary browser E2E (including Browser Smoke and the full suite) runs
with Resend **disabled** — no verification emails are sent and no Resend
API calls are made. `playwright.config.ts` forces `RESEND_API_KEY` to
empty for the server it boots (an explicitly provided ambient key still
passes through for OTP runs, see below). Resend is not needed for these
tests: password signup dev-skips the verification mail when the key is
absent.

```bash
# Self-booted server (mirrors CI): Resend is off by default.
E2E_BASE=http://127.0.0.1:3100 OTP_E2E_DEBUG=1 OTP_DEBUG_TOKEN=<secret> npm run e2e
```

Reused-server variant: `webServer.env` cannot change the environment of
an already running process, so a dev server started separately (e.g.
`npm run dev` on `:3000`) keeps whatever `RESEND_API_KEY` it loaded from
`.env.local`. For ordinary E2E, start it without the key:

```bash
# Terminal 1: dev server with OTP debug enabled, Resend disabled
OTP_E2E_DEBUG=1 OTP_DEBUG_TOKEN=<secret> RESEND_API_KEY= npm run dev

# Terminal 2 (same env + E2E_BASE pointing at terminal 1):
E2E_BASE=http://localhost:3000 OTP_E2E_DEBUG=1 OTP_DEBUG_TOKEN=<secret> npm run e2e
```

Port 3100 variant (mirrors CI):

```bash
OTP_E2E_DEBUG=1 OTP_DEBUG_TOKEN=<secret> RESEND_API_KEY= npx next dev --port 3100
E2E_BASE=http://127.0.0.1:3100 OTP_E2E_DEBUG=1 OTP_DEBUG_TOKEN=<secret> npm run e2e
```

Headed / single spec:

```bash
npm run e2e:headed
npx playwright test tests/e2e/onboarding.spec.ts
```

`playwright.config.ts` also boots `next dev --port 3100` itself when no
server is running (`reuseExistingServer` locally).

## UI OTP note (important)

`POST /api/auth/otp/request` requires a working `RESEND_API_KEY` (OTP never
reports success when nothing is sent — `src/lib/otp.ts`). With a dummy or
absent key `auth.otp.spec.ts` **skips itself** with an explicit message
instead of faking the flow. Full UI OTP coverage then comes from a local run
with a valid dev Resend key. This is intentional and documented, not a gap
to paper over: do not stub the mailer to force it green.

CI behavior: the `e2e` job passes `OTP_DEBUG_TOKEN` and `RESEND_API_KEY`
from GitHub Secrets when present; without them the OTP spec skips and the
rest of the suite still validates.

Explicit OTP run (local only, needs a dev Resend key capable of real
sends — no such verification is possible without one):

```bash
OTP_E2E_DEBUG=1 OTP_DEBUG_TOKEN=<secret> RESEND_API_KEY=re_<dev-key> npx playwright test tests/e2e/auth.otp.spec.ts
```

The ambient key passes through `webServer.env` to the booted server; for
a reused server, start it with the same key in its own environment.
Production email behavior is unchanged.

## Media note

CI asserts only the deterministic subset (file control present, `/prepare`
401/4xx validation, no Blob PUT). The full chain lives in
`posts.media.local.spec.ts`, skipped in CI. Run it locally with a **dev**
Blob store (never production):

```bash
BLOB_READ_WRITE_TOKEN=<dev-store-token> \
VERCEL_BLOB_CALLBACK_URL=<ngrok-origin> \
E2E_BASE=http://localhost:3000 npm run e2e -- tests/e2e/posts.media.local.spec.ts
```

## Billing / OAuth smoke (local/manual)

- Billing real Checkout/Portal: `sk_test_*` + test `STRIPE_PRICE_*`, separate
  test account, test-mode webhook forwarding. Never `sk_live_*`, never
  production webhook secret.
- Social OAuth: `npm run dev:tunnel` (ngrok origin from
  `docs/local-social-dev.md`), provider dev apps, manual connect on
  `/accounts`. CI never drives external providers.

## Cleanup

Every spec deletes its throwaway user via `DELETE /api/settings/account`
(product flow). Leftovers can be inspected/removed with:

```bash
npm run cleanup:test-users:check -- --all-test
ALLOW_TEST_CLEANUP=1 npm run cleanup:test-users -- --email <addr> --confirm DELETE-TEST-USERS
```

## Selectors

Web-first: `getByLabel`/`getByRole`, plus minimal `data-testid` hooks:
`schedule-dialog`, `confirm-schedule`, `disconnect-dialog`,
`confirm-disconnect`, `delete-post-dialog`, `confirm-delete-post`.
No sleeps, no coordinate clicks, no generated class names.
