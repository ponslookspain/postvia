# Social integrations

Implemented providers: **X, Threads, TikTok, Instagram**.
`Facebook/LinkedIn/YouTube/Pinterest` exist only as Prisma enum values —
no routes, no code. Plan feature copy (`src/lib/plans.ts`) advertises
exactly the four implemented networks.

## Scopes

- X: `tweet.read users.read tweet.write offline.access` (`src/lib/social/x.ts:9`)
- Threads: `threads_basic,threads_content_publish` (`threads.ts:8`)
- TikTok: `user.info.basic,video.publish` (`tiktok.ts:11`)
- Instagram: `instagram_business_basic,instagram_business_content_publish` (`instagram.ts:22`)

## OAuth initiation — `GET /api/auth/:provider/connect`

Identical shape for all four: require session (401) → `gateOAuthInit`
(per-IP persistent bucket, 30/10 min, 429) → provider-configured guard
(TikTok/Instagram return 500 JSON when unconfigured; X/Threads throw from
URL builders) → state (+PKCE verifier/challenge for X only) in
`httpOnly, SameSite=Lax, 600s` cookies → authorize URL JSON + `pv_did`
device cookie (`applyDeviceCookie`).

## OAuth callback — `GET /api/auth/:provider/callback`

1. Provider `error` / missing `code`+`state` → `/accounts?error=…`
   (TikTok whitelists codes via `KNOWN_OAUTH_ERRORS`; others echo the
   provider value).
2. State-cookie check (`invalid_session`/`invalid_state`; TikTok/Instagram
   compare timing-safe, X/Threads compare with an explicit length +
   constant-time loop).
3. Session required → `gateOAuthCallback` (per-IP 60/10 min **and** per-user
   30/10 min; `too_many_requests` redirect on deny).
4. Server-side token exchange (secrets never reach the browser) + profile
   fetch. Instagram rejects `PERSONAL` accounts (publishing API needs
   Business/Creator); TikTok falls back to `"TikTok user"` when
   `user.info` fails.
5. **Reconnect** (same `userId+platform+externalId` found): token update in
   place — skips abuse gate and plan quota entirely.
6. **Fresh link**: `getEffectivePlan` → `gateNewSocialLink`
   (`ACCOUNT_IN_USE` / `UNDER_REVIEW` / `COOLDOWN` / `RESTRICTED` redirects;
   paid plans skip risk friction but not ownership) →
   `createSocialAccountRaceSafe` (pre-check → `P2002`-converge →
   oldest-first rank on the last free slot; concurrent same-externalId
   callbacks collapse to exactly one owner, losers get `account_in_use`).
7. Success redirect clears state cookies. Failures log presence flags only
   (no codes, tokens, or raw provider messages in logs/URLs — TikTok and
   Instagram use fixed failure codes).

## Account management

- `GET /api/accounts` — list. `DELETE /api/accounts/:provider?accountId=…`
  — `findDisconnectTarget` (concrete `accountId` required, ownership in the
  query) → provider revoke (best-effort; Threads revoke is a documented
  no-op) → `recordDisconnect` (social tombstone + live signal release) →
  row delete.
- Global total account limits come from entitlements (Free 1 total,
  Growth 5 total, Scale unlimited); reconnects never consume quota.

## Publishing primitives (`src/lib/social/*`)

- X: Basic-auth token exchange/refresh, race-safe `ensureFreshXToken`;
  media via the v2 chunked upload (`media/upload/initialize` → `append`
  4 MB segments → `finalize` → `STATUS` poll) attached as `media_ids` on
  `POST /2/tweets` (up to 4 photos, 1 GIF, or 1 video; pay-per-use
  billing applies per post). The official API offers no idempotency key,
  so ambiguous outcomes (timeout/throw past the tweet POST) resolve to
  `FAILED` with check-your-profile-first guidance, and crashed attempts
  leave an `x-req-*` marker for `resumeXTarget` (never an automatic
  second POST) — see Retry below.
