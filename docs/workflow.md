# Development & release workflow

How Postvia gets from a local edit to `postvia.online`, and what OpenCode
may / may not do on the way. Technical details live in the sibling docs
(auth, deployment, environment, database, security); this file is the
process contract.

## Levels

- **Local project** — `C:\Users\Ponslookspain\Desktop\Postvia`. This is the
  only working copy. OpenCode runs from the project root and reads/edits
  local files. `npm run typecheck/lint/test/build` runs here.
- **Git** — versions the project. Development happens on `staging/*` /
  feature branches, never directly on `main`.
- **Vercel Preview** — every push to a staging/feature branch automatically
  builds a Preview deployment. Preview is for integration and visual
  testing. It is not a folder and not a substitute for Git.
- **Production** — built from `main` only, served at `postvia.online`.

Standard path:

```
staging/feature branch → commit → push → Vercel Preview → manual check
→ Pull Request → review → merge to main → Vercel Production → postvia.online
```

## Local folder role

- OpenCode works locally in the project root: reads code, implements,
  runs checks, commits, pushes the staging/feature branch.
- `npm run dev` is a **local-only** dev server (`http://localhost:3000`).
  Never run it as a long-lived foreground process inside an automated
  OpenCode task; use short-lived checks or verify on Vercel Preview.
- `.env.local` / `.env` belong to the local environment. Vercel
  Environment Variables belong to remote Preview/Production and are
  managed in the Vercel dashboard (or `vercel env`), never by editing
  local files. Never commit real values — see `docs/environment.md`.

## Standard daily workflow

1. Open the project: `cd C:\Users\Ponslookspain\Desktop\Postvia`, run `opencode`.
2. Give OpenCode the task.
3. OpenCode studies the code, implements, runs the relevant checks, fixes
   failures, commits, pushes the staging/feature branch.
4. Vercel automatically builds a Preview.
5. OpenCode verifies branch, commit SHA, deployment state, Preview URL,
   and build/runtime errors when needed.
6. **OpenCode stops after a ready Preview and hands you a report.**
7. You manually verify the Preview in a browser.
8. Bug found → back to OpenCode → fix → checks → commit → push → new Preview.
9. Preview verified → separate Production release workflow begins.

## Critical OpenCode rule

**By default OpenCode always stops after a successful Preview deployment.**

Without your explicit approval OpenCode must NOT:

- merge to `main`, push to `main`;
- Promote to Production, `vercel --prod`;
- change Production Environment Variables or the Production DB;
- run destructive production actions.

## Production release

Recommended (keeps GitHub `main` in sync with Production):

```
staging/feature → Preview → manual verification → Pull Request
→ merge to main → Vercel Production
```

Alternative: promote a Preview deployment to Production from the Vercel
dashboard. This is **not** the Postvia default: it can ship a deployment
without merging its changes into `main`, leaving Git and Production out
of sync.

## The "ship it" command

When you say "готово, выпускай в production" / "отправляй в прод" /
"можно в production", OpenCode must first:

- report current branch, HEAD, clean working tree;
- identify the exact Preview deployment you verified;
- state which release mechanism will be used (prefer PR → `main` →
  Vercel Production).

Production release needs your explicit confirmation **after** that
summary. OpenCode never ships silently.

## Environments (presence only — never values)

- **Local** (`.env.local`, `.env`): `DATABASE_URL_POSTGRES_PRISMA_URL`,
  `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID/SECRET`, provider keys,
  `RESEND_API_KEY`, `ABUSE_HASH_PEPPER`, `ADMIN_EMAILS`. See
  `docs/environment.md` for the full table.
- **Preview** (Vercel): subset needed for testing — `DATABASE_*`,
  `BETTER_AUTH_SECRET`, `RESEND_API_KEY`, `ABUSE_HASH_PEPPER`, Blob.
  Google/Stripe keys are Production-only unless you deliberately add
  them for a Preview E2E (then Google redirect URIs and test prices
  must match that Preview host).
- **Production** (Vercel): full set, per-environment Stripe keys.

Adding/changing a Vercel Environment Variable normally requires a new
deployment (or Redeploy) before it applies. Never `vercel env pull`
blindly over local files, and never print secret values.

## Vercel workflow

- Push to staging/feature → automatic Preview. Push/merge to `main` →
  automatic Production. No manual `vercel deploy` for the normal cycle;
  no `vercel --prod` outside an explicitly approved release.
- Preview deployments may sit behind Vercel Authentication (SSO): that
  is expected and does not mean the app is broken.

## Database safety

Preview and Production can share one Neon database, so Preview testing
with real data needs care:

- Test users are deleted only individually (`scripts/cleanup-test-users.ts`
  with explicit `--email`), never by mass cleanup without approval.
- `ponslookdesign@gmail.com` is never deleted, by anyone or any script.
- No production destructive operations. Schema changes are additive-only
  (see `docs/deployment.md`); anti-abuse and Stripe tables are not
  touched by auth changes.

## Auth / billing verification checklist (workflow references)

After auth-impacting changes, the Preview check covers (details in
`docs/auth.md`, `docs/billing.md`, `docs/abuse-protection.md`):

- new user: email → OTP → onboarding → Free → dashboard;
- new user: email → OTP → onboarding → paid → billing;
- password user: email + password → dashboard;
- password user via code: email → Sign in with a code → OTP → dashboard;
- passwordless user: email → OTP → dashboard;
- Google: new → onboarding, existing → dashboard (needs Preview
  callback registered + Preview Google keys for a live test);
- Settings: create password / change password (old fails, new works);
- abandoned onboarding resumes after re-login;
- OTP security: expiry, wrong code, replay, attempt lockout, resend limit;
- abuse: duplicate/disposable/unknown emails stay neutral; no new Free
  quota; tombstones intact; no enumeration oracle.
