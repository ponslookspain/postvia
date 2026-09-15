# PostVia Production Audit Report

Branch: `chore/production-hardening`. Source of truth is the code. Each item lists severity, affected files/flow, why it matters, solution, change risk, and whether it blocks production.

Decision labels: KEEP / OPTIMIZE / REFACTOR / REMOVE / REPLACE / DOCUMENT.

## A. Production blockers

1. **No health endpoint** — SEVERITY: HIGH — `src/app/api/**` (39 routes, none for health). Blocks load-balancer/uptime monitoring and deploy smoke automation. Solution: add `GET /api/health` (liveness + light `SELECT 1`, safe public JSON). Risk: low. **Blocks production: yes (observability).** Decision: OPTIMIZE (add).
2. **No CI** — SEVERITY: HIGH — repo root (no `.github/`). PRs can merge without typecheck/lint/tests/build. Solution: add `.github/workflows/ci.yml` with `npm ci / prisma validate+generate / typecheck / lint / tests / build` plus isolated-PG `test:pg` job and `npm audit`. Risk: low. **Blocks: yes.** Decision: OPTIMIZE (add).
3. **Daily cron vs scheduling promise** — SEVERITY: HIGH — `vercel.json`, `src/lib/scheduling.ts`, `src/app/api/cron/publish-scheduled/route.ts`. Hobby `0 3 * * *` means scheduled posts can publish up to ~24h late. Solution: DOCUMENT paid-plan requirement; keep best-effort overdue/stale recovery; fix UX copy to not promise minute precision. Risk: low (docs + copy only). **Blocks: yes (expectation).** Decision: DOCUMENT.

## B. Security

4. **OAuth callback ownership + duplicate external account** — SEVERITY: HIGH — `src/app/api/auth/*/callback/route.ts`, `src/lib/social-accounts.ts:createSocialAccountRaceSafe`. Current code converges via `@@unique([platform, externalId])` and checks `account_in_use`. KEEP behavior; verify no regression. Risk of change: high if touched. **Blocks: yes if broken.** Decision: KEEP + tests.
5. **TikTok bridge HMAC oracle** — SEVERITY: MEDIUM — `src/app/api/tiktok/media/[id]/route.ts`, `src/lib/tiktok-media-bridge.ts`. Generic 404 avoids oracle — correct. KEEP. Risk: high if touched. Decision: KEEP.
6. **Blob pathname authorization** — SEVERITY: HIGH — `src/lib/media-upload.ts:validateReservedPathname`, `src/app/api/media/**`. Server mints `media/{userId}/{postId}/…`, validates scope on prepare/upload/status. KEEP. Decision: KEEP.
7. **`handleConnect` missing `res.ok` check** — SEVERITY: MEDIUM — `src/app/accounts/AccountsContent.tsx:181`. `await res.json()` without status check can throw/misroute on 500. Solution: check `res.ok`, handle non-JSON, add timeout abort. Risk: low. Decision: REFACTOR.
8. **Stripe webhook must stay authoritative** — SEVERITY: CRITICAL — `src/lib/stripe.ts`, `src/app/billing/page.tsx`, `src/app/api/billing/webhook/route.ts`. Page already reconciles via guarded writer and never grants from `?checkout=success`. KEEP. Decision: KEEP.
9. **Admin gates** — SEVERITY: HIGH — `src/app/api/billing/change|_cancel`, `src/app/api/admin/billing-override`. `isAdminEmail` server-side only. KEEP. Decision: KEEP.

## C. Reliability

10. **Duplicate publish-poll implementations** — SEVERITY: MEDIUM — `src/lib/publish-poll.ts` vs `src/app/posts/[id]/PostDetailClient.tsx:76-98`. Same 2s/330s contract; detail version lacks AbortSignal/progress. Solution: reuse `pollPostSettled` in detail client. Risk: low. Decision: REFACTOR.
11. **Duplicate `waitForMediaRegistration`** — SEVERITY: MEDIUM — `src/app/posts/new/NewPostComposer.tsx:110` vs `src/app/posts/bulk/BulkScheduler.tsx:141`. Verbatim 20s/500ms loops, no abort. Solution: extract `src/lib/media-registration.ts` shared helper with AbortSignal + injected fetch; use in both. Risk: low. Decision: REFACTOR.
12. **No segment `error.tsx`** — SEVERITY: MEDIUM — `src/app/**/error.tsx` missing (only `global-error.tsx`). Server throws bubble to root boundary. Solution: add scoped `error.tsx` for posts/billing/accounts/settings/calendar. Risk: low. Decision: OPTIMIZE.
13. **Bulk run no global abort / unmount leak** — SEVERITY: MEDIUM — `BulkScheduler.tsx` sequential `for...of`. Solution: AbortController + `runningRef` guard (composer already has Cancel). Risk: low. Decision: OPTIMIZE.
14. **Calendar concurrent drops unguarded** — SEVERITY: LOW — `CalendarView.tsx:227`. Single `droppingId`; parallel drops can interleave. Solution: ignore new drops while one is in flight. Risk: low. Decision: OPTIMIZE.
15. **Billing duplicate error blocks** — SEVERITY: LOW — `BillingSection.tsx:356` + `:509` render same `error`. Solution: keep single error surface. Risk: low. Decision: REFACTOR.

