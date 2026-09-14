# Local social development (real OAuth + real video publishing, no Vercel deploy)

Test real X / Threads / TikTok / Instagram connections and video publishing
from your own machine. Nothing here touches Production: no `vercel deploy`,
no Production env-var changes, no production DB/schema/data changes, no
production-domain changes. Google OAuth is out of scope and is NOT needed
for this smoke flow — log in locally with the existing email OTP /
password flow. The tunnel is a local development aid only: it NEVER
replaces Production, and its URL can never be treated as a stable address.

## Architecture

```
browser ──https──> DEV_ORIGIN (stable public HTTPS, e.g. https://dev.postvia.online)
                       │ tunnel (Cloudflare Tunnel / cloudflared)
                       ▼
               http://localhost:3000  (npm run dev)
```

- **Local:** Next.js on `http://localhost:3000`.
- **Public dev HTTPS:** one stable hostname (preferred:
  `https://dev.postvia.online`) that tunnels to your localhost. Providers
  only ever see this origin (OAuth callbacks, session origin).
- **Production:** `https://postvia.online` on Vercel — completely separate
  env vars, DB usage discipline (below), and redirect URIs.

Why a public HTTPS origin is required at all: X / Threads / TikTok /
Meta only accept public `https` redirect URIs (no `http://localhost`
except X/Threads defaults, which providers still must allow), Better Auth
session/CSRF checks need the origin in `trustedOrigins`, and TikTok photo
posts need a first-party `https` bridge URL the TikTok app verifies
ownership of.

## Prerequisites

- `npm install` (repo root).
- A tunnel tool. Preferred: `cloudflared` (Cloudflare Tunnel) with a
  persistent hostname `dev.postvia.online`. `cloudflared` was NOT installed
  on this machine at the time of writing — install it first
  (`https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/`).
- Real secrets for the providers you want to test. **Never commit them.**
  They live only in `.env.local` (git-ignored). `.env.example` contains
  names + safe placeholders only.
- A non-production database. Your `.env.local` currently points
  `DATABASE_URL_POSTGRES_PRISMA_URL` at a Neon URL — **verify it is a dev
  database before any destructive testing** (see "Database" below). Never
  run `scripts/reset-data.ts` / `cleanup-test-users` against production.

## 1. Tunnel setup (one manual action)

**Option A — preferred (stable hostname `dev.postvia.online`):**
`dev.postvia.online` DNS currently resolves (observed `216.198.79.1` /
`216.198.79.65`), but no tunnel for it is configured from this machine —
do not assume it already points at you. One manual action is required,
either in the Cloudflare dashboard (Zero Trust → Tunnels → create tunnel
→ public hostname `dev.postvia.online` → service `http://localhost:3000`)
or on any machine that owns the zone:

```dns
dev.postvia.online.  CNAME  <your-tunnel-id>.cfargotunnels.com.
```

then run:

```bash
cloudflared tunnel --url http://localhost:3000
# or, with a named tunnel: cloudflared tunnel run <tunnel-name>
```

**Option B — portable fallback (no DNS needed):** any HTTPS tunnel
works because the dev hostname is never hardcoded — it comes from env vars:

```bash
cloudflared tunnel --url http://localhost:3000
# → you get https://<random>.trycloudflare.com — use THAT as DEV_ORIGIN below
```

> The Quick Tunnel URL is **temporary and must NOT be considered
> stable**: it changes on every `cloudflared` restart. After each restart,
> update `BETTER_AUTH_URL`, `BETTER_AUTH_TRUSTED_ORIGINS`, the four
> `*_REDIRECT_URI` values in `.env.local`, and the redirect URIs in the
> provider portals (§2–§3). A named Cloudflare Tunnel (Option A) is the
> only setup with a persistent hostname.

From here on, `DEV_ORIGIN` means your actual public origin
(`https://dev.postvia.online` for Option A, the `trycloudflare` URL for
Option B). Every place below that shows `dev.postvia.online`, substitute
your `DEV_ORIGIN` host when on Option B.

