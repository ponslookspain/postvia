# Backend audit follow-up

Implementation record for the backend audit. Companion to
`docs/audit-report.md` (archived 2026-09-15, historical) — **this file is
current**.

Ground rule applied throughout: minimal, isolated, production-safe changes
reusing the patterns the codebase already proves, rather than new subsystems.
Nothing in the working concurrency machinery (quota kernel, rate ledger,
Stripe idempotency, OAuth state) was altered.

Baseline before changes: branch `dev` at `d2fccb7`, typecheck clean, lint
clean, **1111 tests passing**. After: **1219 passing**, 0 failing.

---

## FIXED

### P0.2 — The publish tick is bounded
`src/lib/scheduling.ts`

The due-post query loaded **every** due post in the system with all its
targets into one function's memory, ordered by creation time. Now:
`take: SCHEDULE_TICK_BATCH` (200), `orderBy: { scheduledAt: "asc" }`. The
recovery pass is bounded the same way (`STALE_RECOVERY_BATCH`, 100,
oldest-stuck-first) against `@@index([status, updatedAt])`.

The ordering change is the substantive part: with a cap, ordering decides who
waits, and the only fair rule is oldest-*due*-first. A single sort key is used
deliberately so the query matches `@@index([status, scheduledAt])` and
Postgres stops at `take` instead of sorting the whole due-set. Ties resolve
arbitrarily, which is safe because the `SCHEDULED → PUBLISHING` conditional
claim is unchanged — anything not claimed this tick is claimed by the next.

Tests: `tests/scheduling.test.ts` — bounded claiming, due-ordering, backlog
drain across ticks, overlapping ticks publishing each post once, bounded
recovery. The in-memory fake now honours `take`/`orderBy`.

### P1.1 — `AbuseRateBucket` is swept
`src/lib/retention.ts`, `src/app/api/cron/publish-scheduled/route.ts`

The table gained a row per (scope, key) pair — including per-IP keys across
every gated write path — and had `@@index([resetAt])` but no sweep. It was on
track to become the largest table in the database.

`sweepRateBuckets` follows the existing best-effort retention contract, wired
into the same cron tick beside `sweepStripeEvents` / `sweepAbuseEvents` with
its own `try`/`reportError`. Select-then-delete in capped batches
(`RATE_BUCKET_SWEEP_BATCH` 500, max 20 statements per run), never one
unbounded DELETE. A `RATE_BUCKET_GRACE_MS` of one hour — the longest window in
use (`WRITE_PATH_WINDOW_MS`) — means a swept row has been dead for at least a
full window, so the sweep cannot race an in-flight reset.

Tests: `tests/retention.test.ts` — expired removed, live untouched, grace
respected, idempotent, batched, capped.

### P1.2 — The 4-media-per-post race
`src/lib/media-upload.ts`

The cap was a `count()` in `/api/media/prepare` followed by an unconditional
insert in a **later, separate** webhook request, with nothing joining them. N
concurrent prepares all saw the same count, all got a reserved pathname, and
all registered — a post capped at 4 could reach 20.

`claimMediaSlot` now performs the duplicate check, the count and the insert as
one critical section per post, serialized by `pg_advisory_xact_lock` inside a
transaction — **the same primitive `/api/billing/checkout` already uses**.

A plain count-then-insert inside a transaction would *not* have been enough:
under READ COMMITTED two concurrent transactions both read the same count and
both insert. A conditional-increment ledger (the pattern the quota system
uses) would have required a counter column, i.e. a schema migration on a
database with no migration history — the lock avoids that.

Supporting changes: a cheap pre-check before the billed canonical transform so
an over-cap flood cannot amplify into image transformations; rejected uploads
delete their blob and raise `MediaRegistrationRejected`; cleanup failure is
logged, never allowed to mask the rejection.

Tests: `tests/media-cap.test.ts` (contract, 9 cases including 20-way
concurrency and last-slot) and `tests/media-pg-concurrency.test.ts` (real
Postgres, 6 cases, added to `test:pg` and the CI `pg-concurrency` job).

