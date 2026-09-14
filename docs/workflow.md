# Development & release workflow

How Postvia gets from a local edit to `postvia.online`, and what OpenCode
may / may not do on the way. This file is the process contract. Technical
details live in the sibling docs (auth, deployment, environment, database,
security).

## Model: local-first

```
LOCAL EDIT
→ LOCAL TEST
→ optional Cloudflare HTTPS/OAuth TEST
→ COMMIT
→ PUSH FEATURE/STAGING
→ GITHUB PR
→ REVIEW
→ MERGE MAIN
→ MANUAL PRODUCTION RELEASE
```

- **Local development is the primary loop.** Edit, run checks, and verify
  in the browser locally. A Vercel Preview deployment is NOT a required
  step of daily development and must NOT be built for every push.
- **Vercel is the release platform, not a mandatory preview
  environment.** Production is NEVER released automatically from a merge
  or push — it requires a separate, explicit manual release action after
  an accepted PR.
- **Vercel Git deployment triggers are configured in the Vercel Project
  settings, outside the repository.** Neither the code nor these docs can
  disable automatic deployments by themselves. The required dashboard
  policy: no automatic Preview builds for feature/staging branches, no
  automatic Production releases from `main`.

## Levels

- **Local project** — the working copy on your machine. This is the only
  place OpenCode works: reads/edits local files, runs
  `npm run typecheck/lint/test/build` here.
- **Local dev server** — `npm run dev` (`http://localhost:3000`). The main
  dev server. Never run it as a long-lived foreground process inside an
  automated OpenCode task; use short-lived checks.
- **Cloudflare Quick Tunnel** — `npm run dev:tunnel`
  (`cloudflared tunnel --url http://localhost:3000`). Used ONLY when an
  external public HTTPS origin is needed (OAuth callbacks, social
  integration testing — see `docs/local-social-dev.md`). The tunnel URL is
  temporary and changes on restart; it never replaces Production.
- **Git** — versions the project. Development happens on `staging/*` /
  feature branches, never directly on `main`.
- **GitHub PR** — the review gate. No code reaches `main` without an
  accepted Pull Request + review.
- **Production** — served at `postvia.online`, released manually after a
  merged PR. Never automatic.

## Standard daily workflow

1. Open the project, run `opencode`.
2. Give OpenCode the task.
3. OpenCode studies the code, implements, and runs the relevant checks
   locally (`prisma validate/generate`, `typecheck`, `lint`, `test`,
   `build`), fixing failures.
4. Verify locally in a browser: `http://localhost:3000`, plus the tunnel
   origin when the task needs external HTTPS/OAuth.
5. OpenCode commits and pushes the staging/feature branch.
6. **OpenCode stops after the push and hands you a report.**
7. You open the GitHub Pull Request, it gets reviewed, then merged to
   `main`.
8. Production release happens separately, as an explicit manual action —
   never as a side effect of the merge.
9. Bug found → back to OpenCode → fix → checks → commit → push → new PR
   review cycle.

## Critical OpenCode rule

**By default OpenCode always stops after pushing the feature/staging
branch with green local checks.**

Without your explicit approval OpenCode must NOT:

- merge to `main`, push to `main`;
- open or merge Pull Requests by itself;
- release to Production, `vercel --prod`, `vercel deploy`;
- change Production Environment Variables or the Production DB;
- run destructive production actions.

## Production release

Recommended (keeps GitHub `main` in sync with Production):

```
staging/feature → local verification → PR → review → merge to main
→ explicit MANUAL production deployment → postvia.online
```

The exact release action (Vercel dashboard deploy / promote) is performed
by you, deliberately, after the merge — it is not triggered by Git.

## The "ship it" command

When you say "готово, выпускай в production" / "отправляй в прод" /
"можно в production", OpenCode must first:

- report current branch, HEAD, clean working tree;
- confirm local checks are green and the PR is merged;
- state which explicit manual release action will be used.

Production release needs your explicit confirmation **after** that
summary. OpenCode never ships silently.

## Environments (presence only — never values)

- **Local** (`.env.local`, `.env`): `DATABASE_URL_POSTGRES_PRISMA_URL`,
  `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID/SECRET`, provider keys,
  `RESEND_API_KEY`, `ABUSE_HASH_PEPPER`, `ADMIN_EMAILS`,
  `BETTER_AUTH_TRUSTED_ORIGINS` (tunnel origin). See
  `docs/environment.md` for the full table.
- **Vercel** (dashboard only, per-environment as needed): `DATABASE_*`,
  `BETTER_AUTH_SECRET`, `RESEND_API_KEY`, `ABUSE_HASH_PEPPER`, Blob,
  Stripe keys, `ADMIN_EMAILS`. Google/Stripe keys are Production-only
  unless you deliberately configure them elsewhere (then redirect URIs
  and prices must match that environment's host).
- **Production** (Vercel): full set, per-environment Stripe keys.

Adding/changing a Vercel Environment Variable normally requires a new
deployment (or Redeploy) before it applies. Never `vercel env pull`
blindly over local files, and never print secret values.

## Vercel workflow

- Feature/staging work is verified locally (+ tunnel when needed), then
  pushed for PR review. No `vercel deploy` in the normal cycle; no
  `vercel --prod` outside an explicitly approved manual release.
- Preview deployments are optional and off the default path. If one ever
  exists, it may sit behind Vercel Authentication (SSO): that is expected
  and does not mean the app is broken.

## Database safety

Preview/optional-remote and Production can share one Neon database, so any
remote testing with real data needs care:

- Test users are deleted only individually (`scripts/cleanup-test-users.ts`
  with explicit `--email`), never by mass cleanup without approval.
- `ponslookdesign@gmail.com` is never deleted, by anyone or any script.
- No production destructive operations. Schema changes are additive-only
  (see `docs/deployment.md`); anti-abuse and Stripe tables are not
  touched by auth changes.

## Auth / billing verification checklist (workflow references)

After auth-impacting changes, the local check covers (details in
`docs/auth.md`, `docs/billing.md`, `docs/abuse-protection.md`):

- new user: email → OTP → onboarding → Free → dashboard;
- new user: email → OTP → onboarding → paid → billing;
- password user: email + password → dashboard;
- password user via code: email → Sign in with a code → OTP → dashboard;
- passwordless user: email → OTP → dashboard;
- Google: new → onboarding, existing → dashboard (needs the callback
  registered + matching Google keys for a live test; Google is NOT part
  of the local social smoke flow — see `docs/local-social-dev.md`);
- Settings: create password / change password (old fails, new works);
- abandoned onboarding resumes after re-login;
- OTP security: expiry, wrong code, replay, attempt lockout, resend limit;
- abuse: duplicate/disposable/unknown emails stay neutral; no new Free
  quota; tombstones intact; no enumeration oracle.
