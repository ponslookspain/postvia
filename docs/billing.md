# Billing

## Plans (`src/lib/plans.ts` — single source of truth)

| Plan | Price | Accounts/platform | Posts/month | Bulk |
|---|---|---|---|---|
| Free | $0 | 1 | 15 | no |
| Growth | $20 | 5 | 300 | ≤10 videos |
| Scale | $50 | unlimited | unlimited | ≤10 videos |

No `Subscription` row means active Free. `applyPeriodRules`
(`src/lib/entitlements.ts`): `CANCELED` → Free; past
`cancelAtPeriodEnd` → `EXPIRED` (Free); `PAST_DUE` keeps the paid plan;
`CANCELLING` keeps the plan until period end. Unknown plan codes fall back
to Free (`toPlanIdSafe`). `resolveEffectiveFromRows` merges subscription +
admin override (override consulted **only** for admin emails).

## Stripe flows

- `POST /api/billing/checkout`: validates plan (Growth/Scale only; active
  subscribers are sent to the portal), reuses/creates the Stripe customer
  (stashes the id on a `FREE` row — plan writes belong to the webhook),
  creates the Checkout session with `metadata.userId`. Test keys without
  explicit test prices refuse checkout instead of touching live prices.
- `POST /api/billing/portal`: Customer Portal for plan changes and
  cancellation (never writes rows itself).
- `POST /api/billing/webhook`: the **only writer** of paid `Subscription`
  state. Verifies the signature (`STRIPE_WEBHOOK_SECRET`), claims
  idempotency first (`StripeEvent.eventId`, duplicates acked), applies
  subscription created/updated/deleted + `invoice.payment_succeeded/failed`
  snapshots. Unknown statuses/plans grant nothing and never write.
- `POST /api/billing/change` / `POST /api/billing/cancel`: **admin-only**
  testing tools (403 first). Change upserts `ACTIVE +30d`; cancel sets
  `cancelAtPeriodEnd` without deleting. Real changes go through Stripe.

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