### P1.3 — Magic-byte validation
`src/lib/media-signature.ts` (new), `src/lib/media-upload.ts`

The MIME type was client-supplied end to end: declared in `clientPayload`,
pinned into the signed token, echoed back by the store. Nothing inspected a
byte. A caller could declare `image/jpeg` and PUT arbitrary content — the
canonical transform would fail, the availability-first fallback would keep the
original bytes, and a Media row would describe them as a JPEG.

`verifyStoredSignature` reads only the first 32 bytes via HTTP Range (the same
mechanism the TikTok publish path uses), so a 100 MB video costs 32 bytes to
check. On mismatch the blob is deleted and no row is created. Fails closed on
a read error, an unknown declared type, and a truncated read.

Covered: JPEG, PNG, GIF (both revisions), WebP, MP4/MOV (ISO `ftyp`),
WebM/Matroska (EBML). A coverage test pins that every type in `MEDIA_LIMITS`
has a check and vice versa, so the allowlist and the signature table cannot
drift apart.

Tests: `tests/media-signature.test.ts` — 29 cases including HTML/SVG/EXE/ZIP
declared as images, a real PNG declared as JPEG, a real MP4 declared as WebM,
truncated headers, and a valid signature after leading junk.

### P1.4 — Media failures are traceable
`src/lib/diagnostics.ts`, `src/lib/media-upload.ts`

`safePathname()` collapsed every media path to the literal `media/***/***`
and no diagnostic carried any id, so two different users' upload failures were
indistinguishable and no incident could be traced to a request.

`mediaTrace()` emits `userHash` (peppered SHA-256 prefix, stable per user,
non-reversible, reusing `ABUSE_HASH_PEPPER` so there is one secret to rotate),
`postId` / `mediaId` (opaque cuids — database surrogates, not personal data),
`pathDigest` (hashed storage key, so one object is followable across
prepare → upload → register), and the original scrubbed `pathname`.

The `isSensitiveKey` denylist is untouched. Tokens, signed URLs, raw ids and
filenames still never reach a log. Tests assert both directions: the trace is
correlatable, and `JSON.stringify(trace)` contains no raw user id or filename
and survives `scrubValue` with its identifiers intact.

### P1.5(a) — Credential surface narrowed
`src/app/api/posts/route.ts`, `src/app/api/settings/account/route.ts`,
`src/app/api/auth/instagram/callback/route.ts`,
`src/app/api/social/tiktok/creator-info/route.ts`

Route handlers loaded whole `SocialAccount` rows — access and refresh tokens
included — where only ids and platforms were needed. Every route-handler read
now names its columns.

A static guard in `tests/security-hardening.test.ts` walks `src/app/api/**`
and fails on any unselected read, plus an allowlist (`TOKEN_READERS`) for the
two handlers that legitimately need a token, each with its reason. The guard
found two call sites the audit had missed
(`auth/instagram/callback`, `social/tiktok/creator-info`) — which is the
argument for it being static rather than runtime.

### P1.6 — Account deletion is DB-first
`src/lib/delete-resources.ts`, `src/app/api/settings/account/route.ts`

Blobs were deleted **before** the transaction, inverting the policy documented
at the top of `delete-resources.ts`. If the transaction then failed — a P2028
timeout is realistic, it deletes targets, media, posts, accounts, sessions and
auth rows in one interactive transaction on the 5s default — the user survived
with Media rows pointing at bytes that no longer existed. Unrecoverable.

`runAccountDeleteFlow` follows the same pure-orchestration shape as
`runPostDeleteFlow`: transaction first, storage after, chunked
(`BLOB_DELETE_CHUNK` 100) so an unbounded key list is never one call and one
failed chunk does not strand the rest. Outcomes are explicit — `failed`
(nothing removed, retryable), `deleted-with-orphans` (account gone, bytes
reclaimed by the existing 24h sweep — a success for the user), `deleted`.

