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

Never: `migrate reset`, destructive SQL, touching other databases,
deleting the Neon project. Production data changes go through app flows
or keyed `WHERE` statements only.

## Build & release checklist

`npx prisma validate` → `npx prisma generate` → `npx tsc --noEmit` →
`npm test` → `npm run test:pg` (isolated PG, never production) →
`npm run build` → commit → push `main` (no force) → `vercel --prod` →
post-deploy smoke.

## Rollback

Vercel: instant rollback to a previous deployment in the dashboard.
Database: schema changes are additive-only by policy; data fixes use
targeted statements, never resets.

## Post-deploy smoke (no permanent test data)

Homepage → login (Google) → admin surfaces → DB connectivity (dashboard
loads usage) → `POST /api/posts` draft → OAuth initiation URL per
provider → billing page → delete any probe data. Health endpoint: none
exists — smoke via the surfaces above.