## D. Performance

16. **`resolveAbuseIdentity` cost in hot path** — SEVERITY: MEDIUM — `src/lib/abuse.ts`, `src/lib/free-post-kernel.ts`. Multi-round convergence inside post-create tx. Correctness > speed; do not weaken. Solution: DOCUMENT as do-not-touch; micro-opt only if profiled. Decision: KEEP.
17. **Sequential media fetch + long container polling** — SEVERITY: MEDIUM — `src/lib/publish.ts` (X sequential uploads; Threads/Instagram poll up to ~4min holding `maxDuration=300`). Solution: keep polling (provider-required); parallelize only where provider-safe. Decision: KEEP with note.
18. **`router.refresh()` full re-render after every mutation** — SEVERITY: LOW — billing/calendar/row-menu/settings. Simple and correct; targeted invalidation is future work. Decision: KEEP.
19. **Composer derived previews per render** — SEVERITY: LOW — `NewPostComposer.tsx` recomputes preview/validation each render. Small inputs; React Compiler absent so manual memo is optional. Decision: KEEP.
20. **Cron orphan sweep size** — SEVERITY: LOW — `sweepOrphanBlobs` caps (100 removals/2000 scanned) already; best-effort after tick. Decision: KEEP.

## E. Database

21. **Index coverage** — SEVERITY: MEDIUM — `prisma/schema.prisma`. `Post(userId,status)`, `Post(status,scheduledAt)`, `PostTarget(postId/socialAccountId/externalJobId)`, `Media(pathname unique + postId/userId)`, `SocialAccount(userId,platform + uniques)`, `Abuse*(identityId/createdAt/resetAt)` present. No change without query-plan evidence. Decision: KEEP.
22. **`Post.userId` has no cascade** — SEVERITY: MEDIUM — `schema.prisma:382`. Account deletion route deletes posts explicitly in `$transaction` before `user.delete`. KEEP explicit deletion (safer than cascade). Decision: KEEP + DOCUMENT.
23. **Migration discipline (no history, `db push` origin)** — SEVERITY: HIGH — `prisma/migrations/*`, `docs/deployment.md`. Prod uses manual single-statement psql + read-only `migrate diff`. KEEP; never `db push`/`migrate reset` on prod. Decision: KEEP.

## F. Auth

24. **OTP neutral responses + throttling** — SEVERITY: HIGH — `src/app/api/auth/otp/**`, `src/lib/otp.ts`. Neutral `{ok:true}`, disposable-mail block, cooldown/hourly buckets. KEEP. Decision: KEEP.
25. **Onboarding gate server-side** — SEVERITY: MEDIUM — `src/lib/onboarding.ts`, pages redirect server-side. KEEP. Decision: KEEP.

## G. Billing

26. **Checkout/portal redirect allowlist** — SEVERITY: HIGH — `src/lib/stripe-redirect.ts`, `BillingSection.tsx`. `isStripeRedirectUrl` enforced before `window.location.assign`. KEEP. Decision: KEEP.
27. **Duplicate checkout prevention** — SEVERITY: MEDIUM — `src/app/api/billing/checkout/route.ts` (`pg_advisory_xact_lock`, `hasLivePaidStake` → `USE_PORTAL`). KEEP. Decision: KEEP.

## H. Social integrations

28. **Unimplemented providers in enum** — SEVERITY: LOW — `Platform` has FACEBOOK/LINKEDIN/YOUTUBE/PINTEREST with `implemented:false`. Solution: keep enum (non-breaking), hide from UI/docs per launch scope. Decision: DOCUMENT.

## I. Publishing / scheduling

