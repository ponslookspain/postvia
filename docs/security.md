# Security

Source of truth is always the code. This doc records the security
architecture and the controls future changes must not break. Details live
in [Auth](auth.md), [Billing](billing.md),
[Abuse protection](abuse-protection.md) and [Database](database.md).

## Security model

Trust boundary:

```
Browser (untrusted)
→ Next.js routes (validate input, never trust it)
→ Authentication (`getApiUser` / `requireUser`, `src/lib/auth.ts`)
→ Authorization (owner-scoped Prisma queries, `isAdminEmail`)
→ Business logic + entitlement checks (server-side only)
→ Prisma → PostgreSQL
→ External providers (Stripe, OAuth, Vercel Blob)
```

* **Trusted:** session resolved server-side from cookies via Better Auth;
  Stripe events after `constructEvent` signature verification; live
  `subscriptions.retrieve` snapshots; server env (prices, secrets);
  HMAC/Bearer tokens verified with server-only secrets.
* **Untrusted:** everything from the client — request body/query/headers/
  cookies/URL, `localStorage`, `User.selectedPlan`, success-page URLs,
  client-supplied Stripe IDs, `X-Forwarded-For` (rate bucket only, never
  identity).
* **Authentication** runs per route (`getApiUser` for API,
  `requireUser`/`requireOnboardedUser` for pages). There is no
  `src/middleware.ts` and no global blanket — every new route must add
  its own check.
* **Authorization** runs before every DB read/mutation. **Entitlement
  checks** run server-side from the authoritative state (see Billing).
* **Frontend is never a security boundary.** Hidden buttons, disabled
  plans, client plan state and success pages prove nothing.

## Secrets

Server-only: DB URL, `BETTER_AUTH_SECRET`, OAuth client secrets, Stripe
keys/secrets, `CRON_SECRET`, `TIKTOK_BRIDGE_SECRET`, `RESEND_API_KEY`,
`BLOB_READ_WRITE_TOKEN`, `BLOB_WEBHOOK_PUBLIC_KEY`,
`ABUSE_HASH_PEPPER`, `SENTRY_AUTH_TOKEN`. Nothing secret is imported by
client components; abuse hashes never leave the server. No secrets in git
(`.env`/`.env.local` untracked — verify with `git status` before commit).

Public by design: `NEXT_PUBLIC_SENTRY_DSN` (+ traces variant). Never
prefix a secret with `NEXT_PUBLIC_` — it ships in the browser bundle.
See [Environment](environment.md) for the per-variable scope table.

## Cookies & sessions

Better Auth cookie sessions (`Session.token`, signed
`__Secure-better-auth.session_token`). OAuth state cookies:
`httpOnly, SameSite=Lax, 600s, Secure in prod`. First-party `pv_did`
device id: `HttpOnly, Lax, 1y` — evidence only, never identity. Email
verification is required for password sign-in; OTP codes are hashed
(except local E2E behind triple-gated flags never enabled on Vercel).

## OAuth / CSRF

Per-provider random `state` (+PKCE for X) compared timing-safe on all four
callbacks; single-use state cookies cleared on every exit. Provider `error`
values: TikTok whitelisted to fixed codes; X/Threads/Instagram echo the
provider value into the redirect (no secrets — codes only).

## Authorization

* Every user-owned DB operation is scoped: `findFirst`/`updateMany`/
  `deleteMany` with `where: { id, userId }` (atomic, no
  find-then-act-alone). Helpers enforce their own ownership
  (`authorizeMediaUpload` compares `post.userId`, disconnect routes
  delete with `{ id, userId }`) — security must not depend on which
  caller runs today.
* User A / User B isolation is covered by runtime two-user tests (GET /
  PATCH / DELETE / publish / retry / media / social disconnect all
  403/404 with no data leak) plus unit suites (`social-accounts-multi`,
  `media-upload`, `multi-target`).
* Admin = `ADMIN_EMAILS` allowlist checked server-side on every admin
  handler (`requireAdmin`); client-sent `admin`/`isAdmin` fields are
  ignored. Test overrides live in `BillingTestOverride`, are consulted
  only for admins, and are never written by webhooks.

## Billing security

`Subscription` is the authoritative paid state. Only the verified Stripe
webhook writes it; Checkout/Portal never write plans
(`src/lib/stripe.ts`, `src/lib/billing-live-stores.ts`).

Client values that can NEVER grant paid entitlement on their own:
`selectedPlan`, cookies, `localStorage`, URL/success page, request body
(`plan`, `priceId`, `status`), client-supplied Stripe customer/
subscription/session IDs.

Flow: Checkout (allowlisted plan → server price, no state write) →
Stripe → verified webhook → `Subscription` → server-side entitlement
(`resolveEffectiveFromRows` + `applyPeriodRules` in
`src/lib/entitlements.ts`) → paid feature.