The transaction now carries `timeout: 20_000, maxWait: 10_000`, safe because
it no longer precedes any network call. The bare `catch {}` that hid failures
on the most destructive operation in the product is replaced with
`reportError`.

Tests: `tests/delete-resources.test.ts` — failed transaction touches no
storage, failed blob delete still deletes the account, chunking, partial chunk
failure, empty media set.

### P1.7 — Session cookie cache
`src/lib/auth.ts`

`getApiUser()` runs on every API route and server page, each call a Session +
User read — by volume the most frequent query in the product. Enabled with
`maxAge: 60` rather than the library's 5-minute default.

The trade, stated plainly: a session revoked server-side without the browser
signing out stays usable for up to 60 seconds. Verified against the installed
better-auth 1.7.4 before enabling:
- sign-out calls `deleteSessionCookie`, which expires the cache cookie
  alongside the token cookie — logout is immediate, not eventual;
- the session route discards the cache when the cached token no longer
  matches the token cookie;
- `refreshCache` is left at its default `false`, so the cache can never
  extend itself statelessly past `maxAge`;
- entitlements read `Subscription` from the database, never from the session,
  so billing is never served stale;
- `ADMIN_EMAILS` is read from the environment per call.

Tests: `tests/session-cache.test.ts` — the window is bounded, `refreshCache`
stays off, and the three library behaviours above are asserted structurally so
a dependency bump that changed them would fail here.

### P1.8 — Range responses are 206
`src/lib/http-range.ts` (new), `src/app/api/media/[id]/route.ts`

The route set `Content-Range` while returning status 200, which is not a valid
partial response — a browser handed 1 MB of a 40 MB video treats it as a
complete 1 MB file, so seeking and resumable playback break.

Now: no range → 200 with `Content-Length`; satisfiable range → **206** with
`Content-Range`; unsatisfiable → **416** with `Content-Range: bytes */size`,
answered without touching the store. Bounds are clamped to the entity and the
upstream Range header reflects the *clamped* bounds, so `Content-Length` and
`Content-Range` can never disagree. Unsupported syntax (multi-range,
non-byte units) degrades to a full 200 response per RFC 9110 rather than
erroring. Ownership still 404s first; ETag/304 behaviour is unchanged.

Tests: `tests/http-range.test.ts` — 20 cases across 200/206/416, suffix
ranges, clamping, inverted ranges, empty entities, and unsafe integers.

---

---

# Round 2 (2026-09-17) — after the infrastructure facts landed

Two things were **VERIFIED by the operator** and they resolve open questions
from round 1:

1. **Database pooling: CONFIRMED CORRECT.** `DATABASE_URL` uses the Neon
   pooled endpoint (`ep-gentle-sky-b1kruqyx-pooler...`), with
   `PGHOST_UNPOOLED` / `DATABASE_URL_UNPOOLED` available separately. The open
   question in `docs/DATABASE_POOLING.md` is closed; **no Prisma connection
   logic was changed**, which was the right call.

2. **The Vercel plan is Hobby.** This is not just "the cron stays daily" — it
   invalidated two constants the code was reasoning from.

## Hobby consequences — fixed

### The tick budget could never fire
`src/lib/scheduling.ts`

`CRON_TICK_BUDGET_MS` was `240_000` against a **60s** ceiling: four times the
wall the function actually hits. It could never stop the loop, so the
invocation was **killed mid-publish** instead of finishing gracefully, and
every post it had already claimed (`SCHEDULED → PUBLISHING`) was stranded
until a later tick recovered it — on a daily cron, up to 24 hours.

There is now one source of truth, `functionMaxDurationMs()` (Hobby 60s,
overridable with `FUNCTION_MAX_DURATION_MS` on a paid plan), and the budget
derives from it at 70%, leaving headroom for in-flight work and the retention
sweeps. `tests/cron-schedule.test.ts` pins that the budget is strictly inside
the ceiling and that raising the ceiling raises the budget.

