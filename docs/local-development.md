# Local development (canonical guide)

The single entry point for running Postvia on your own machine. Concrete
values live in [`.env.example`](../.env.example) and
[`local-social-dev.md`](local-social-dev.md); this file states the
architecture. The operator's reserved ngrok hostname is written below as
`https://<NGROK_HOST>` — find the current value in `.env.local`
(`BETTER_AUTH_URL`) or ask the operator. Never commit `.env.local`.

## 1. Prerequisites

Node.js 24, `npm`, the `ngrok` CLI (only for OAuth/social flows),
a Neon account (the `development` branch already exists).

## 2. Install — once

```bash
npm install
```

## 3. Local env

Copy [`.env.example`](../.env.example) to `.env.local` and fill local
values (names + purposes in [`environment.md`](environment.md)):

- `DATABASE_URL_POSTGRES_PRISMA_URL` — Neon **`development`** branch
  (pooled URL). Never the `main` branch.
- `BETTER_AUTH_URL` / `BETTER_AUTH_TRUSTED_ORIGINS` —
  `https://<NGROK_HOST>`.
- `X/THREADS/TIKTOK/INSTAGRAM_REDIRECT_URI` —
  `https://<NGROK_HOST>/api/auth/<provider>/callback`.
- `BLOB_READ_WRITE_TOKEN` — Read-Write token of the **dev** Blob store.
- `BLOB_WEBHOOK_PUBLIC_KEY` — webhook verification key of the **dev**
  store (the SDK refuses to mint presigned URLs without it).
- `VERCEL_BLOB_CALLBACK_URL` — `https://<NGROK_HOST>`. Without it the
  Blob service has no callback target locally and `Media` rows are never
  created (the SDK only falls back to Vercel-provided origins on
  `VERCEL=1`).
- `ADMIN_EMAILS` — operator email; admin is this allowlist, no DB flag.

## 4. Prisma / DB

```bash
npx prisma validate
npx prisma generate
```

How to confirm the target before any write: compare the `HOST=` of
`DATABASE_URL_POSTGRES_PRISMA_URL` against the known development
endpoint; it must never be the `main` endpoint. `migrate diff
--from-url <dev-url> --to-schema-datamodel` must be empty (currently one
known optimization-only delta: `SocialAccount_userId_idx`, harmless).
Never `migrate reset`, never `db push` against `main`/Production.

## 5. Run the app

Terminal 1:
```bash
npm run dev      # http://localhost:3000 — the app always runs here
```

`dev` / `dev:local` run on **webpack**, not Next 16's Turbopack default
(`next dev --webpack` under the hood). Turbopack has an outstanding
upstream Windows bug where it fails to load a project's
`postcss.config.mjs` (`Cannot find module '@vercel/turbopack/postcss'`,
every page 500s) — see
[vercel/next.js#63755](https://github.com/vercel/next.js/issues/63755) and
[vercel/next.js#96619](https://github.com/vercel/next.js/issues/96619).
Webpack has no such issue here, so it is the default for everyone until
that's fixed upstream. macOS/Linux contributors who want Turbopack's
faster HMR can still run `npx next dev --turbopack` directly.

## 6. ngrok (only for OAuth/social flows)

Terminal 2:
```bash
npm run dev:tunnel   # ngrok http 3000
```

Open the app through `https://<NGROK_HOST>` for anything touching
OAuth, sessions across origins, or provider callbacks. Plain local pages
work on `http://localhost:3000` directly.

## 7. OAuth callback configuration

Register `https://<NGROK_HOST>/api/auth/<provider>/callback` for
X / Threads / TikTok / Instagram **in addition to** the production
`https://postvia.online/...` entries (never replace those). After a
provider redirects back, the app returns to the ngrok origin — never to
`https://localhost` (see `src/lib/oauth-redirect.ts`); Google OAuth is
not part of the social smoke flow.

## 8. Local Blob configuration

Local uploads use the dev store only (`BLOB_READ_WRITE_TOKEN` +
`BLOB_WEBHOOK_PUBLIC_KEY` + `VERCEL_BLOB_CALLBACK_URL` above). The
browser flow: `POST /api/media/prepare` → presigned URL from
`/api/media/upload` → `PUT` to Blob → `upload-completed` webhook back
through ngrok → `Media` row. Production uses its platform-injected
binding to the prod store; the two stores never mix.

## 9. Development Neon branch

One database per environment (`postvia-db` project): `main` →
Production, `development` → local. The `development` branch was forked
from `main` **with data**, then wiped of copied users/OAuth tokens and
given one clean local admin. Never point local env at `main`; never run
destructive operations against it.

## 10. Local admin via ADMIN_EMAILS

Create the operator user through the normal email-OTP signup, then log
in — admin surfaces (`/billing` panel, billing test overrides) unlock
by email match. No code or DB flag involved.

## 11. Testing media

Upload an image and a video through the composer: prepare → presigned →
PUT → webhook → `Media` row appears (poll `/api/media/status`). Without
`VERCEL_BLOB_CALLBACK_URL` the row never appears (expected failure).

## 12. Testing social publishing

Connect test accounts on `/accounts`, publish per platform. Current
verified behavior: Threads video/text, Instagram photo/Reel, TikTok
video (`FILE_UPLOAD`) and photo (`PULL_FROM_URL` bridge). TikTok uses
the global post text as its caption by default; a custom title or photo
description is optional per target. X needs funded API credits —
depleted credits surface top-up guidance, not reconnect guidance.

## 13. Stopping / restarting dev

Stop both terminals (`Ctrl+C`). `npm run dev` re-reads `.env.local` on
every start — restart it after any env change. Never kill a shared
process you did not start.

## 14. Troubleshooting

- `Failed to retrieve the presigned URL` → check server log: missing
  `BLOB_READ_WRITE_TOKEN` (`No blob credentials found`) or missing
  `BLOB_WEBHOOK_PUBLIC_KEY` (`Missing webhook public key`).
- Media row never appears → `VERCEL_BLOB_CALLBACK_URL` missing or ngrok
  agent down (webhook cannot reach localhost).
- OAuth lands on `https://localhost...` → stale code; current callbacks
  resolve the forwarded host (see `src/lib/oauth-redirect.ts`).
- `POST /api/posts` 500 with no detail → server log now carries the
  cause (`reportError("posts", ...)`); historically: missing
  `Post.clientOperationId` column (schema drift, fixed by migration).
- Wrong database → compare URL host against the known development
  endpoint before any write; abort on mismatch.
- `Cannot find module '@vercel/turbopack/postcss'`, every page 500s
  (`Error evaluating Node.js code` on `globals.css`) → you ran raw
  `next dev` / `npx next dev` instead of `npm run dev`, so it picked up
  Next 16's Turbopack default and hit the Windows bug from §5. Use
  `npm run dev` (or `npx next dev --webpack` if you need the flag
  by hand).