* Webhook: `STRIPE_WEBHOOK_SECRET` required, `stripe-signature`
  verified over the raw body, unknown/missing secret fails closed.
* Idempotency: `StripeEvent.eventId` claimed before processing;
  duplicates ack as no-ops; failures release the claim for Stripe retry.
* Out-of-order: `lastStripeEventCreated` ignores stale events; regressing
  ties re-verify against the live Stripe object.
* Mismatch protection: customer/subscription conflicts fail closed, never
  hijack another user's row; unknown prices grant nothing; `incomplete`/
  `paused` never write; `invoice.*` never writes subscription state.
* Lifecycle: `CANCELED`/`UNPAID` resolve to free entitlements;
  `cancelAtPeriodEnd` without a period end reads as free/expired;
  `reconcileSubscriptionFromStripe` never grants from local data alone.
  See [Billing](billing.md).

## Quota security

Free quota: identity ledger (`AbuseFreeUsage`, one unit per human) +
per-user ledger (`PostUsage`, monotonic, delete never refills), claimed
atomically with the post insert in ONE transaction
(`createFreePostAtomic`, `src/lib/free-post-kernel.ts`).

* **ONE SUCCESSFUL OPERATION = ONE QUOTA UNIT.** Every insert path —
  allow and observe — claims the per-user ledger inside the same
  transaction. Observe mode makes the identity verdict telemetry-only
  but never bypasses the per-user ledger.
* Concurrency: conditional increments (`count < limit`) serialize the
  last unit to exactly one winner; idempotency keys collapse
  double-submits (`clientOperationId` unique + route twin lookup).
* Serialization retry: 40001/40P01/P2034 abort server-side (guaranteed
  rollback), so the idempotent body retries boundedly
  (`FREE_POST_TX_MAX_ATTEMPTS = 3`, desync backoff). Business denials
  (`FreePostDeny`) and idempotency conflicts are never retried.
* Enforce/observe: `ABUSE_ENFORCEMENT=enforce` denies; observe keeps the
  per-user cap exact; `off` disables everything (never production).
  See [Abuse protection](abuse-protection.md).

## Rate limiting

Persistent `AbuseRateBucket` (multi-instance safe): OAuth initiation
30/10 min per IP; OAuth callbacks 60/10 min per IP + 30/10 min per user;
OTP send 5/h per email + 50/h per IP with 60s cooldown; OTP verify
20/10 min per email + 100/10 min per IP; verification resend 3/15 min
per email; writes dual-bucketed
(posts-create 100/h, posts-write 100/h, media-prepare 200/h,
media-upload 200/h, media-status 600/h, publish/retry 60/h,
creator-info 120/h, settings 30/h, onboarding 20/h, account-delete
10/h, checkout/portal 10/h). IP buckets are roomy (NAT-safe) and never
decide identity. Legacy `src/lib/rate-limit.ts` is test-only.

## Internal endpoints

| Endpoint | Auth method | Fail-closed |
|---|---|---|
| `POST /api/billing/webhook` | Stripe signature over raw body | Missing secret → 500; missing/invalid signature → 401 |
| `GET/POST /api/cron/publish-scheduled` | `Bearer CRON_SECRET`, timing-safe | Missing/empty/wrong secret → always 401 |
| Blob `upload-completed` | Ed25519 via `BLOB_WEBHOOK_PUBLIC_KEY` + server-minted `tokenPayload` | Unverified → rejected; rows created only from trusted payload |
| `GET/HEAD /api/tiktok/media/[id]` | HMAC-SHA256 capability URL, dedicated `TIKTOK_BRIDGE_SECRET` | Unset → fail-closed (no fallback to any other secret); bad/expired sig → generic 404 |

## Headers & transport

`Secure` cookies in production; `trustedOrigins` include
`https://*.vercel.app` (broad — narrow if preview abuse appears).
Stripe webhook signatures verified; redirect URLs allow-listed
(`isStripeRedirectUrl`); cron Bearer-checked.

Production-grade headers via `headers()` in `next.config.ts` (all
routes, incl. API): `Content-Security-Policy` (no `unsafe-eval` in
production — `next dev` appends it to `script-src` only, for Turbopack
HMR/React dev eval; shipped bundles never eval — no
wildcard script sources, `frame-ancestors 'none'`; `unsafe-inline`
kept for scripts/styles as required by the static theme init script,
Next.js runtime and Tailwind), `Strict-Transport-Security`
(preload), `X-Content-Type-Options: nosniff`, `Referrer-Policy`
`strict-origin-when-cross-origin`, `Permissions-Policy`
(camera/microphone/geolocation off), `X-Frame-Options: DENY`.
Authenticated payloads use `private`/`no-store` cache directives.

## Logs & Sentry