Keep the tunnel running in its own terminal for the whole session.

## 2. `.env.local` for local social dev

```bash
# Auth base: fallback base URL + email links + TikTok bridge host.
BETTER_AUTH_URL=https://dev.postvia.online
# Extra Better Auth origins (appended to allowedHosts/trustedOrigins;
# production allowlist itself is untouched in code).
BETTER_AUTH_TRUSTED_ORIGINS=https://dev.postvia.online

# Exact redirect URIs — must match the provider portals character-for-character.
X_REDIRECT_URI=https://dev.postvia.online/api/auth/x/callback
THREADS_REDIRECT_URI=https://dev.postvia.online/api/auth/threads/callback
TIKTOK_REDIRECT_URI=https://dev.postvia.online/api/auth/tiktok/callback
INSTAGRAM_REDIRECT_URI=https://dev.postvia.online/api/auth/instagram/callback

# Real provider credentials (from your own dev apps — never commit):
X_CLIENT_ID= / X_CLIENT_SECRET=
THREADS_APP_ID= / THREADS_APP_SECRET=
TIKTOK_CLIENT_KEY= / TIKTOK_CLIENT_SECRET=
INSTAGRAM_APP_ID= / INSTAGRAM_APP_SECRET=
```

Notes:

- X / Threads fall back to `http://localhost:3000/...` when their env is
  empty; **TikTok / Instagram fall back to
  `https://postvia.online/...`** — so for TikTok/Instagram the env vars
  above are mandatory locally, otherwise local testing would mint
  production redirect URIs.
- Code defaults are intentionally left as-is; env vars override them.
- `NODE_ENV` stays `development` under `npm run dev`, so OAuth
  state cookies are `SameSite=Lax`, `httpOnly`, non-`Secure` — they work
  over both `http://localhost:3000` and the HTTPS tunnel origin. In
  production `Secure` applies as before (untouched).

## 3. Register DEV redirect URIs in provider portals (manual, per provider)

Add these as **additional** redirect/callback URLs on your existing (or
dev) apps — do NOT delete the production `https://postvia.online/...`
entries:

| Provider | Portal | Exact DEV redirect URI to add |
|---|---|---|
| X | X Developer Portal → app → OAuth 2.0 settings | `https://dev.postvia.online/api/auth/x/callback` |
| Threads | Meta Developer → Threads app → OAuth redirect | `https://dev.postvia.online/api/auth/threads/callback` |
| TikTok | TikTok Developer Portal → Login Kit → Redirect URIs | `https://dev.postvia.online/api/auth/tiktok/callback` |
| Instagram | Meta Developer → Instagram app → OAuth redirect | `https://dev.postvia.online/api/auth/instagram/callback` |

TikTok extras: the Login Kit app must list the redirect URI exactly; for
**photo** posts the app additionally needs URL-prefix/domain ownership
verification for `https://dev.postvia.online/api/tiktok/media/` (same
requirement production has for `https://postvia.online/api/tiktok/media/`).
**Video** posts use `FILE_UPLOAD` and need no public URL verification.

Instagram extras: the test account must be **Business/Creator**
(personal accounts are rejected by design); the app needs the
`instagram_business_basic` + `instagram_business_content_publish` scopes
live for your test user.

## 4. Run + verify

```bash
npm install
npm run dev          # http://localhost:3000 (own terminal)
# + tunnel running (own terminal, see §1)
```

1. Open `http://localhost:3000/login`, sign in with the existing email
   OTP (or password) flow. Google is not used here.
2. Open `http://localhost:3000/accounts` — you must be logged in, not
   bounced to `/login`.
3. Better: do steps 1–2 again **through the tunnel origin**
   (`https://dev.postvia.online/login` → `/accounts`). Session must
   survive there — that proves `BETTER_AUTH_TRUSTED_ORIGINS` + `BETTER_AUTH_URL`
   work over HTTPS.