- Threads: short→long-lived exchange, container → poll → publish
  (container id persisted immediately for resume). Single-media scope:
  text, one image, or one MP4 video — the official API also supports
  carousels, but Postvia intentionally publishes single-media posts only
  (`maxItems: 1`, explicit per-platform error otherwise).
- TikTok: `FILE_UPLOAD` chunked video pipeline with `onPublishId` persist;
  `queryTiktokCreatorInfo` feeds composer options (privacy/duet/stitch/
  comments/cover). PHOTO posts go through `POST /v2/post/publish/content/init/`
  (`media_type=PHOTO`, `DIRECT_POST`, `PULL_FROM_URL`) with first-party
  bridge URLs (`/api/tiktok/media/{id}?expires&sig`, HMAC-signed, 90 min)
  — raw Vercel presigned Blob URLs are unusable because their
  `*.blob.vercel-storage.com` hostname can never pass TikTok URL-ownership
  verification.
- Instagram: short→long-lived exchange, container flow, race-safe refresh.
  MVP scope: single JPEG photo or single MP4 Reel only — the official
  Content Publishing API also supports carousels (up to 10 children),
  stories, and `alt_text`, which Postvia does not implement yet
  (explicit per-platform error otherwise).
- `GET /api/social/tiktok/creator-info` exposes creator options to the UI.

## Media support (mirrors `capabilities.ts`; code is authoritative)

| Platform | Text | Photos | GIF | Video | Max items | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Threads | ✅ | ✅ JPEG/PNG/WebP | ✅ (image) | ✅ MP4 only | 1 | No carousel in Postvia (API supports it) |
| X | ✅ 280 | ✅ JPG/PNG/WebP ≤5 MB | ✅ single ≤15 MB | ✅ MP4/MOV | 4 photos / 1 GIF / 1 video | No mixing; duration enforced server-side by X |
| TikTok | ❌ (own title) | ✅ JPEG/WebP ≤20 MB | ❌ | ✅ MP4/WebM/MOV | 4 (API allows 35) | No mixing; video: title ≤2200 required; photo: title ≤90 + description ≤4000, at least one required; never global-text fallback |
| Instagram | ❌ (caption+media) | ✅ JPEG only | ❌ | ✅ MP4 Reel | 1 | No carousel/stories/alt_text in Postvia (API supports them) |

## Retry / duplicate protection (`externalJobId` semantics per platform)

- TikTok: `publish_id` persisted immediately after init; resume polls
  `status/fetch` only — a second init can never happen.
- Threads / Instagram: container id persisted immediately after creation;
  resume polls + publishes the same container — never a second one.
- X: synchronous, no remote job id. `x-req-*` attempt marker is stored
  **before** the tweet POST and cleared on terminal outcomes. A transport
  failure past the POST is `FAILED` with "check your X profile before
  retrying" guidance (cron never auto-retries `FAILED`). A crash leaves
  `PUBLISHING` + marker: stale recovery keeps it pending while fresh and
  converts it to `FAILED`-with-guidance after 10 min
  (`X_AMBIGUOUS_ATTEMPT_MS`) via conditional update — a second tweet POST
  is never issued automatically.
- Generic guards for all: atomic post/target claims (no double-claim),
  `PUBLISHING` targets are never publishable (no double-submit), exact
  `socialAccountId` binding (no first-account fallback), terminal
  failures clear the job id so manual retry starts fresh.

## Production requirements per provider

Valid client id/secret + exact redirect URIs registered on each developer
portal (`X_REDIRECT_URI`, `THREADS_REDIRECT_URI`, `TIKTOK_REDIRECT_URI`,
`INSTAGRAM_REDIRECT_URI`), TikTok/Instagram apps out of sandbox where the
API requires it, and an Instagram **Business/Creator** account for posting.
Additionally: verify the TikTok URL prefix
`https://postvia.online/api/tiktok/media/` (DNS/portal ownership) or
photo posts fail with `url_ownership_unverified`; fund X API credits
(pay-per-use is billed per post, more for posts containing URLs).
