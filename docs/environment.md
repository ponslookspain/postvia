# Environment variables

Never commit real values. Sources checked: `src/**`, `prisma/schema.prisma`,
`src/lib/*.client config`, `.env.example`. `(src)` = read in app code.

| Variable | Scope | Required | Env | Purpose | Security notes |
|---|---|---|---|---|---|
| `DATABASE_URL_POSTGRES_PRISMA_URL` | server-only | yes | all | Prisma datasource (Neon pooled URL) | Never leaves the server; never `NEXT_PUBLIC_` |
| `BETTER_AUTH_SECRET` | server-only | yes | all | Better Auth signing secret (src) | Session/cookie signing; never exposed |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | server-only | yes (auth) | all | Google OAuth (src) | Secret stays server-side |
| `ADMIN_EMAILS` | server-only | no | prod | Admin allowlist CSV, `isAdminEmail` (src) | Decides admin; checked server-side only |
| `ABUSE_HASH_PEPPER` | server-only | prod yes | prod | Identity/rate hash pepper; missing ⇒ fail-closed (src) | Never logged; hashes only |
| `ABUSE_ENFORCEMENT` | server-only | no | all | `enforce` = deny, else observe; `off` = fully disabled (src). Default: observe | Production must be `enforce` |
| `RESEND_API_KEY` | server-only | prod yes | prod | Verification mail; missing ⇒ throw prod / skip dev (src) | Never `NEXT_PUBLIC_` (see `src/lib/email.ts`) |
| `EMAIL_FROM` / `EMAIL_REPLY_TO` | server-only | no | all | Sender overrides, default `hello@postvia.online` (src) | Non-secret config |
| `X_CLIENT_ID` / `X_CLIENT_SECRET` / `X_REDIRECT_URI` | server-only | yes (X) | all | X OAuth + PKCE (src) | Secret stays server-side |
| `THREADS_APP_ID` / `THREADS_APP_SECRET` / `THREADS_REDIRECT_URI` | server-only | yes (Threads) | all | Threads OAuth (src) | Secret stays server-side |
| `TIKTOK_CLIENT_KEY` / `TIKTOK_CLIENT_SECRET` / `TIKTOK_REDIRECT_URI` | server-only | yes (TikTok) | all | TikTok OAuth (src) | Secret stays server-side |
| `TIKTOK_BRIDGE_SECRET` | server-only | yes (TikTok bridge) | all | Dedicated HMAC secret for TikTok bridge URLs; required — fail-closed when unset, never falls back to any other secret (src) | Key separation enforced in code |
| `INSTAGRAM_APP_ID` / `INSTAGRAM_APP_SECRET` / `INSTAGRAM_REDIRECT_URI` | server-only | yes (Instagram) | all | Instagram OAuth (src) | Secret stays server-side |
| `STRIPE_SECRET_KEY` | server-only | yes (billing) | per-env | Live keys prod, `sk_test_*` preview (src) | Never reaches browser/API responses |
| `STRIPE_WEBHOOK_SECRET` | server-only | yes (billing) | per-env | Webhook signature (src) | Missing ⇒ webhook fail-closed |
| `STRIPE_PRICE_GROWTH` / `STRIPE_PRICE_SCALE` | server-only | yes (billing) | per-env | Test prices required for test mode (src) | Price IDs are config, resolved server-side |
| `CRON_SECRET` | server-only | prod yes | prod | Cron Bearer auth; missing ⇒ always 401 (src) | Never logged |
| `BLOB_WEBHOOK_PUBLIC_KEY` | server-only | yes (media) | all | Blob webhook verification (src). The SDK refuses presigned URLs without it | Verification key, server-side |
| `VERCEL_BLOB_CALLBACK_URL` | server-only | yes (media) | local only | Overrides the Blob upload-completed webhook target (src reads it via SDK). Set to the ngrok origin locally, otherwise no `Media` rows are created; on Vercel the platform origin applies automatically | Local-only config |
| `BLOB_READ_WRITE_TOKEN` | server-only | yes (media) | local only | Blob credential for local uploads (src). Production gets its store binding from the platform; locally a missing token fails every upload ("No blob credentials found"). Create a Read-Write token in Vercel Dashboard → Storage (prefer a separate dev store) | Local-only secret, never commit |
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` | server + public variant | no | all | Error reporting; missing ⇒ console-only (src) | Public by design (DSN only) |
| `SENTRY_TRACES_SAMPLE_RATE` (+ `NEXT_PUBLIC_` variant) | server + public variant | no | all | Traces (src); default 0.1 prod / 0 dev | Non-secret tuning |
| `SENTRY_AUTH_TOKEN` | server-only (CI/Vercel Secret) | no | Vercel (Secret) | Sourcemap upload + release creation (org `postvia` / project `javascript-nextjs` are pinned in `next.config.ts`); missing ⇒ upload skipped, build stays green | CI-only secret |
| `BETTER_AUTH_URL` | server-only | no | all | Pinned auth base URL (src). Local social-dev: set to the tunnel origin (src fallback + email links + TikTok bridge host) | Config, no secret |
| `BETTER_AUTH_TRUSTED_ORIGINS` | server-only | no | local only | CSV of extra Better Auth origins appended to `allowedHosts`/`trustedOrigins` (src). Never set in Vercel Preview/Production | Local-only |
| `OTP_E2E_DEBUG` / `OTP_DEBUG_TOKEN` | server-only | no | local test only | Plaintext-OTP + gated code reader for local automated E2E (`src/lib/auth.ts`, `/api/auth/otp/debug`). Never set outside local testing; production/preview always hash | Test-only; token is secret |
| `THREADS_POLL_DELAY_MS` / `THREADS_MAX_ATTEMPTS` / `THREADS_TIMEOUT_MS` | server-only | no | all | Threads publish polling tuning (src) | Non-secret tuning |
| `THREADS_VIDEO_POLL_DELAY_MS` / `THREADS_VIDEO_MAX_ATTEMPTS` / `THREADS_VIDEO_TIMEOUT_MS` | server-only | no | all | Threads video publish polling tuning (src) | Non-secret tuning |
| `ALLOW_TEST_CLEANUP` | server-only | no | local test only | Gate for `scripts/cleanup-test-users.ts` | Local-only |
| `PG_INTEGRATION` | server-only | no | local test only | `1` enables `npm run test:pg` against an isolated DB (never production) | Local-only |
| `E2E_BASE` | server-only | no | local test only | Base URL for `scripts/e2e-otp-check.ts` | Local-only |
| `BLOB_STORE_ID` | server-only | no | local scripts | Vercel Blob store used by `scripts/reset-data.ts` | Local scripts only |
| `FUNCTION_MAX_DURATION_MS` | server-only | no | per-env | Wall-clock ceiling (ms) for one function invocation; tick budget derives 70% from it (src). Default `60000` (Vercel Hobby); set higher only on a paid plan | Optional tuning; no CI value needed |
| `SCHEDULE_TICK_CONCURRENCY` | server-only | no | all | How many posts one scheduler tick publishes in parallel (src). Default `4` | Optional tuning; no CI value needed |
| `MEDIA_MAX_VIDEO_SECONDS` | server-only | no | all | Optional outer bound on video length (src). Deliberately unset by default: duration is measured and logged, never used to reject; choosing the limit is a product decision | Optional tuning, unset; no CI value needed |

Vercel-provided (read, never set): `VERCEL_ENV`, `VERCEL_URL`,
`VERCEL_PROJECT_PRODUCTION_URL`. `NODE_ENV` switches dev/prod defaults.
`NEXT_RUNTIME` is branched in Blob code. Local-only: `DATABASE_URL`
(example), `CRON_SECRET` dev value, `VERCEL_OIDC_TOKEN` (CLI auth).
Template with safe placeholders: [`.env.example`](../.env.example).

Adding/changing a Vercel Environment Variable normally needs a new
deployment (or Redeploy) before it applies. Full Local → PR → automatic
Production-from-`main` process: [`docs/workflow.md`](workflow.md).