4. On `/accounts`, connect each provider in turn:
   X → Threads → TikTok → Instagram. Each connect calls
   `GET /api/auth/:provider/connect` (401 when logged out, `{url}` when
   logged in) and returns to `/accounts?connected=...`.
5. Create a post with a video (composer) targeting the connected account
   and publish it. Expected per-platform behavior:
   - **X:** synchronous tweet with chunked media upload; ambiguous
     transport failures resolve to FAILED with "check your X profile
     before retrying" (never an automatic duplicate).
   - **Threads:** container → poll → publish; video polling can take
     minutes (long-poll budget is already in code).
   - **TikTok video:** `FILE_UPLOAD` chunked pipeline, no public URL
     needed — the path that works locally with zero portal URL setup.
   - **TikTok photo:** needs the dev bridge host verified in the TikTok
     portal (see §3); bridge URLs are minted from `BETTER_AUTH_URL`, so
     they point at your dev origin, never production.
   - **Instagram Reel:** container flow over Meta-signed Blob media URLs;
     needs a Business/Creator account.
6. If a connect/publish fails, `/accounts?error=...` names the stage
   (never secrets). Server logs carry presence-flags only. Checklist:
   - `invalid_session` / `invalid_state` → cookies lost: tunnel origin
     mismatch or third-party-cookie blocking; confirm you started the
     flow and the callback on the SAME origin.
   - `too_many_requests` → abuse buckets (per-IP/per-user); wait and retry.
   - provider `redirect_uri_mismatch` → portal URI ≠ `.env.local` value
     character-for-character (scheme/host/path/trailing slash).
   - TikTok `url_ownership_unverified` → dev bridge prefix not verified
     in the TikTok portal (photo posts only).
   - Instagram `instagram_personal_account` → use a Business/Creator
     test account.
   - Blob/media errors → local Blob access needs valid Vercel OIDC/blob
     credentials; video upload failures surface per provider.

## 5. Database discipline

- Confirm `.env.local` points at a **dev** Neon database (or a scratch
  one) before testing. The schema carries no `_prisma_migrations`
  history (production was created with `db push`) — never run
  `prisma migrate dev`, `prisma db push`, or `migrate reset` against
  anything but an empty dev database.
- Test users: delete individually only; `ponslookdesign@gmail.com` is
  never deleted. Never mass-clean.
- Publishing tests create REAL posts on the connected social accounts —
  use throwaway/test social accounts, never brand accounts.

## 6. What NOT to do (production safety)

- Never `vercel deploy` / `vercel --prod`; never create Preview deployments
  for this; never pull Vercel env over `.env.local`.
- Never change Production Environment Variables or the production domain.
- Never delete deployments.
- Never point local env at the production DB for destructive testing;
  never change production schema/data.
- Never commit secrets (`.env.local` is git-ignored; `.env.example`
  holds placeholders only).
- Never remove the production redirect URIs from portals or docs.
- When finished testing: disconnect dev social accounts on `/accounts`
  (local rows only; provider-side grants can also be revoked in each
  network's settings), stop the tunnel, keep `npm run dev` for local work.

## 7. Status vs. this machine (read-only audit, no portals touched)

Code-verified: callback paths (`/api/auth/{x,threads,tiktok,instagram}/callback`),
env-var names, TikTok/Instagram production code defaults, Better Auth
dynamic baseURL + `BETTER_AUTH_TRUSTED_ORIGINS` wiring, TikTok bridge host
derivation, Blob/OIDC publishing path, cookie flags (`Secure` only in
production).

Verified locally after the change: `npx prisma validate`, `npx prisma
generate`, `npm run typecheck`, `npm run lint`, unit tests incl. the new
`tests/dev-origins.test.ts`, `npm run build`, plus a smoke run
(` /login` renders, `/accounts` requires login, provider connect routes
answer 401 logged-out).

Requires YOUR manual steps: tunnel (§1), `.env.local` secrets (§2),
portal redirect URIs + TikTok bridge verification + Instagram
Business/Creator account (§3), real test social accounts, and one live
video publish per network (§4).
