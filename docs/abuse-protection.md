# Abuse protection

Implementation: `src/lib/abuse.ts`, `src/lib/free-post-kernel.ts`.
Tests: `tests/abuse-identity.test.ts`, `tests/abuse-adversarial.test.ts`,
`tests/abuse-pg-concurrency.test.ts` (`npm run test:pg`, needs a live
Postgres — never production).

## Threat model

Free monthly value is the asset. Attacks: multi-account farming (fresh
quota per signup), delete/re-register quota wash, shared-social reuse,
bulk/parallel creation races, OAuth-callback flood, disposable-mail
registration. Out of scope: payment fraud (Stripe's domain), provider-side
abuse, content moderation.

## Critical invariants

1. **Free value belongs to `AbuseIdentity`, not to `User`.**
2. Counters only grow: deletes never refill (`PostUsage`, `AbuseFreeUsage`).
3. Concurrent last-slot claims grant exactly one winner (conditional
   `updateMany … count < limit`).
4. Failed inserts consume nothing (single `$transaction` in the kernel).
5. Risk never auto-decreases; merges keep `max` (ABUSE survives everything).
6. Unique DB constraints are the final arbiter
   (`AbuseSignal[kind,valueHash]`, `SocialAccount[platform,externalId]`,
   `PostUsage[userId,period]`, `AbuseFreeUsage[identityId,period]`).
7. No PII/secrets in abuse tables or logs — peppered hashes only.

## Do not change without understanding

- The kernel's claim order + `FreePostDeny`-as-rollback protocol.
- `mergeIdentitiesWithClient`'s no-catch rule: **any failed statement
  aborts the whole Postgres transaction (25P02)** — use `updateMany`
  re-pointing, `createMany + skipDuplicates`, conditional raises, or raw
  `DELETE..RETURNING` + `ON CONFLICT` adds. Never `try/catch` and continue
  inside `$transaction`.
- `AbuseStores.isTransactional`: best-effort swallows (`tolerate()`) are
  forbidden inside tx-bound stores.
- Device/IP are secondary signals. Making either a hard identity merges
  strangers (family/office machines, NAT) — a false-positive factory.

## Common mistakes

- Adding a second quota claim outside the kernel (double-spend/phantom).
- `setRisk` for automatic paths (use `escalateRisk`, which is a single
  conditional statement — read-then-write has a downgrade TOCTOU).
- Catching constraint errors inside `$transaction` and continuing (25P02).
- Trusting `x-forwarded-for` beyond the documented Vercel-edge assumption.
- Treating `enforceFreeIdentityGate` as authoritative — it is legacy;
  `POST /api/posts` uses `createFreePostAtomic`.

## Identity model & signals

Hard identity signals (drive lookup, merge, convergence): `EMAIL_HASH`,
`GOOGLE_SUB`, `SOCIAL_LINK`. Secondary (risk/rate-limit evidence only):
`DEVICE_COOKIE` (`pv_did`, HttpOnly/Lax/1y), `IP_HASH` (rate buckets only,
daily salt). Hashing: `sha256("1:<pepper>:<namespaced value>")`;
`ABUSE_HASH_PEPPER` required in production (fail-closed without it).

Canonicalization (`canonicalizeEmail`): lowercase; Gmail/Googlemail →
dots + plus-tags stripped, domain folded to `gmail.com`; Yahoo
(`yahoo.com/co.uk`, `ymail`) → `-tags` cut. Disposable domains
(`DISPOSABLE_EMAIL_DOMAINS`, incl. subdomains) are refused at
registration and email change — a first bar, never the only defense.

## Identity resolution (`resolveAbuseIdentity`)

Live owners + live tombstones (+their merged-away identities) form
candidates; deterministic lowest-id winner; merges; attach; recheck
convergence (foreign live owner wins); link; post-link convergence rounds;
abandoned fresh-identity fold-in (no husk accumulation); risk re-eval;
`touchSeen` (never extends the MEDIUM cooldown — only `touchLinked` does).
Up to 4 main attempts + 6 verification rounds + final liveness guard that
never returns a merged-away id (adopts the surviving link/owner).

Convergence contract is **eventual**: without a global lock, a rival merge
can land between our last read and our return. The DB always converges to
one live identity owning every signal/link; stale ids self-heal on
re-resolve; in-tx callers (kernel) retry once on `P2002/P2003/P2025`.

## Identity merge

`mergeIdentitiesWithClient` in one `$transaction` (live wrapper retries
once): links/signals re-pointed via `updateMany` (violation-free), usage
carried atomically (`DELETE..RETURNING` consume + `INSERT..ON CONFLICT`
add — exactly-once per loser row, commutes with claims; a naive
read-modify-write double-carried 3+5+7 into 27 under concurrency), risk
escalated conditionally. Idempotent repeats are no-ops. Concurrent merges
must address the same deterministic (lowest-id) winner.

## Risk system

`LOW → MEDIUM (≥2 linked users or any live tombstone hit) → HIGH (≥5)`;
`ABUSE` manual only, never auto-assigned, never auto-lowered.
`evaluateRisk` is monotonic; merges use `max` via `escalateRisk` (single
conditional statement — no read-then-write downgrade window).
`MEDIUM_LINK_COOLDOWN_MS` (24h) throttles fresh links on MEDIUM identities
(own-history re-links exempt); HIGH links need review; ABUSE is restricted.

## Tombstones

`AbuseTombstone` (no FK — `identityId` may dangle after merges) survives
user/social deletion so re-registration inherits consumed value instead of
minting fresh quota. Live-tombstone filter by TTL (social 180d, else 90d);
expired rows await the sweeper and stop counting. Disconnect writes a
tombstone and frees the live signal; account deletion writes email +
Google + social tombstones atomically with the user delete.

## Free quota (two ledgers, one transaction)

- `PostUsage` (per user/month, monotonic) and `AbuseFreeUsage` (per
  identity/month, monotonic, floor = `max(SUM(PostUsage), live count)`).
- `createFreePostAtomic`: resolve → ABUSE check → identity claim → per-user
  claim → `post.create`, all in one `$transaction`. Denials throw
  `FreePostDeny` (rollback, mapped to 403 — no partial consumption).
  Business/insert failures rethrow (nothing committed, retry safe).
  Only transient errors (`P1001/1002/1008/1017/2024/2034`, network
  patterns) use the `PostUsage`-only fallback; misconfiguration
  (missing pepper, `P2021`) fails closed and loud.
- Paid/bypass never enter the kernel. Bulk has no bypass: every bulk item
  is one kernel-gated `POST /api/posts`.

## OAuth throttling & IP

Initiation: per-IP bucket 30/10 min (`gateOAuthInit`). Callbacks: per-IP
60/10 min + per-user 30/10 min (`gateOAuthCallback`, all four providers).
Resend-verification: per-email 3/15 min. Buckets live in `AbuseRateBucket`
(`rateTakeWithClient`: fast bump → sentinel insert → single-claimant →
fresh-read + conditional reset/bump — exactly `max` winners, including
expiry races). `getClientIp` trusts the Vercel edge (`x-forwarded-for[0]`
or `x-real-ip`), validates IPv4/IPv6 shape, returns null otherwise; a
spoofed header only shifts buckets, never identity or quota.

## Email change, delete/re-register, reconnect

Change: old address tombstoned + live signal released (a recycled address
re-resolves flagged `MEDIUM`, never silently clean), new address attached.
Delete: tombstones in the delete transaction; identity, signals, consumed
value survive. Own reconnect skips the abuse gate (token update) and needs
no cooldown; чужой handoff starts fresh unless same-device evidence ties
the same pair.

## Paid & admin bypass

Paid (`isPaidActivePlan`: non-free plan, not `CANCELED`/`EXPIRED`) and
admin `BYPASS` skip Free gates/ledgers entirely; ownership, rate limits
and risk friction for others still apply. Admin detection is the
`ADMIN_EMAILS` allowlist — no DB flag.

## `AbuseEvent`

Best-effort, never throws, never gates: `CREATED/MERGED/SIGNAL/
TOMBSTONE_HIT/RISK/LINK_DENY/POST_DENY` with identity id only. Written via
the ambient client (survives kernel rollback by design). Note: unit tests
call live `recordAbuseEvent`, so running `npm test` with a production
`.env` writes telemetry rows there — point tests at an isolated DB.

## Fail-open / fail-closed matrix

| Condition | Behavior |
|---|---|
| Missing `ABUSE_HASH_PEPPER` (prod) | fail closed (throw / deny) |
| Missing abuse tables (`P2021`) | fail closed (throw / deny) |
| Transient PG errors | fail open to `PostUsage`-only path (posts) / allow+log (OAuth links) |
| Business/insert errors | throw, nothing consumed, retry safe (no fallback) |
| Race aborts (`P2002/2003/2025`) | one idempotent retry (kernel, merge), then loud |
| `AbuseEvent` write failure | dropped + logged, enforcement unaffected |
| `ABUSE_ENFORCEMENT=off` | all gates synthetic-allow, zero writes |

## Known limitations

- Return-value convergence is eventual, not linearizable (see above).
- `enforceFreeIdentityGate` is legacy/test-only with broader fail-open
  than the kernel — do not use it for new enforcement.
- Device evidence for same-pair re-links can over-inherit on truly shared
  browsers (fail-safe direction: deny, flagged).
- Tombstone TTLs are coarse (social 180d / rest 90d); no per-signal tuning.
