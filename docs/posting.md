# Posting & scheduling

## Creating a post — `POST /api/posts`

Order (all server-side): session (401) → effective plan + usage pre-check
(403) → body parse → bulk-batch gate (400/403) → text required → resolve
target accounts (`accountIds` or `targets[].accountId`, deduped; ≥1
required) → ownership check (ids must belong to the caller) →
per-platform account/content/override validation → **X + `scheduledAt`
hard ban** → schedule validation → quota + insert:

- **Free** (`plan === "free"`, no bypass): `createFreePostAtomic` —
  identity resolve + identity claim + per-user claim + `post.create` in
  **one** `$transaction`. Denials map to 403 (`RESTRICTED` or quota with
  observed count). Insert failure rolls everything back (no phantom quota);
  concurrent last-slot attempts grant exactly one winner.
- **Paid/bypass**: `createWithMonthlyQuota` — per-user ledger claim +
  insert (no identity ledger; Scale `monthlyPosts: null` skips the ledger).

`Post` lifecycle: `DRAFT → SCHEDULED → PUBLISHING → PUBLISHED`, plus
`PARTIALLY_PUBLISHED` / `FAILED`. `PostTarget` rows track per-account
`PENDING/PUBLISHING/PUBLISHED/FAILED`.

## Post detail — `/api/posts/[id]`

- `GET`: owned post + targets + media. `PATCH`: text edit; reschedule via
  `resolveScheduledAtUpdate` (only `DRAFT/SCHEDULED`; gated by the
  retry/reschedule entitlement; X-target scheduled check); `status` in body
  is rejected. `DELETE`: blobs first, then the row; **quota ledgers are
  never decremented** (deleting never refills).
- `POST …/publish` and `POST …/retry` (`maxDuration: 300`): claim targets
  with conditional `→PUBLISHING` transitions, continue in `waitUntil`,
  respond 202 while clients poll. Retry additionally recovers stale
  `PUBLISHING` rows (6 min; jobless → `PENDING`, X `x-req-*` markers →
  pending while fresh, `FAILED`-with-guidance after 10 min, never an
  automatic second tweet) and is entitlement-gated.

## Bulk (`/posts/bulk`)

No dedicated API: the client fans out one ordinary `POST /api/posts` per
video with an attested `bulkBatchSize`, each gated individually.
`canBulkSchedule` (Free: no bulk; Growth/Scale: ≤10 videos) plus the
monthly quota backstop. Pure helpers in `src/lib/bulk-schedule.ts`.

## Scheduling & cron

`validateScheduledAt` (non-empty, valid, strictly future).
`GET+POST /api/cron/publish-scheduled` requires Bearer `CRON_SECRET`
(timing-safe; missing secret always rejects) and runs
`runScheduledPublishTick`: recover stale `PUBLISHING` (resume by
`externalJobId` first), claim due `SCHEDULED → PUBLISHING` within the tick
budget, then sweep orphan blobs in capped batches.
Schedule: `vercel.json` cron `0 3 * * *` (**once daily** — Hobby-plan
maximum; posts scheduled after 03:00 UTC can wait ~24h; sub-daily needs a
paid Vercel plan). Validity window 24h (`SCHEDULE_VALIDITY_MS`).

### Scheduler module layout (PARTIAL REFACTOR decision)

```text
src/lib/scheduling.ts
    ├── cron infrastructure (isCronAuthorized, withCron)
    ├── timing configuration (functionMaxDurationMs, cronTickBudgetMs, batches, concurrency)
    ├── scheduler types (SchedulingDb, StoredPost, TickStats, …)
    ├── tick orchestration (runScheduledPublishTick)
    └── claim + publish repair (claimAndPublishPost, private)

src/lib/scheduling/recover-stale.ts
    └── stale recovery (recoverStalePublishing) + recovery-owned constants
        (STALE_PUBLISHING_MS, SCHEDULE_VALIDITY_MS, STALE_RECOVERY_BATCH)
```

Only `recoverStalePublishing` was extracted (byte-for-byte, behavior
unchanged); `src/lib/scheduling.ts` stays the facade and re-exports it plus
the three constants, so consumer imports (`@/lib/scheduling`) are unchanged.
Deliberately NOT created: `claim-scheduled.ts` (claim stays next to the
tick and its publish repair — one consumer, no independent boundary),
`schedule-validation.ts` (validation already lives in `src/lib/schedule.ts`
— there was nothing to move), `schedule-state.ts` (no standalone state
machine exists; transitions are inline conditional writes), `publish-tick.ts`
(no separate useful boundary; the facade remains one cohesive pipeline).

Dependency direction: `route → src/lib/scheduling.ts →
src/lib/scheduling/recover-stale.ts`. `recover-stale.ts` imports scheduler
types via `import type` only. Runtime circular dependency is absent.

### Scheduler invariants (verified, do not change without a plan upgrade)

- cron path: `/api/cron/publish-scheduled`; schedule: `0 3 * * *`
- `maxDuration = 60` (cron route; Hobby ceiling)
- `STALE_PUBLISHING_MS = 360000` (6 min; strictly above the function
  ceiling, so recovery can never reset a live publish)
- `SCHEDULE_VALIDITY_MS = 86400000` (24h; older stale posts expire to
  `FAILED` instead of re-queueing)
- `SCHEDULE_TICK_BATCH = 200`; `STALE_RECOVERY_BATCH = 100`
- `SCHEDULE_TICK_CONCURRENCY = 4` (tick budget ratio 0.7 → 42s at Hobby)

Claim: `SCHEDULED → PUBLISHING` via a conditional `updateMany`
(`where: { id, status }`); lost claim returns `skipped`, never republishes.

Tick order (must stay equivalent): recovery → due fetch (`SCHEDULED`,
`scheduledAt <= now`, oldest-due-first) → batch → conditional claim →
bounded concurrency → publish → aggregate repair → stats.

## Media

`POST /api/media/prepare` (authorized pathname reservation) → presigned
Blob upload → `POST /api/media/upload` (`onUploadCompleted →
registerCompletedUpload`) → `GET /api/media/status` polling →
`GET /api/media/[id]` private proxy (ETag, 1h private cache, ranges).
Webhook replaces still images with optimized JPEG (same pathname; GIFs
untouched; failures keep the original); videos pass through.
`DELETE /api/media/[id]` removes blob then row (row failure after blob
delete can dangle — known limitation). Cron sweeps >24h orphan blobs.
