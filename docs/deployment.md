# Deployment

## Local development

Primary loop — no Vercel involved:

```bash
npm install
npm run dev          # http://localhost:3000 (main dev server)
npm run dev:tunnel   # Cloudflare Quick Tunnel → localhost:3000, only when a
                     # public HTTPS origin is needed (OAuth/integration tests)
```

Local gates before every commit: `npx prisma validate` →
`npx prisma generate` → `npx tsc --noEmit` → `npm test` →
`npm run test:pg` (isolated PG, never production) → `npm run build`.
Social/OAuth integration testing through the tunnel:
[`docs/local-social-dev.md`](local-social-dev.md).

## GitHub / PR flow

```
feature/staging branch → local verification → commit → push
→ GitHub Pull Request → review → merge to main
```

- Development happens on `staging/*` / feature branches, never directly
  on `main`.
- A push does NOT have to produce any Vercel deployment. Preview builds
  are optional and off the default path.
- Merging to `main` does NOT release Production. It only makes the code
  eligible for a manual release.

## Production release (manual)

Production (`postvia.online`) is released by an explicit manual action
taken after a PR is merged — never automatically from a merge or push.
`vercel --prod` is not part of the normal cycle and is only ever run as
that explicitly approved manual step; never force-push, never change the
remote, never create a second production project, never change the
production domain. Production env vars live in Vercel (per-environment
Stripe keys); `ADMIN_EMAILS` must contain the operator address there.

**Vercel Git deployment triggers are configured in the Vercel Project
settings, outside the repository.** This repo contains no setting that
enables or disables them (`vercel.json` below holds only the cron
schedule), so the no-automatic-Preview / no-automatic-Production policy
must be enforced in the Vercel dashboard. Do not claim otherwise.

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

## Rollback

Vercel: instant rollback to a previous deployment in the dashboard.
Database: schema changes are additive-only by policy; data fixes use
targeted statements, never resets.

## Post-release smoke (after a manual production release, no permanent test data)

`GET /api/health` (200 + `{ok:true,db:"ok"}`) → Homepage → login
(Google) → admin surfaces → DB connectivity (dashboard loads usage) →
`POST /api/posts` draft → OAuth initiation URL per provider → billing
page → delete any probe data.

Cron note (paid-plan requirement): the Hobby plan allows a single daily
cron (`0 3 * * *`), so scheduled posts can publish up to ~24h after the
selected time. Sub-daily scheduling needs a paid Vercel plan — no code
workaround is attempted. The composer and Terms state this honestly.