### `maxDuration = 300` was fiction
`cron/publish-scheduled`, `posts/[id]/publish`, `posts/[id]/retry`

Hobby clamps to 60s, so three routes declared a ceiling the platform would not
honour and every timeout comment reasoned from the wrong number. All three now
declare `60`, and a test asserts the declaration matches
`functionMaxDurationMs()`.

`STALE_PUBLISHING_MS` (6 min) was already safe and is unchanged — it now has a
**6x** margin over the real ceiling instead of 1.2x, which is why recovery
still cannot reset a live publish.

### Still broken on Hobby, and NOT silently changed
Provider poll budgets all exceed the 60s ceiling: **Threads video 240s**,
Instagram 150s, TikTok 150s, X 120s. A video publish that needs longer than
~60s is killed mid-poll.

This is not corruption — `externalJobId` is persisted before the provider call
and the resume path reuses the same container, so nothing double-posts. But
the post stays `PUBLISHING` until the next daily cron, i.e. up to 24h.

These budgets were deliberately left alone: clamping them changes publishing
behaviour for every user and is a product decision, not a cleanup. The options
are (a) upgrade the plan, or (b) clamp each budget to fit inside the function
and let the resume path finish the job sooner.

## Round 2 work

### Bounded-concurrency scheduler (priority 1)
`src/lib/scheduling.ts`

The tick published strictly serially, so one slow target held the whole
invocation — a single Threads video blocked every other user's post behind it.
With 60s and one cron per day, effective throughput was roughly "one slow post
per day".

Posts are now published in chunks of `SCHEDULE_TICK_CONCURRENCY` (4,
`SCHEDULE_TICK_CONCURRENCY` env-overridable) via `Promise.allSettled`. What did
**not** change is the part that matters: each post still takes its own
conditional `SCHEDULED → PUBLISHING` claim, so exactly-once holds within a
chunk, across chunks, and across overlapping invocations. The per-post work
moved verbatim into `claimAndPublishPost`, which is total by construction — a
sibling's failure cannot abort the chunk.

The budget is now checked per chunk rather than per post, so overrun is bounded
by one chunk's slowest post. Tests cover measured peak concurrency, the bound
holding, exactly-once under 6-way concurrency, two overlapping ticks, sibling
isolation on failure, and chunk-level budget stopping. The pre-existing serial
budget test was pinned to `concurrency: 1` rather than weakened.

### X video streaming (priority 2)
`src/lib/social/x.ts`, `src/lib/publish.ts`

`new Response(blob.stream).arrayBuffer()` pinned up to the full 100 MB video
limit in memory, then `.slice()`-ed another copy per 4 MB segment.

`uploadXMedia` now takes an `XMediaSource` (`{ totalBytes, readChunk }`)
instead of a buffer. X's INIT only needs `total_bytes`, which `Media.size`
already carries, so peak memory is one segment. `readChunk` takes inclusive
bounds so a private-blob ranged read maps to it one-to-one — the same model
the TikTok video path already used. A short read aborts before sending a
corrupt segment. `bufferedXMediaSource()` adapts callers that genuinely hold
bytes (the existing tests).

### Social token encryption (priority 3)
`src/lib/social-token-crypto.ts` + every read/write site

AES-256-GCM envelope encryption for `SocialAccount.accessToken` /
`refreshToken`. Three constraints shaped it:

**No schema change.** The ciphertext is self-describing
(`pvenc.v1.<keyId>.<iv>.<tag>.<ct>`) and lives in the existing `String`
columns, so the key id travels inside the value and rotation needs no extra
column. Production's missing migration history is untouched.

