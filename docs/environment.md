# Environment variables

Never commit real values. Sources checked: `src/**`, `prisma/schema.prisma`,
`src/lib/*.client config`, `.env.example`. `(src)` = read in app code.

| Variable | Required | Env | Purpose | Sensitive |
|---|---|---|---|---|
| `DATABASE_URL_POSTGRES_PRISMA_URL` | yes | all | Prisma datasource (Neon pooled URL) | **yes** |
| `BETTER_AUTH_SECRET` | yes | all | Better Auth signing secret (src) | **yes** |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | yes (auth) | all | Google OAuth (src) | **yes** |
| `ADMIN_EMAILS` | no | prod | Admin allowlist CSV, `isAdminEmail` (src) | no |
| `ABUSE_HASH_PEPPER` | prod yes | prod | Identity/rate hash pepper; missing ⇒ fail-closed (src) | **yes** |
| `ABUSE_ENFORCEMENT` | no | all | `enforce` = deny, else observe; `off` = fully disabled (src). Default: observe | no |
| `RESEND_API_KEY` | prod yes | prod | Verification mail; missing ⇒ throw prod / skip dev (src) | **yes** |
| `EMAIL_FROM` / `EMAIL_REPLY_TO` | no | all | Sender overrides, default `hello@postvia.online` (src) | no |
| `X_CLIENT_ID` / `X_CLIENT_SECRET` / `X_REDIRECT_URI` | yes (X) | all | X OAuth + PKCE (src) | **yes** |
| `THREADS_APP_ID` / `THREADS_APP_SECRET` / `THREADS_REDIRECT_URI` | yes (Threads) | all | Threads OAuth (src) | **yes** |
| `TIKTOK_CLIENT_KEY` / `TIKTOK_CLIENT_SECRET` / `TIKTOK_REDIRECT_URI` | yes (TikTok) | all | TikTok OAuth (src) | **yes** |
| `INSTAGRAM_APP_ID` / `INSTAGRAM_APP_SECRET` / `INSTAGRAM_REDIRECT_URI` | yes (Instagram) | all | Instagram OAuth (src) | **yes** |
| `STRIPE_SECRET_KEY` | yes (billing) | per-env | Live keys prod, `sk_test_*` preview (src) | **yes** |
| `STRIPE_WEBHOOK_SECRET` | yes (billing) | per-env | Webhook signature (src) | **yes** |
| `STRIPE_PRICE_GROWTH` / `STRIPE_PRICE_SCALE` | yes (billing) | per-env | Test prices required for test mode (src) | no |
| `CRON_SECRET` | prod yes | prod | Cron Bearer auth; missing ⇒ always 401 (src) | **yes** |
| `BLOB_WEBHOOK_PUBLIC_KEY` | yes (media) | all | Blob webhook verification (src) | **yes** |
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` | no | all | Error reporting; missing ⇒ console-only (src) | no |
| `SENTRY_TRACES_SAMPLE_RATE` (+ `NEXT_PUBLIC_` variant) | no | all | Traces (src); default 0.1 prod / 0 dev | no |
| `SENTRY_AUTH_TOKEN` | no | Vercel (Secret) | Sourcemap upload + release creation (org `postvia` / project `javascript-nextjs` are pinned in `next.config.ts`); missing ⇒ upload skipped, build stays green | **yes** |
| `BETTER_AUTH_URL` | no | all | Pinned auth base URL (src). Local social-dev: set to the tunnel origin (src fallback + email links + TikTok bridge host) | no |
| `BETTER_AUTH_TRUSTED_ORIGINS` | no | local only | CSV of extra Better Auth origins appended to `allowedHosts`/`trustedOrigins` (src). Never set in Vercel Preview/Production | no |
| `OTP_E2E_DEBUG` / `OTP_DEBUG_TOKEN` | no | local test only | Plaintext-OTP + gated code reader for local automated E2E (`src/lib/auth.ts`, `/api/auth/otp/debug`). Never set outside local testing; production/preview always hash | **yes** |
| `THREADS_POLL_DELAY_MS` / `THREADS_MAX_ATTEMPTS` / `THREADS_TIMEOUT_MS` | no | all | Threads publish polling tuning (src) | no |
| `THREADS_VIDEO_POLL_DELAY_MS` / `THREADS_VIDEO_MAX_ATTEMPTS` / `THREADS_VIDEO_TIMEOUT_MS` | no | all | Threads video publish polling tuning (src) | no |
| `ALLOW_TEST_CLEANUP` | no | local test only | Gate for `scripts/cleanup-test-users.ts` | no |
| `PG_INTEGRATION` | no | local test only | `1` enables `npm run test:pg` against an isolated DB (never production) | no |
| `E2E_BASE` | no | local test only | Base URL for `scripts/e2e-otp-check.ts` | no |
| `BLOB_STORE_ID` | no | local scripts | Vercel Blob store used by `scripts/reset-data.ts` | **yes** |

Vercel-provided (read, never set): `VERCEL_ENV`, `VERCEL_URL`,
`VERCEL_PROJECT_PRODUCTION_URL`. `NODE_ENV` switches dev/prod defaults.
`NEXT_RUNTIME` is branched in Blob code. Local-only: `DATABASE_URL`
(example), `CRON_SECRET` dev value, `VERCEL_OIDC_TOKEN` (CLI auth).
Template with safe placeholders: [`.env.example`](../.env.example).

Adding/changing a Vercel Environment Variable normally needs a new
deployment (or Redeploy) before it applies. Full Local → PR →
manual Production process: [`docs/workflow.md`](workflow.md).
