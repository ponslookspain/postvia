# Auth UI

Screen-by-screen reference for the current signup / OTP / onboarding /
login UI. This file mirrors the implementation (`src/app/signup`,
`src/app/verify-otp`, `src/app/onboarding`, `src/app/post-auth`,
`src/app/login`, `src/components/GoogleButton.tsx`); auth mechanics live
in [`docs/auth.md`](auth.md), process in [`docs/workflow.md`](workflow.md).

All auth screens share `AuthShell`: centered `max-w-sm` column, `postvia`
wordmark, `h1` title + muted description.

## Signup — `/signup`

`SignupForm` (`src/app/signup/SignupForm.tsx`), plan hint from `?plan=`
(`src/app/signup/page.tsx` → `parsePlanParam`).

- Title `Create your account`, description `Enter your email to get started`.
- Single field: `Email` (`type=email`, `required`, `autoComplete=email`).
- Button `Continue` → `Sending code...` while submitting. **No password
  field on this screen.**
- Submit: `POST /api/auth/otp/request` `{ email, mode: "signup", plan }`,
  then `router.push("/verify-otp?email=…&mode=signup")`. Server errors
  render as a destructive `Something went wrong` alert.
- Legal notice directly under the button (`aria-describedby="signup-legal"`):
  `By continuing, you agree to Postvia's Terms of Service and Privacy Policy.`
  (`/terms`, `/privacy`, existing pages — no duplicates).
- `or` separator → `GoogleButton` → `Already have an account? Sign in`
  (`/login`).

## OTP — `/verify-otp?email=…&mode=signup|login`

`VerifyOtpForm` (`src/app/verify-otp/VerifyOtpForm.tsx`). The page
(`page.tsx`) takes `email`/`mode` from search params and redirects to
`/signup` (or `/login`) when the email is missing/invalid.

- Title `Check your email`, description
  `We sent a 6-digit code to ${email}. Enter it below.`
- Field `6-digit code` (`inputMode=numeric`,
  `autoComplete=one-time-code`, placeholder `123456`; spaces/dashes are
  stripped before verify).
- Submit button: `Verify & continue` (signup) / `Sign in` (login), then
  `Verifying...`. Signup verifies via `authClient.emailOtp.verifyEmail`,
  login via `authClient.signIn.emailOtp`; both push to `/post-auth` on
  success. Login OTP never creates a `User` (`disableSignUp`, see
  `docs/auth.md`).
- `Resend code` (outline, `Sending...` while busy) re-posts
  `/api/auth/otp/request` with the same mode; success shows a `Code sent`
  alert (`New code sent. Check your inbox.`), cooldown/limit failures
  surface the server message.
- Error mapping (`Verification failed` alert): expired → request a new
  code; too many attempts → request a new code; invalid → check the email;
  unknown account → start over.
- `Wrong email? Start over` links back to `/signup` or `/login`.
- Code policy (enforced server-side, `src/lib/otp-config.ts`): 6 digits,
  10-minute TTL, 5 attempts per code, hashed storage, single-use (replay
  rejected), 60s resend cooldown + 5 sends/hour, outer 20 verifies/10min
  shell (`POST /api/auth/otp/pre-verify`, fail-open).

## Onboarding — `/onboarding`

`OnboardingForm` (`src/app/onboarding/OnboardingForm.tsx`); the page
prefills the name for Google signups and bounces finished users to
`/dashboard`. Guarded surfaces (`/dashboard`, `/billing`, `/settings`)
redirect here while `User.onboardingCompleted` is false.

- Title `Welcome to Postvia`, description
  `Tell us your name and pick a plan to finish setup`.
- Field `Your name` (required, `maxLength=50`).
- `Choose your plan` radiogroup from `PLANS` (`src/lib/plans.ts`):
  Free (`15 posts per month · 1 account`, `Free`, `— free forever`),
  Growth (`300 posts per month · 5 accounts`, `€20/mo`),
  Scale (`Unlimited posts and accounts`, `€50/mo`); default `free`.
- Submit button: `Continue as free` / `Continue with Growth|Scale`
  (`Saving...` while busy); hint under it: free →
  `You can upgrade anytime from Billing.`, paid →
  `You will be taken to secure checkout next. No charge until you confirm.`