**The rotation compare-and-swap is unchanged.** Every provider's
`ensureFresh*Token` persists with
`updateMany({ where: { id, accessToken: <value as read> } })`. Because AES-GCM
is randomized, re-encrypting that comparand would never match and every
refresh would silently fall into the "lost the race" branch. So ciphertext
stays **opaque** through that path — the value read from the row is the value
compared against it — and decryption happens only where a token is used or
returned. A dedicated test asserts the CAS comparand is the stored ciphertext,
that the caller receives plaintext, and that the database receives ciphertext.

**Rollout is reversible.** Reads accept plaintext and ciphertext, writes
encrypt only when `SOCIAL_TOKEN_KEY` is set. Deploying this with no key is a
literal no-op. Order: deploy → set the key → `npm run backfill:token-encryption`
(dry-run by default; idempotent; CAS-guarded so it never overwrites a
concurrent rotation).

Better Auth's `Account` table is still **not** encrypted: its token columns are
written by the library's adapter, so it needs a library-supported hook. That
remains open.

A static guard in `tests/security-hardening.test.ts` now covers both
directions — no wide reads, and no token write that bypasses
`encryptAccountTokens` / `encryptRotatedTokens`.

### Migration drift protection (priority 5)
`scripts/check-schema-drift.ts`, `.github/workflows/ci.yml`

A `schema-drift` CI job runs `prisma migrate diff --from-url … --exit-code`
against production and fails the build on drift. Strictly read-only. It
**refuses a pooled endpoint** (PgBouncer cannot serve introspection reliably)
and requires the direct URL, which the operator has confirmed exists as
`DATABASE_URL_UNPOOLED`. Without the `SCHEMA_DRIFT_DATABASE_URL` secret the
job skips, so forks stay green.

This replaces guessing: `tests/schema-drift.test.ts` only covers the columns
someone remembered to list, which is exactly how a P2022 slipped through before.

### Video validation (priority 6)
`src/lib/media-video.ts`

A bounded ISO base media (MP4/MOV) box parser that recovers the declared
duration from `moov` → `mvhd`. Pure arithmetic over a few hundred KB read by
HTTP Range — no ffmpeg, no demuxer, nothing that could exceed the function
budget. Handles 32- and 64-bit box sizes, mvhd v0 and v1, and the
non-faststart layout (trailing `moov`) via one extra tail read.

A file that declares zero or negative duration is rejected as damaged at
upload time instead of failing minutes later at publish. Everything else
**fails open** — an undeterminable duration allows the upload, because the
security boundary is the signature check that already ran and rejecting valid
files over an unusual layout would trade a real failure for a hypothetical one.
WebM is not parsed (variable-length EBML) and is documented as such.

`MEDIA_MAX_VIDEO_SECONDS` exists but is **deliberately unset**: see below.

## Still NOT implemented — and why

### Storage quota (priority 4): architecture proposed, limits are yours

No byte quota exists. Scale is unlimited monthly posts x 4 media x 100 MB,
forever; Free is up to ~6 GB of permanent storage per identity per month at $0.
`Media` has no TTL.

Per the instruction not to invent business limits, here is the design, not an
implementation:

**Measurement.** `SUM(Media.size) WHERE userId` — served by the existing
`Media @@index([userId])`. No new table, so no migration. Exact, and cheap
because media rows per user are bounded by 4 per post.

**Enforcement point.** `reserveUploadPathname` already loads a per-post count;
add the per-user byte sum to that same `Promise.all` and reject before a
pathname is minted. Rejecting at reservation is strictly better than at
registration — no bytes are uploaded at all.

**Atomicity.** Same problem and same solution as the per-post cap (P1.2): a
plain sum-then-decide races. Reuse `pg_advisory_xact_lock` keyed on `userId`
inside the registration transaction. No counter column, therefore no migration.

**Entitlement.** `maxStorageBytes: number | null` in `PlanEntitlements`
(`src/lib/plans.ts`), `null` meaning unlimited so the shipped state is
unchanged until real numbers are chosen.

**Retention.** Separately, media attached to posts published more than N months
ago could be swept by the existing cron. Both N and the per-plan byte caps are
pricing decisions.

