# Auth

Better Auth with the Prisma adapter (`src/lib/auth.ts`), mounted at
`/api/auth/[...all]` (`src/app/api/auth/[...all]/route.ts`).

## Methods

- **Email OTP (current signup/login)**: 6-digit code, 10-minute expiry,
  hashed at rest (`Verification` table via the Better Auth `emailOTP`
  plugin, `storeOTP: "hashed"`), 5 attempts per code (single-use, replay
  rejected), resend cooldown 60s + 5/hour (`AbuseRateBucket`, fail-open).
  Signup (`email-verification` OTP) creates the `User` first
  (`onboardingCompleted: false`), then sends the code; login (`sign-in`
  OTP) only ever authenticates an existing `User` — `disableSignUp: true`
  makes creation through the sign-in path impossible. Unknown emails get
  the same neutral success (no enumeration oracle). Password stays
  optional: password users sign in with password or code, passwordless
  users with code; `Settings` gains/loses the credential row via the
  existing set/change-password endpoints.
- **Onboarding gate**: new users complete name + plan
  (`POST /api/onboarding`, server-side `User.selectedPlan` intent) before
  `/dashboard` / `/billing` / `/settings`; unfinished sessions resume
  there via `/post-auth`. Pre-existing verified users (incl. the admin)
  were backfilled to `onboardingCompleted: true`.
- **Email/password**: enabled, 8–128 chars, `requireEmailVerification: true`.
  Verification mail via Resend (`sendVerificationEmail`), 1h expiry,
  `sendOnSignUp` + `sendOnSignIn`, auto sign-in after verification.
- **Google OAuth**: the only social provider (`GOOGLE_CLIENT_ID/SECRET`),
  `accountLinking.trustedProviders: ["google"]` — first Google sign-in with
  a matching verified email links to the existing `User` automatically.
- **No passwords for OAuth users**: `Account.password` stays null; never
  create a `credential` row for a Google-only account.

## Sessions

Cookie sessions (`Session.token`). Helpers: `getSessionUser()` (nullable),
`requireUser()` (RSC redirect to `/login`), `getApiUser()` (API alias —
there is no API-token path). Logout is client `authClient.signOut()`.
`trustedOrigins`: localhost, `postvia.online`, `www`, `https://*.vercel.app`
(+ local-dev extras from `BETTER_AUTH_TRUSTED_ORIGINS`, unset everywhere
except local machines — see `docs/local-social-dev.md`).
`baseURL` is dynamic (`allowedHosts`: `postvia.online`, `www`, `*.vercel.app`,
`localhost:3000` + the same extras as hosts, fallback = production
resolution): each environment keeps its own hostname, so Preview auth never
escapes to Production (a static string or the shared `BETTER_AUTH_URL` would
pin every env to `postvia.online` and break Preview OAuth with
`state_mismatch`).

## Abuse hooks (non-enforcing by design)

`databaseHooks` only *record* signals, best-effort (failures logged, auth
never breaks): disposable-email refusal on create/update (`return false`
aborts), `trackNewUser`/`trackEmailChange` (email signals, with old-address
release), `trackGoogleLink` (Google-sub signal). Enforcement lives on
`POST /api/posts` and the OAuth connect callbacks.

## Email verification & resend

`POST /api/auth/resend-verification` validates the address, then applies a
persistent per-email bucket (`resend`, 3 per 15 min, fail-open) before
`auth.api.sendVerificationEmail`. Missing `RESEND_API_KEY` throws in
production, silently skips elsewhere.

## Admin

There is **no role column and no admin flag** in the database. Admins are
defined by the server-side `ADMIN_EMAILS` allowlist
(`isAdminEmail()` in `src/lib/entitlements.ts`, case-insensitive CSV).
Admin-only surfaces: `/billing` admin panel, `POST /api/billing/change`,
`POST /api/billing/cancel`, `GET/POST/DELETE /api/admin/billing-override`
(all 403 for non-admins). Admins additionally get the `BillingTestOverride`
sandbox (`BYPASS` unlimited or `ENFORCEMENT` of a chosen plan) — ordinary
users can never activate it.

## Account deletion

`DELETE /api/settings/account` (confirmation phrase `delete`): revokes
provider tokens (best-effort), deletes blobs, then one `$transaction`
removes targets/media/posts/social accounts/sessions/auth accounts/
preferences **plus** abuse tombstones (email/Google/social hashes with the
identity id), then the `User`. Abuse history and consumed Free value
survive via tombstones + the identity ledger.
