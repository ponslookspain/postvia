# Database

PostgreSQL (Neon project `postvia-db`) via Prisma 6. Schema:
`prisma/schema.prisma`. Datasource URL env:
`DATABASE_URL_POSTGRES_PRISMA_URL`.
The database carries **no `_prisma_migrations` history** (created with
`prisma db push`); later changes ship as additive migration SQL under
`prisma/migrations/` (abuse event, billing guards, OTP/onboarding,
post idempotency key) applied as DDL. `prisma migrate diff --from-url
--to-schema-datamodel` must be empty apart from known optimization-only
deltas (currently: missing `SocialAccount_userId_idx` — planner-only,
harmless).

## Topology: one database per environment, never per user

- `main` → **Production** (Vercel Production, `postvia.online`).
- `development` → **local development** (`localhost` + ngrok). Forked
  from `main` **with data**, then wiped of copied users/OAuth tokens and
  given one clean local admin. Test writes go here only.
- Preview workflow is not used; historical `preview/*` branches are not
  part of any flow.

All tables below live once per environment and are shared by every user
of that environment (`userId` scoping, never separate databases).
Production OAuth tokens must never be copied into development (a refresh
from a copied token would invalidate the production one). Before any
write, compare the URL host against the known endpoint for that
environment; abort on mismatch. Never `migrate reset`; never `db push`
or destructive DDL against `main`/Production.

## Auth & accounts

| Model | Key fields | Relations / deletion |
|---|---|---|
| `User` | `email @unique`, `emailVerified`, `name`, `image?` (no role column — admin is the `ADMIN_EMAILS` allowlist, see [Auth](auth.md)) | parent of everything below |
| `Account` (Better Auth) | `providerId` (`credential`/`google`), `accountId`, tokens, `password?` | `userId → User Cascade`; `@@index([providerId, accountId])` |
| `Session` | `token @unique`, `expiresAt`, ip/UA | `→ User Cascade` |
| `Verification` | `identifier`, `value`, `expiresAt` | standalone; `@@index([identifier])` |
| `UserPreferences` | `userId @unique`, notification flags | `→ User Cascade` |

## Posts & media

| Model | Notes |
|---|---|
| `Post` | `userId → User` (**no** `onDelete` — plain relation; account deletion removes posts explicitly in the route transaction). `status: PostStatus`, `scheduledAt/publishedAt`, `clientOperationId String? @unique` (idempotency key — a missing column once caused bare 500s on create; see migration `20260914000001`). Indexes: `[userId,status]`, `[status,scheduledAt]`, `[status,updatedAt]` |
| `PostTarget` | `postId → Post Cascade`; `socialAccountId → SocialAccount SetNull`; `@@index([postId, socialAccountId, externalJobId])` |
| `Media` | `userId → User Cascade`, `postId → Post Cascade`; `@@unique([pathname])` (concurrent completions collapse via P2002) |
| `SocialAccount` | `userId → User Cascade`; `@@unique([userId,platform,externalId])` **and** `@@unique([platform,externalId])` (one external account → one PostVia owner, DB-enforced); `@@index([userId,platform])` |

No `ScheduledPost` model exists — scheduling is `Post.scheduledAt` + `status`.

## Billing

| Model | Notes |
|---|---|
| `Subscription` | `userId @unique`; `plan: FREE/GROWTH/SCALE`, `status: ACTIVE/CANCELED/PAST_DUE`, `currentPeriodEnd?`, `cancelAtPeriodEnd`, Stripe ids; `→ User Cascade`. Written **only** by the Stripe webhook (or admin test routes) |
| `BillingTestOverride` | `userId @unique`; admin-only sandbox (`BYPASS`/`ENFORCEMENT`); consulted only for admin emails; `→ User Cascade` |
| `StripeEvent` | `eventId @unique` webhook idempotency ledger; never read for billing state |

`PostUsage` (`userId, period "YYYY-MM", count` monotonic; `@@unique([userId,period])`, `→ User Cascade`) is the per-user monthly creation ledger. Deleting posts never decrements it.

## Anti-abuse

| Model | Notes |
|---|---|
| `AbuseIdentity` | `riskLevel: LOW/MEDIUM/HIGH/ABUSE`, `riskReason?`, `lastLinkedAt?`, timestamps. The unit Free value belongs to |
| `AbuseIdentityLink` | `userId @unique` (one user → at most one identity), `identityId`; both FKs `Cascade` (user delete removes the link, identity survives); `@@index([identityId])` |
| `AbuseSignal` | `identityId → AbuseIdentity Cascade`; `@@unique([kind,valueHash])` — a signal value points at exactly one identity (concurrent resolves serialize on P2002). Hashes only, never raw PII |
| `AbuseTombstone` | **No FK** (`identityId` informational, may dangle); `@@unique([kind,valueHash])`; survives deletions; swept after TTL |
| `AbuseFreeUsage` | `identityId → AbuseIdentity Cascade`; `@@unique([identityId,period])`; monotonic identity-level Free ledger |
| `AbuseRateBucket` | `@@unique([scope,keyHash])`; persistent rate limits; `@@index([resetAt])` |
| `AbuseEvent` | `identityId?` (no FK), `kind: AbuseEventKind`, `createdAt`; best-effort telemetry, indexed both columns |

See [Abuse protection](abuse-protection.md) for semantics. Full flow and
constraint details: `src/lib/abuse.ts`, `src/lib/free-post-kernel.ts`.
