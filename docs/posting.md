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
  `PUBLISHING` rows (6 min, jobless → `PENDING`) and is entitlement-gated.

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

## Media

`POST /api/media/prepare` (authorized pathname reservation) → presigned
Blob upload → `POST /api/media/upload` (`onUploadCompleted →
registerCompletedUpload`) → `GET /api/media/status` polling →
`GET /api/media/[id]` private proxy (ETag, 1h private cache, ranges).
Webhook replaces still images with optimized JPEG (same pathname; GIFs
untouched; failures keep the original); videos pass through.
`DELETE /api/media/[id]` removes blob then row (row failure after blob
delete can dangle — known limitation). Cron sweeps >24h orphan blobs.