Two inputs are needed before building this: the per-plan byte limits, and
whether retention is acceptable product behaviour. The abuse ceiling is already
bounded by the race-free per-post cap and the orphan sweep, so this is a cost
question rather than a security one.

### Video duration cap
`MEDIA_MAX_VIDEO_SECONDS` is implemented and tested but **unset**, so duration
is measured and logged, never used to reject. Every platform has its own cap;
choosing Postvia's is a product decision. Set the env var to switch it on.

### Provider poll budgets vs the 60s ceiling
See "Still broken on Hobby" above. Needs either a plan upgrade or a deliberate
product decision to clamp.

---

## NOT IMPLEMENTED — and why (round 1)

### P0.1 — Cron frequency: **RESOLVED as blocked — the plan is Hobby**

**VERIFIED 2026-09-17: the Vercel plan is Hobby**, which permits one cron
invocation per day. The audit's `*/5 * * * *` recommendation is therefore
blocked on a paid plan, not on code. `vercel.json` stays daily, and
`tests/cron-schedule.test.ts` now asserts that explicitly so nobody tightens it
into a failing deploy. The original reasoning is kept below for the record.

### P0.1 (original) — Cron frequency: **BLOCKED, needs an infrastructure decision**

The audit's top recommendation is `0 3 * * *` → `*/5 * * * *`. **It was not
applied**, because the repository's evidence about the Vercel plan is
contradictory and the failure mode of guessing wrong is a rejected deployment:

| Evidence | Implies |
|---|---|
| `docs/deployment.md`: "once daily — Hobby-plan maximum" | **Hobby** |
| `maxDuration = 300` in three routes (Hobby caps at 60s) | **Pro** |
| `.vercel/repo.json` `orgId: team_…` (teams are paid) | **Pro** |
| Vercel API for this project/org | **403 — could not verify** |

On Hobby, a `*/5` schedule fails deployment validation. Shipping it blind
could take down a release — the worst possible outcome from a hardening patch.

**A second, independent finding falls out of this.** Threads video publishing
polls for up to 240s (`THREADS_VIDEO_POLL_TIMEOUT_MS`), Instagram and TikTok
150s, X 120s. All exceed a 60s Hobby function limit. So **either** the project
is on Pro and `docs/deployment.md` is stale, **or** video publishing has never
completed reliably and has been silently killed mid-poll. Both branches need
the same one-minute check.

What shipped instead: `tests/cron-schedule.test.ts` encodes the safety
argument so the flip is a one-line change with coverage already in place —
the tick budget must fit inside one cron interval, the interval must not drop
below the function ceiling, and `STALE_PUBLISHING_MS` must exceed
`maxDuration` (the invariant that makes recovery safe at any cadence, and the
reason a tighter cadence cannot double-post).

Once the plan is confirmed as Pro, the whole change is:
```json
"schedule": "*/5 * * * *"
```
and the tests above will hold it.

### P1.5(b) — Social token encryption: **RESOLVED, without the migration this section assumed**

`SocialAccount.accessToken` / `refreshToken` are now encrypted — see "Social
token encryption (priority 3)" under Round 2, above. Better Auth's `Account`
token columns (Google login) are also now encrypted, via the library's own
`account.encryptOAuthTokens: true` option in `src/lib/auth.ts` — no
library patch or hook was needed, just turning on a flag that already existed
in the installed 1.7.4. Neither fix needed the column migration, key-id
column, or backfill this section proposed; both are additive and reversible
the same way (self-describing ciphertext / library-side envelope, opaque to
any comparand, plaintext rows still read). The original reasoning is kept
below for the record.

`SocialAccount.accessToken` / `refreshToken` and Better Auth's `Account` token
columns are plaintext. This was the audit's top security finding and it is
**not fixed** — only the exposure surface was narrowed (P1.5a).

