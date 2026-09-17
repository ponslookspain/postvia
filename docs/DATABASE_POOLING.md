# Database connection pooling — verification note

**Status: UNVERIFIED from the repository. This document does not assert a
conclusion; it records what the code proves, what it cannot prove, and the
exact checks that settle it.**

Raised by the backend audit (P0.3). No connection logic was changed, because
changing pool behaviour on a guess is how you turn a healthy database into an
outage.

---

## Why this matters

Every serverless instance that handles a request creates its own
`PrismaClient` and therefore its own connection pool. Postgres enforces a
global `max_connections`; serverless concurrency does not respect it. If the
configured URL is a **direct** endpoint rather than a **pooled** one, the
failure mode is not gradual — it is a cliff. Under a traffic spike, new
instances fail to connect and requests start returning 500s while the database
itself looks idle.

The audit ranked this as the joint-highest-value item precisely because it is
cheap to check and expensive to get wrong.

---

## What the repository proves (CONFIRMED)

| Fact | Source |
|---|---|
| The datasource URL comes from one env var, `DATABASE_URL_POSTGRES_PRISMA_URL` | `prisma/schema.prisma:7` |
| The client is a single module-scoped singleton | `src/lib/prisma.ts` |
| No explicit pool tuning exists in code | `src/lib/prisma.ts` — `new PrismaClient()` with no options |
| The global cache is only set outside production | `src/lib/prisma.ts` — `if (process.env.NODE_ENV !== "production")` |
| The database is Neon, project `postvia-db` | `docs/database.md` |
| Production is the Neon `main` branch | `docs/database.md` |
| No `directUrl` is configured | `prisma/schema.prisma` has no `directUrl` field |

The singleton pattern itself is correct: module scope persists for the life of
a warm instance, so one instance holds one pool rather than one per request.
**That is not the question.** The question is what that pool connects *to*.

---

## What the repository CANNOT prove (UNVERIFIED)

`.env.example` carries only a placeholder:

```
DATABASE_URL_POSTGRES_PRISMA_URL=postgresql://user:password@host:5432/db?sslmode=require
```

The real value lives in Vercel's Production environment variables and is not
in the repository. Therefore **none** of the following can be determined here:

- whether the host is Neon's pooled or direct endpoint;
- whether PgBouncer is in front of it;
- what `connection_limit` each instance uses;
- what `max_connections` the Neon compute allows;
- how many concurrent instances production actually reaches.

The variable name is suggestive — `POSTGRES_PRISMA_URL` is the Vercel–Neon
integration's conventional name for the **pooled** string, and that
integration sets it with `pgbouncer=true&connect_timeout=15`. **Suggestive is
not verified.** A hand-set variable can carry anything, and the name would not
change.

---

## How to settle it

### 1. Inspect the connection string (definitive)

Vercel Dashboard → project `postvia` → Settings → Environment Variables →
Production → `DATABASE_URL_POSTGRES_PRISMA_URL`.

**Pooled (what you want):**
```
postgresql://…@ep-<name>-pooler.<region>.aws.neon.tech/neondb?sslmode=require&pgbouncer=true&connect_timeout=15
                       ^^^^^^^                                              ^^^^^^^^^^^^^^
```
Two markers: the host contains **`-pooler`**, and the query string carries
**`pgbouncer=true`**.

**Direct (needs fixing):**
```
postgresql://…@ep-<name>.<region>.aws.neon.tech/neondb?sslmode=require
```
No `-pooler` in the host, no `pgbouncer` parameter.

### 2. Confirm against the live database

```sql
-- Session-level view. Against the POOLED endpoint this reports the
-- PgBouncer-mediated view, not the raw backend count.
SHOW max_connections;
SELECT count(*) AS open, state FROM pg_stat_activity GROUP BY state;
```

Neon Dashboard → project `postvia-db` → branch `main` → Connection Details
shows both the pooled and direct strings side by side, which is the fastest
visual confirmation.

### 3. Watch for the symptom

If the direct endpoint is in use, load produces these in Sentry or the Vercel
runtime logs:

- `Can't reach database server` under concurrency while the DB is healthy
- `too many connections for role` / `remaining connection slots are reserved`
- `P2024` (Prisma: timed out fetching a connection from the pool)
- `P1001` bursts correlated with traffic peaks rather than deploys

---

## If it turns out to be the direct endpoint

Do **not** start by editing `src/lib/prisma.ts`. The fix is the URL:

1. Set `DATABASE_URL_POSTGRES_PRISMA_URL` to the **pooled** string
   (`-pooler` host, `pgbouncer=true&connect_timeout=15`).
2. Add `connection_limit=1` to the pooled string. In a serverless function
   one in-flight request needs one connection; a larger per-instance pool
   multiplies by instance count for no benefit.
3. If Prisma migrations or introspection are ever run against production, add
   a `directUrl` to `prisma/schema.prisma` pointing at the **direct**
   endpoint — PgBouncer in transaction mode cannot run DDL. Note that today
   migrations are applied by hand via psql (see `docs/database.md`), so this
   is only needed if that changes.
4. Redeploy. No application code changes.

---

## Related audit findings

- **P1.7 (implemented)** — the Better Auth session cookie cache removes a
  Session + User read from every authenticated request. That is the single
  largest reduction in connection *demand* available without touching the
  pool, and it is already in place. It reduces pressure; it does not
  substitute for a pooled endpoint.
- Whatever the outcome, `src/lib/prisma.ts` needs no change. Pooling is a
  deployment-configuration property, not an application one.

---

## Verification log

| Date | Checked by | Endpoint | Result |
|---|---|---|---|
| 2026-09-17 | backend audit | — | **UNVERIFIED** — value not present in the repository; Vercel API returned 403 for this project/org, so it could not be read programmatically either |

Append a row when this is confirmed. Until a row here says otherwise, treat
production pooling as an open question.