Single pipeline `reportError(scope, event, error, extra)`: console +
scrubbed Sentry event. Scrubbed: tokens/passwords/cookies/sessions/keys,
OAuth `code/state/verifier`, signed URLs, request cookies, `user → {id}`
only, query strings with sensitive params. OAuth callbacks log presence
flags only.

## Abuse hashing & PII

Only `sha256("1:<pepper>:<namespaced value>")` hashes are stored; raw
emails, Google subs, external ids, IPs and tokens never land in abuse
tables or logs. `ABUSE_HASH_PEPPER` is mandatory in production
(misconfiguration fails closed). See [Abuse protection](abuse-protection.md).

## Admin & production DB

Admin = `ADMIN_EMAILS` allowlist; admin routes 403 otherwise; test
overrides never consulted for non-admins and never written by webhooks.
Production DB rules: read-only checks by default; no resets, no
destructive SQL, no second users, no test data left behind; schema proven
with `migrate diff` (empty), never `migrate dev`/`db push` against prod.

## Security Invariants

1. Client input never grants paid entitlement.
2. Only verified Stripe state changes paid subscription state.
3. Webhooks are signature-verified.
4. Webhooks are idempotent.
5. Replay creates no additional grant.
6. User A never receives User B resources.
7. Normal users never gain admin privileges.
8. Server secrets never reach the browser.
9. `DATABASE_URL` never reaches the client.
10. Cancellation/expiry revokes paid access.
11. Quota operations are atomic (one operation = one unit).
12. Concurrent requests never over-grant.
13. Cron is Bearer-protected.
14. Signed capability endpoints require a valid signature.
15. No user-reachable raw SQL.

## Security Testing

| Test | Expected | Actual | Result |
|---|---|---|---|
| Static audit + Git history secret scan | No secrets in tree/history | Placeholders/dummies only | PASS |
| Client secret exposure (`NEXT_PUBLIC_`, bundles, errors) | Only Sentry DSN public | Confirmed; no sourcemaps shipped | PASS |
| IDOR/BOLA static (all API routes) | Owner-scoped queries | Atomic `where: { id, userId }` everywhere | PASS |
| Two-user runtime (A resources × B session) | 403/404, no leak | 13/13 blocked; A controls 200 | PASS |
| Webhook forgery (missing/invalid signature) | 401 | Runtime 401/401 | PASS |
| Webhook replay / out-of-order | No-op / no regress | Unit suites green | PASS |
| Customer/subscription substitution | Fail closed | Unit suites green | PASS |
| Plan / `selectedPlan` / price manipulation | No grant | Static + `security-hardening` tests | PASS |
| Quota race, 20 concurrent, last unit | Exactly 1 winner | Runtime 1×201 + 19×403, ledger exact | PASS |
| Quota cold-start burst | No over-grant, no 500 storm | Fixed + `quota-coldstart-race` (13 tests) | PASS |
| OTP abuse (rotation, guessing) | Per-email + per-IP caps | Buckets + attempt limits | PASS |
| Cron unauthorized | 401 | Runtime anon/wrong-secret 401 | PASS |
| TikTok bridge signature | Invalid → 404, unset → fail-closed | Runtime + unit | PASS |
| Security headers (`/`, `/login`, `/dashboard`, `/api/health`) | All six present | Runtime verified | PASS |

No exploitable path identified in tested attack surface.

## Known Limitations

* Full Stripe Test Mode lifecycle needs Stripe test credentials; without
  them lifecycle steps are proven per-transition (unit) + negative paths
  (runtime), not end-to-end.
* Production runtime was never tested; staging infrastructure may differ.
* This audit is not a formal penetration-test certification.
* `test:pg` concurrency suites need an isolated Postgres
  (`PG_INTEGRATION=1`); never point them at shared databases.

## Rules for future changes

1. Never trust client input for authorization.
2. Never use frontend state as entitlement source.
3. Never expose server secrets (no `NEXT_PUBLIC_` for secrets).
4. Every user-owned DB operation must enforce ownership atomically.
5. Every paid feature must check server-side entitlement.
6. Every webhook must verify authenticity + idempotency.
7. Every state-changing operation must consider idempotency/races.
8. Never introduce user-controlled raw SQL.
9. Never weaken fail-closed behavior for convenience.
10. Security helpers must enforce their own invariants, not rely on callers.

## Security changelog

* Security headers (CSP/HSTS/nosniff/referrer/permissions/frame-DENY).
* TikTok bridge fail-closed (dedicated secret, no fallback).
* Distributed rate-limit coverage (posts-write, media upload/status,
  creator-info, account-delete) + OTP per-IP protection.
* Media ownership enforced inside the helper; atomic owner-scoped deletes.
* Quota serialization retry (bounded, 3 attempts) + observe-mode quota
  integrity (per-user ledger gates every insert path).
* Regression suites: `tests/security-hardening.test.ts`,
  `tests/quota-coldstart-race.test.ts`.