It was not improvised because it requires: a column migration, a backfill of
live rows, a key-id column for rotation, and a decrypt seam in every read path
(`resolveTargetAccount`, `ensureFreshXToken` / `…TiktokToken` /
`…InstagramToken` / `…ThreadsToken`, the account-delete revocation loop).
Production carries **no `_prisma_migrations` history** (see below), so a
schema-plus-backfill change is precisely the class of change that must not be
guessed at.

Better Auth's `Account` table is harder still: its token columns are owned and
rewritten by the library's own adapter, so encrypting them needs a
library-supported hook, not a Prisma-level change.

(Historical: that hook turned out to already exist — see the RESOLVED note
above.)

Proposed design, for review before implementation:
1. Add `tokenKeyId INT NULL` to `SocialAccount` (additive, nullable — same
   shape as every migration already in `prisma/migrations/`).
2. `src/lib/crypto/envelope.ts`: AES-256-GCM, key from a new server-only
   `SOCIAL_TOKEN_KEY` env var, ciphertext stored as
   `v1:<keyId>:<iv>:<tag>:<ct>`.
3. Write path encrypts (one place: `social-accounts.ts` +
   the four `ensureFresh*Token` rotation writes).
4. Read path decrypts with a passthrough for `tokenKeyId IS NULL`, so old and
   new rows coexist and no downtime window exists.
5. Backfill script; then make encryption mandatory.
6. Better Auth `Account` columns: separate task, gated on confirming the
   supported hook in 1.7.x.

### P2 — X video buffers the whole file in memory: **feasible, deliberately deferred**

`src/lib/publish.ts:399` does `new Response(blob.stream).arrayBuffer()` before
`uploadXMedia`, so up to 100 MB sits resident, and `.slice()` copies each 4 MB
chunk on top.

Streaming **is** possible — this was checked rather than assumed. X's chunked
upload needs `total_bytes` at INIT, which is available from `Media.size`
without reading a byte, and APPEND takes fixed 4 MB segments that could come
from HTTP Range reads. The TikTok path already proves the pattern
(`readChunk` with `bytes=start-end` against the private blob).

It was not bundled here because it changes the signature of a working publish
path that six tests depend on and that cannot be verified end to end against
the real X API from this environment. Shipping it alongside eight other
changes would make the whole patch harder to bisect. It should be its own
change: convert `uploadXMedia` to take `{ totalBytes, readChunk }` instead of
`{ bytes }`, mirroring `publishTiktokDirectVideo`.

Until then the ceiling stands: one concurrent 100 MB X video publish per
instance is fine; several in one warm instance are a memory risk.

### P2 — Video validation beyond the container: **needs a worker**

Container-signature checking shipped with P1.3 (MP4/MOV/WebM), and size and
MIME were already enforced. Still absent: duration, resolution, bitrate, codec
verification, corruption detection, thumbnails, metadata extraction. There is
no `Media.status` column, so there is nowhere to record "processing"/"failed"
even if a pipeline existed.

All of it needs a demuxer (ffprobe or equivalent), which must not run inside a
request lifecycle. Recommended: an external media service (Mux / Cloudflare
Stream) invoked from the existing `upload-completed` webhook, with a new
`Media.status` driving the composer's **existing** polling UI — that part
needs almost no client change.

### P2 — Storage quota: **model designed, limits are a product decision**

There is no byte quota anywhere. `PlanEntitlements` covers accounts, monthly
posts, bulk videos and three booleans. Scale is unlimited monthly posts × 4
media × 100 MB, forever; Free is up to ~6 GB of permanent storage per identity
per month at $0. `Media` has no TTL and no retention policy.

Design, not implemented because the numbers are a pricing decision and must
not be invented:
1. `maxStorageBytes: number | null` in `PlanEntitlements` (`src/lib/plans.ts`).
2. A `StorageUsage` ledger keyed `(userId)` holding `bytes`, claimed with the
   **same conditional-increment pattern** as `PostUsage` —
   `updateMany({ where: { id, bytes: { lte: limit - size } } })` — in
   `reserveUploadPathname`, released on delete.
