# Security

## Secrets

Server-only: DB URL, `BETTER_AUTH_SECRET`, OAuth client secrets, Stripe
keys/secrets, `CRON_SECRET`, `RESEND_API_KEY`, `BLOB_WEBHOOK_PUBLIC_KEY`,
`ABUSE_HASH_PEPPER`, `SENTRY_AUTH_TOKEN`. Nothing secret is imported by
client components; abuse hashes never leave the server. No secrets in git
(`.env`/`.env.local` untracked — verify with `git status` before commit).

## Cookies & sessions

Better Auth cookie sessions (`Session.token`). OAuth state cookies:
`httpOnly, SameSite=Lax, 600s, Secure in prod`. First-party `pv_did`
device id: `HttpOnly, Lax, 1y` — evidence only, never identity. No
`src/middleware.ts`: auth is enforced per route (`getApiUser` for API,
`requireUser` for pages) — every new route must add it; there is no
global blanket.

## OAuth / CSRF

Per-provider random `state` (+PKCE for X) compared timing-safe on all four
callbacks; single-use state cookies cleared on every exit. Provider `error`
values: TikTok whitelisted to fixed codes; X/Threads/Instagram echo the
provider value into the redirect (no secrets — codes only).

## Rate limiting

Persistent `AbuseRateBucket` (multi-instance safe): OAuth initiation
30/10 min per IP; OAuth callbacks 60/10 min per IP + 30/10 min per user;
verification resend 3/15 min per email. Exactly-`max` semantics including
expiry races. Legacy `src/lib/rate-limit.ts` is test-only.

## Abuse hashing & PII

Only `sha256("1:<pepper>:<namespaced value>")` hashes are stored; raw
emails, Google subs, external ids, IPs and tokens never land in abuse
tables or logs. `ABUSE_HASH_PEPPER` is mandatory in production
(misconfiguration fails closed). See [Abuse protection](abuse-protection.md).

## Logs & Sentry

Single pipeline `reportError(scope, event, error, extra)`: console +
scrubbed Sentry event. Scrubbed: tokens/passwords/cookies/sessions/keys,
OAuth `code/state/verifier`, signed URLs, request cookies, `user → {id}`
only, query strings with sensitive params. OAuth callbacks log presence
flags only.

## Headers & transport

`Secure` cookies in production; `trustedOrigins` include
`https://*.vercel.app` (broad — narrow if preview abuse appears).
Stripe webhook signatures verified; redirect URLs allow-listed
(`isStripeRedirectUrl`); cron Bearer-checked.

## Admin & production DB

Admin = `ADMIN_EMAILS` allowlist; admin routes 403 otherwise; test
overrides never consulted for non-admins and never written by webhooks.
Production DB rules: read-only checks by default; no resets, no
destructive SQL, no second users, no test data left behind; schema proven
with `migrate diff` (empty), never `migrate dev`/`db push` against prod.
