# PostVia documentation

Source of truth is always the code. These docs describe the implementation
as of the current tree; if anything disagrees with the code, the code wins.

- [Architecture](architecture.md) — layers, modules, data flows, transaction boundaries
- [Database](database.md) — Prisma models, relations, constraints, deletion behavior
- [Auth](auth.md) — Better Auth, sessions, Google, admin detection
- [Social integrations](social-integrations.md) — X / Threads / TikTok / Instagram OAuth + publishing
- [Posting & scheduling](posting.md) — composer, publish pipeline, cron, retries, media
- [Billing](billing.md) — plans, Stripe, webhooks, entitlements, test overrides
- [Abuse protection](abuse-protection.md) — threat model, identity, quota, risk, concurrency
- [Environment](environment.md) — every env variable, required/sensitive/default
- [Deployment](deployment.md) — Vercel, Neon, migrations, rollback, smoke tests
- [Security](security.md) — secrets, cookies, CSRF, rate limiting, PII, admin, DB
- [Development](development.md) — local setup, scripts, testing
- [Auth UI](auth-ui.md) — signup, OTP, onboarding, login, Google, settings screens
- [Local development](local-development.md) — canonical env, ngrok, DB, Blob, OAuth, smoke tests
- [Local social development](local-social-dev.md) — real-account social/OAuth testing flow
- [Workflow](workflow.md) — development/release process contract
- [Design system](design-system.md) — implemented visual language: themes, tokens, surfaces, rows, voice
- [Radian design contract (historical)](postvia-radian-design-contract.md) — reasoning behind the shadcn → Radian migration; superseded by the design system, do not quote as current rules
- [Audit report (archived 2026-09-15)](audit-report.md) — historical hardening findings (A–Q); resolved items marked `RESOLVED` inline, the rest not re-verified — do not quote as current issues