- Submit: `POST /api/onboarding` `{ name, plan }`. The server writes
  `name`, `onboardingCompleted: true`, and `selectedPlan`
  (**authoritative server-side intent — never localStorage or `?plan=`**),
  then returns `{ next }`; the client pushes `/dashboard` (free) or
  `/billing` (paid). Errors render as `Something went wrong`.

## Post-auth — `/post-auth`

Server component, no visible UI: single routing decision after email OTP,
password login, and Google OAuth (`src/app/post-auth/page.tsx` →
`postAuthTarget()` in `src/lib/onboarding.ts`).

- Signed out → `/login`.
- `onboardingCompleted: false` (new users, abandoned onboardings) →
  `/onboarding`. Admin always passes.
- Completed + paid `selectedPlan` without an active paid subscription →
  `/billing`; everyone else → `/dashboard`.

## Login — `/login`

`LoginForm` (`src/app/login/LoginForm.tsx`): title `Sign in to postvia`,
description `Publish to social media in one place`.

- Password user: `Email` + `Password` (`autoComplete=current-password`) →
  `Sign in` (`Signing in...`) → `authClient.signIn.email` → `/post-auth`
  → dashboard. Failures render `Sign-in failed`; unverified legacy
  accounts get the `Email not verified` alert with the link-flow resend.
- Code login: `Sign in with a code` (outline, needs the email field first;
  `Sending code...` while busy) → `POST /api/auth/otp/request`
  `{ mode: "login" }` (neutral for unknown emails) →
  `/verify-otp?mode=login` → OTP → dashboard. Hint under it:
  `No password yet? Use Sign in with a code — we will email you a 6-digit code.`
  Passwordless users log in exactly this way; login OTP never mints a User.
- `or` separator → `GoogleButton` → `Don't have an account? Sign up`
  (`/signup`) → `Terms of Service · Privacy Policy` links.
- Preserved query flags: `?deleted=1` (`Your account has been deleted.`),
  `?passwordChanged=1`, `?error=account_not_linked` (Google-oauth notice).

## Google button

`GoogleButton` (`src/components/GoogleButton.tsx`): outline button
`Continue with Google` (`Redirecting...` while busy, inline error text).
Both `callbackURL` and `newUserCallbackURL` default to `/post-auth`, so
new Google users land in onboarding (name prefilled) and existing users
in the dashboard. No plan or secret data passes through the client.

## Settings (auth-related UI)

`SettingsClient` (`src/app/settings/SettingsClient.tsx`): read-only
badges `Email and password: Connected|Not set`, `Google: Connected|Not
connected`; email field read-only (change unsupported).

- No password yet → `Set password` (new + confirm only) → success
  `Password set. You can now sign in with email and password.` + list
  refresh.
- Password set → `Change password` (current + new + confirm, ≥8 chars,
  match) → success `Password changed. Other sessions have been signed out.`
  (`revokeOtherSessions: true` server-side).
- Failures render `Something went wrong` with the server message.

## Flow diagram

```
New user:
  /signup → /verify-otp → /onboarding → Free → /dashboard
                                       ↘ Paid → /billing → /dashboard

Existing password user:
  /login → Password → /post-auth → /dashboard

Password user by code:
  /login → Sign in with a code → /verify-otp → /post-auth → /dashboard

Passwordless user:
  /login → Sign in with a code → /verify-otp → /post-auth → /dashboard

Google:
  Continue with Google → callback → /post-auth → /onboarding | /dashboard
```

## UX principles (as implemented)

- Email-first: signup asks only for the email; password is never part of
  signup and stays optional afterwards.
- OTP is the primary signup verification; legal notice sits on the
  signup screen under Continue.
- Google is the alternative sign-in on both entry screens.
- Onboarding (identity + plan) is separate from authentication and gated
  server-side; plan selection happens after verification.
- `/dashboard`, `/billing`, `/settings` require a finished onboarding.

See also: [`docs/auth.md`](auth.md) (mechanics),
[`docs/workflow.md`](workflow.md) (process),
[`docs/environment.md`](environment.md) (env presence),
[`docs/deployment.md`](deployment.md) (release).