29. **Stale PUBLISHING recovery** — SEVERITY: MEDIUM — `src/lib/scheduling.ts:recoverStalePublishing`, retry route requeue. Resume-job-first with conditional writes — correct. KEEP. Decision: KEEP.
30. **X unschedulable rule** — SEVERITY: LOW — enforced in validation + schedule resolver. KEEP. Decision: KEEP.

## J. Media

31. **Webhook idempotency via `@@unique([pathname])`** — SEVERITY: HIGH — `src/lib/media-upload.ts:registerCompletedUpload`. Duplicate delivery collapses to no-op. KEEP. Decision: KEEP.
32. **Canonical image overwrite at same pathname** — SEVERITY: MEDIUM — availability-first fallback to original. KEEP. Decision: KEEP.

## K. Frontend

33. **Landing all-client + intervals** — SEVERITY: LOW — `src/components/landing/*`. Animation-driven; acceptable. Decision: KEEP.
34. **Accounts `totalLabel` drift hack** — SEVERITY: LOW — `AccountsContent.tsx:242` uses `Math.max(initialTotal, liveTotal)`. Solution: derive from live state directly. Risk: low. Decision: REFACTOR.
35. **Detail poll has no timeout UI / abort** — SEVERITY: LOW — covered by item 10 fix (shared helper surfaces timeout/aborted). Decision: REFACTOR.

## L. Developer experience

36. **No `format`/`coverage` scripts** — SEVERITY: LOW — `package.json`. Not required for launch. Decision: DOCUMENT (do not add tools for tools' sake).

## M. Observability

37. **Sentry scrub + sampling** — SEVERITY: MEDIUM — `src/lib/diagnostics.ts`, `sentry.*.config.ts`, `tests/sentry-scrub.test.ts`. `sendDefaultPii:false`, URL/value scrub. KEEP. Decision: KEEP.
38. **Cron failure visibility** — SEVERITY: MEDIUM — cron route reports via `reportError`; add health + CI smoke. Decision: OPTIMIZE (health/CI).

## N. Dead code / cleanup

39. **`src/lib/rate-limit.ts` in-memory limiter** — SEVERITY: LOW — only used by `tests/auth-ux.test.ts`; abuse-relevant paths use persistent `abuse.ts:rateTake`. It is a documented legacy/ephemeral helper, not production abuse control. Solution: keep file, clarify header comment to prevent misuse. Decision: DOCUMENT (not REMOVE — test + potential ephemeral use).
40. **Duplicate media-policy validators** — SEVERITY: LOW — global `validateMediaInput` vs per-target `validateTargetMedia` vs provider policies. Different layers (input vs per-platform caps). Decision: KEEP.
41. **Duplicate token-refresh pattern (3x)** — SEVERITY: LOW — `ensureFreshXToken/TiktokToken/InstagramToken` share shape but differ in provider APIs/expiry. Consolidation risks subtle bugs. Decision: KEEP.
42. **`cn` package dependency** — SEVERITY: LOW — `package.json` has `cn@0.2.6` re-exported by `src/lib/utils.ts` and imported across ~40 files. Unusual but load-bearing; do not replace during hardening. Decision: KEEP.

## O. Dependency cleanup

43. No unused production dependency found with reference proof in this pass (`@base-ui/react`, `better-auth`, `prisma`, `stripe`, `resend`, `@vercel/blob`, `@sentry/nextjs`, `lucide-react`, `class-variance-authority`, `tw-animate-css` all referenced). `shadcn` CLI is dev-only and correct. Decision: KEEP all; revisit with bundle analysis only if needed.

## P. Legal / privacy

44. **Docs must match tombstone/retention/token behavior** — SEVERITY: MEDIUM — verify Terms/Privacy/account-deletion/cookie claims against `settings/account` route + abuse tombstones + token revocation. Solution: fix docs or code where they diverge. Decision: DOCUMENT.

## Q. Documentation

45. **Env table gaps** — SEVERITY: MEDIUM — `ALLOW_TEST_CLEANUP`, `E2E_BASE`, `PG_INTEGRATION`, `BLOB_STORE_ID`/`VERCEL_OIDC_TOKEN` missing or prose-only. Solution: sync `.env.example` + `docs/environment.md`. **Blocks: no.** Decision: OPTIMIZE.
46. **Cron/launch-scope docs** — SEVERITY: MEDIUM — clarify daily-cron delay + hidden providers. Decision: DOCUMENT.
