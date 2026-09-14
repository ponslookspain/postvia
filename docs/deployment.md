# Deployment

## Vercel

Linked project `postvia` (`prj_lSgzDjL7hwEKoaP9z6tNAcg7yno4`, `.vercel/project.json`).
Pushing to `main` deploys via the linked project; `vercel --prod` deploys
the working tree explicitly. Never force-push, never change the remote,
never create a second production project, never change the production
domain. Production env vars live in Vercel (per-environment Stripe keys);
`ADMIN_EMAILS` must contain the operator address there.

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

Never: `migrate reset`, destructive SQL, touching other databases,
deleting the Neon project. Production data changes go through app flows
or keyed `WHERE` statements only.

## Build & release checklist

Local gates: `npx prisma validate` → `npx prisma generate` →
`npx tsc --noEmit` → `npm test` → `npm run test:pg` (isolated PG, never
production) → `npm run build`. Release flow (branches, Preview, PR,
merge, Production, OpenCode stop-rule): [`docs/workflow.md`](workflow.md).
`vercel --prod` is not part of the normal cycle — Production comes from
`main` after an approved PR merge. Never force-push, never change the
remote.

## Rollback

Vercel: instant rollback to a previous deployment in the dashboard.
Database: schema changes are additive-only by policy; data fixes use
targeted statements, never resets.

## Post-deploy smoke (no permanent test data)

`GET /api/health` (200 + `{ok:true,db:"ok"}`) → Homepage → login
(Google) → admin surfaces → DB connectivity (dashboard loads usage) →
`POST /api/posts` draft → OAuth initiation URL per provider → billing
page → delete any probe data.

Cron note (paid-plan requirement): the Hobby plan allows a single daily
cron (`0 3 * * *`), so scheduled posts can publish up to ~24h after the
selected time. Sub-daily scheduling needs a paid Vercel plan — no code
workaround is attempted. The composer and Terms state this honestly.
