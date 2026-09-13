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

- X: Basic-auth token exchange/refresh, race-safe `ensureFreshXToken`.
- Threads: short→long-lived exchange, container → poll → publish
  (container id persisted immediately for resume).
- TikTok: `FILE_UPLOAD` chunked video pipeline with `onPublishId` persist;
  `queryTiktokCreatorInfo` feeds composer options (privacy/duet/stitch/
  comments/cover).
- Instagram: short→long-lived exchange, container flow, race-safe refresh.
- `GET /api/social/tiktok/creator-info` exposes creator options to the UI.

## Production requirements per provider

Valid client id/secret + exact redirect URIs registered on each developer
portal (`X_REDIRECT_URI`, `THREADS_REDIRECT_URI`, `TIKTOK_REDIRECT_URI`,
`INSTAGRAM_REDIRECT_URI`), TikTok/Instagram apps out of sandbox where the
API requires it, and an Instagram **Business/Creator** account for posting.
