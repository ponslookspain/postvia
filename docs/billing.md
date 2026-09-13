# Billing

## Plans (`src/lib/plans.ts` — single source of truth)

| Plan | Price | Accounts/platform | Posts/month | Bulk |
|---|---|---|---|---|
| Free | $0 | 1 | 15 | no |
| Growth | $20 | 5 | 300 | ≤10 videos |
| Scale | $50 | unlimited | unlimited | ≤10 videos |

No `Subscription` row means active Free. `applyPeriodRules`
(`src/lib/entitlements.ts`): `CANCELED` → Free; `UNPAID` → Free with an
`UNPAID` status (no paid entitlements, lifecycle-distinct from `CANCELED`
so recovery can reactivate the same subscription); past
`cancelAtPeriodEnd` → `EXPIRED` (Free); `cancelAtPeriodEnd` without any
period end fails closed to `EXPIRED` (never an indefinite paid plan);
`PAST_DUE` keeps the paid plan flagged; `CANCELLING` keeps the plan until
period end. Cancellation never cuts access early: the paid plan runs to
`currentPeriodEnd`, then the effective plan drops to Free. Unknown plan
codes fall back to Free (`toPlanIdSafe`). `resolveEffectiveFromRows`
merges subscription + admin override (override consulted **only** for
admin emails).

## Stripe flows

- `POST /api/billing/checkout`: validates plan (Growth/Scale only), runs
  under a per-user advisory lock, routes any live paid stake
  (active/past-due/unpaid/cancelling, locally or live in Stripe — covers
  the webhook-pending window) to the portal (`USE_PORTAL`), reuses/creates
  the Stripe customer (stashes the id on a `FREE` row — plan writes belong
  to the webhook), expires prior open Checkout Sessions, then creates the
  session with `metadata.userId`. Canceled/expired rows and abandoned
  pending rows may start a fresh checkout. Test keys without explicit test
  prices refuse checkout instead of touching live prices.
- `POST /api/billing/portal`: Customer Portal for plan changes,
  cancellation and payment-method updates (never writes rows itself).
  Upgrades/downgrades go through the portal; proration follows the Stripe
  Dashboard portal configuration.
- `POST /api/billing/webhook`: the **only authoritative writer** of paid
  `Subscription` state (plan, status, period end, cancel flag). Verifies
  the signature (`STRIPE_WEBHOOK_SECRET`), claims idempotency first
  (`StripeEvent.eventId`, duplicates acked), then applies subscription
  created/updated/deleted through ordering + mismatch + ownership guards
  (`lastStripeEventCreated`: an older restatement applies as a no-op;
  an older/tied delivery that would regress state is decided by the live
  Stripe object; same-second different-Event-ID ties are deterministic —
  identical state applies, regressing state without Stripe reachability
  throws for redelivery (500 + claim release) instead of guessing; a
  different `stripeSubId` is verified against the live Stripe object
  before replacing; confused customer/metadata bindings are rejected with
  no grant). Invoice events are telemetry only (`invoice-telemetry`) and
  never write state — renewals, failures and recoveries all arrive as
  subscription events too. Unknown prices/statuses/users grant nothing and
  never write.
- `GET /billing?checkout=success`: one-shot on-demand reconciliation reads
  the live Stripe subscription through the same guarded writer (no polling;
  the query param itself never grants access). Until authoritative state
  lands, the page shows a processing state, never paid access.
- `POST /api/billing/change` / `POST /api/billing/cancel`: **admin-only**
  testing tools (403 first). Change upserts `ACTIVE +30d`; cancel sets
  `cancelAtPeriodEnd` without deleting. Real changes go through Stripe.
- `DELETE /api/settings/account`: durable Stripe cancellation before data
  wipe, so no orphan subscription keeps billing. The wipe is blocked with
  500 until the subscription is confirmed canceled (already-terminal and
  verifiably-gone objects count as canceled; an unreachable Stripe blocks
  instead of wiping). Later webhooks resolve to no user and grant nothing.

## Admin sandbox

`ADMIN_EMAILS` + `BillingTestOverride`: `BYPASS` (unlimited Scale-like) or
`ENFORCEMENT` of a chosen plan/status, with cancellation/expiration
simulation on `/billing`. Never consulted for non-admins; the webhook
never reads or writes it.

## Abuse interaction

Paid plans and the admin bypass never touch the identity-level Free ledger
(`AbuseFreeUsage`): each paid subscription keeps its own per-user limits.
Social-account *ownership* constraints still apply to paid users. Growth
limit denials carry `upgradeTo: null` by type design (`Exclude<PlanId,
"scale">`); Scale is top and returns null.
