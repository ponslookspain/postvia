# Development

## Local setup

```bash
npm install
# .env: DATABASE_URL_POSTGRES_PRISMA_URL (local Postgres),
# BETTER_AUTH_SECRET, GOOGLE_CLIENT_ID/SECRET, provider keys,
# RESEND_API_KEY, BLOB keys, ABUSE_HASH_PEPPER (dev fallback ok), ADMIN_EMAILS
npx prisma db push   # empty/dev databases only — never production
npm run dev          # http://localhost:3000
```

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` / `start` | dev / production server |
| `npm run build` | `prisma generate` + `next build` |
| `npm run lint` / `typecheck` | eslint / `tsc --noEmit` |
| `npm test` | full `node --test` suite (unit, fake stores — no DB writes except `AbuseEvent` telemetry; point at an isolated DB via `.env` if needed) |
| `npm run test:pg` | **real-PostgreSQL concurrency suite** (`tests/abuse-pg-concurrency.test.ts`). Requires `PG_INTEGRATION=1`, an **isolated** `DATABASE_URL_POSTGRES_PRISMA_URL`, `ABUSE_HASH_PEPPER`, `ABUSE_ENFORCEMENT=enforce`. **Never production.** Skips without `PG_INTEGRATION=1` |
| `db:generate` / `db:push` / `db:seed` | Prisma client / push (dev) / seed |
| `reset:data(:check)` | `scripts/reset-data.ts` data reset helper |

## Testing

- Unit/adversarial: `tests/abuse-identity.test.ts` (in-memory stores with
  row-lock-like atomicity), `tests/abuse-adversarial.test.ts` (36-scenario
  attacker matrix + snapshot-transaction kernel tests), plus per-module
  suites (`post-limits`, `social-accounts-multi`, `entitlements`, `plans`,
  `billing-*`, provider tests, `sentry-scrub`, …).
- PG concurrency: `test:pg` covers same-signal resolve storms, merge
  convergence/idempotence, last-slot (25-way), rollback + retry, mixed
  success/failure, social ownership (20-way), risk preservation, delete/
  recreate, email recycle, device isolation, P2021/transient classification,
  OAuth floods, expiry-reset races, DB invariants. Run **≥3×** — races are
  timing-sensitive.
- Conventions: `AbuseStores`/`QuotaClaimStore`/`SocialAccountStore` are
  injected so tests run without a DB; when adding a store method, update
  **all three** fake implementations (`abuse-identity`,
  `abuse-adversarial`, `social-accounts-multi` tests) or `tsc` fails.

## Backfill & ops scripts

- `scripts/backfill-abuse-identities.ts` (`--dry-run` / `--execute`):
  builds identities + SUM floors for pre-existing users. Idempotent,
  P2002-tolerant, same invariants as live paths. Never auto-run.
- `scripts/reset-data.ts`: check/reset helper for dev data.