3. Retention for media attached to posts published more than N months ago.

The per-post cap (now race-free, P1.2) and the capped orphan sweep already
bound the two worst cases.

### P2 — Migration history: **documented, not fabricated**

Production carries no `_prisma_migrations` table (created with
`prisma db push`); migrations ship as hand-applied single psql statements, and
`docs/database.md` explicitly says not to baseline it. CI runs
`prisma validate` plus `db push` against throwaway databases only, so there is
**no automated gate that production schema matches `schema.prisma`** — the
only net is `tests/schema-drift.test.ts` (static). A forgotten statement
surfaces as a runtime P2022; that has happened before (see the comment in
`src/app/api/posts/route.ts`).

No fake history was created. Recommended, in order of increasing commitment:
1. Add a CI step running
   `prisma migrate diff --from-url $PROD_URL --to-schema-datamodel prisma/schema.prisma --exit-code`
   against a read-only production role, failing the build on drift. Lowest
   risk, closes the gap immediately.
2. Later, baseline production with `prisma migrate resolve --applied` for each
   existing migration and move to `prisma migrate deploy`.

Step 1 is safe today and should not wait for step 2.

---

## REMAINING RISKS

| Risk | Severity | State |
|---|---|---|
| Scheduled posts publish up to ~24h late | **Critical** | Blocked on the plan check (P0.1). Bounding and tests are in place; only the schedule line remains. |
| Video publishing may be killed mid-poll on Hobby | **High** | Same check resolves it. |
| OAuth tokens plaintext at rest | ~~High~~ | **RESOLVED** — `SocialAccount` via `social-token-crypto.ts`, Better Auth `Account` via `encryptOAuthTokens: true`. Better Auth's own `idToken` column stays unencrypted (short-lived OIDC identity token, not a bearer credential; nothing reads it back). |
| Production DB pooling unverified | **High** | `docs/DATABASE_POOLING.md`. Demand reduced by P1.7. |
| No storage quota / no media retention | **High** | Model designed; limits need a product decision. |
| No automated production migration gate | **High** | CI drift-check recommended above. |
| Video accepted with no duration/codec/resolution check | **Medium** | Container check shipped; the rest needs a worker. |
| X video buffers up to 100 MB | **Medium** | Feasible fix designed, deferred to its own change. |
| Publish tick is still serial within a batch | **Medium** | Read is bounded (P0.2); concurrency within the batch is the next step. |
| Session revocation is eventual within 60s | **Low** | Accepted trade, bounded and tested. |

---

## INFRASTRUCTURE ACTIONS

Outside the repository, in priority order:

1. **Confirm the Vercel plan** for project `postvia`
   (`prj_lSgzDjL7hwEKoaP9z6tNAcg7yno4`). If Pro: set the cron to
   `*/5 * * * *` and correct `docs/deployment.md`. If Hobby: `maxDuration =
   300` is being silently clamped to 60s and video publishing needs
   re-examining.
2. **Confirm the production database URL is pooled** — see
   `docs/DATABASE_POOLING.md` for the exact markers and the log table to fill in.
3. **Decide storage limits per plan**, so the quota model can be built to a
   real number.
4. **Provision a read-only production role** for the CI migration drift check.
5. **Review Vercel Blob storage growth** — nothing has ever expired, so
   current usage is the cumulative total since launch.

---

## Verification

```
npm run typecheck   # clean
npm run lint        # clean
npm test            # 1219 passing, 0 failing (baseline 1111)
npm run build       # clean
npm run test:pg     # CI only — no local Postgres or Docker available
```

`test:pg` (including the new `tests/media-pg-concurrency.test.ts`) **was not
run locally** — this machine has neither a Postgres instance nor Docker. It
runs in the CI `pg-concurrency` job against `postgres:16`. The in-memory
equivalents in `tests/media-cap.test.ts` do pass locally and cover the same
contract.
