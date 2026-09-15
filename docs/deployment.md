# Deployment

## Local development

Primary loop — no Vercel involved:

```bash
npm install
npm run dev          # http://localhost:3000 (main dev server)
npm run dev:tunnel   # ngrok http 3000 → permanent dev HTTPS, only when a
                     # public HTTPS origin is needed (OAuth/integration tests)
```

Local gates before every commit: `npx prisma validate` →
`npx prisma generate` → `npx tsc --noEmit` → `npm test` →
`npm run test:pg` (isolated PG, never production) → `npm run build`.
Social/OAuth integration testing through the tunnel:
[`docs/local-social-dev.md`](local-social-dev.md).

## GitHub / PR flow

```
feature/fix/chore/staging branch → local verification → commit → push
(no Vercel Preview) → GitHub Pull Request → review → merge to main
→ AUTOMATIC Vercel Production
```

- Development happens on `staging/*` / feature / fix / chore branches,
  never directly on `main`.
- A push to a non-production branch must NOT produce any Vercel
  deployment. Preview builds are off by policy, not just optional.
- Merging to `main` IS the release: Vercel automatically builds and
  deploys `main` to Production.

## Production release (automatic from `main`)

Production (`postvia.online`) deploys automatically on every merge to
`main` — no manual step. `vercel --prod` is not part of the normal cycle;
never force-push, never change the remote, never create a second
production project, never change the production domain. Production env
vars live in Vercel (per-environment Stripe keys); `ADMIN_EMAILS` must
contain the operator address there.

**Vercel Git deployment triggers are configured in the Vercel Project
settings, outside the repository.** This repo contains no setting that
enables or disables them (`vercel.json` below holds only the cron
schedule). Required dashboard policy, to be set manually (one time):

1. Settings → Git → **Production Branch = `main`** — merges to `main`
   build and release Production automatically. Verified 2026-09-15 via
   Vercel MCP: the live Production deployment was built from `main`.
2. Settings → Git → **Ignored Build Step** — skip every non-production
   branch so pushes never create Preview deployments. Example command
   (exit 0 = skip the build, exit 1 = build it):
   `bash -c 'test "$VERCEL_GIT_COMMIT_REF" != main'`
   — `main` builds, everything else is skipped. This touches only build
   triggering: Production env vars, domains, cron, and the database are
   unaffected.

Do not claim the repo or docs switch these triggers off by themselves.

Cron: `vercel.json` → `0 3 * * *` → `/api/cron/publish-scheduled`
(once daily — Hobby-plan maximum; scheduled posts can go out up to ~24h
late; sub-daily needs a paid Vercel plan). Authenticated by `CRON_SECRET`.

## Database (Neon, `neondb`, `public` schema)

The database carries **no `_prisma_migrations` history** (created with
`prisma db push`). Do **not** baseline it. Migration discipline:

- Safe production check (read-only):
  `npx prisma migrate diff --from-url <prod-url> --to-schema-datamodel prisma/schema.prisma --script`
  must print `This is an empty migration`.
- `prisma migrate dev` is forbidden against production. `prisma db push`
  is not a migration strategy — use it only for empty/dev databases.
- New schema change: add a proper `prisma/migrations/<name>/migration.sql`,
  verify on an isolated database first, then apply the SQL in a controlled
  way (single-command statements; Prisma prepared statements reject
  multi-command strings) during low traffic.
- Applied production changes (manual psql, **no** `_prisma_migrations`
  rows written, never `migrate deploy` / `db push` against production):
  - 2026-09-13 — `20260913000000_billing_guards`: `ALTER TYPE
    "SubscriptionStatus" ADD VALUE 'UNPAID'` (each statement in its own
    transaction — Postgres forbids `ADD VALUE` inside a transaction block)
    and `ALTER TABLE "Subscription" ADD COLUMN "lastStripeEventCreated"
    INTEGER`. Verified read-only afterwards: enum holds
    `ACTIVE,CANCELED,PAST_DUE,UNPAID`, the column is `integer NULL`, and
    `migrate diff` against production prints an empty migration.
  - Shipped in-repo, apply + verify before relying on them (a missing
    column once caused bare dashboard/create 500s — P2022):
    `20260914000000_otp_onboarding` (`User.onboardingCompleted`,
    `User.selectedPlan` + backfill),
    `20260914000001_post_idempotency_key` (`Post.clientOperationId`
    nullable + unique index; NULLs stay distinct, no backfill needed),
    `20260915000000_batch2_indexes` (planner-only: `Subscription`
    Stripe-id lookups, `Post` user/date ranges, `Account`/`Session`
    user scoping). After applying, re-run the read-only `migrate diff`
    check above — it must print an empty migration.

Never: `migrate reset`, destructive SQL, touching other databases,
deleting the Neon project. Production data changes go through app flows
or keyed `WHERE` statements only.

## Rollback

Vercel: instant rollback to a previous deployment in the dashboard.
Database: schema changes are additive-only by policy; data fixes use
targeted statements, never resets.

## Post-release smoke (after each automatic production deployment, no permanent test data)

`GET /api/health` (200 + `{ok:true,db:"ok"}`) → Homepage → login
(Google) → admin surfaces → DB connectivity (dashboard loads usage) →
`POST /api/posts` draft → OAuth initiation URL per provider → billing
page → delete any probe data.

Cron note (paid-plan requirement): the Hobby plan allows a single daily
cron (`0 3 * * *`), so scheduled posts can publish up to ~24h after the
selected time. Sub-daily scheduling needs a paid Vercel plan — no code
workaround is attempted. The composer and Terms state this honestly.
