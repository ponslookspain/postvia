-- Billing guards: UNPAID status (paid access revoked, lifecycle-distinct
-- from CANCELED) + stale-webhook ordering cursor on Subscription.
--
-- Production discipline (see docs/deployment.md): the production database
-- carries no _prisma_migrations history (created with `prisma db push`).
-- Do NOT baseline it. Apply these two single-command statements in a
-- controlled way during low traffic, or `prisma db push` on empty/dev
-- databases only. Verify first with a read-only `migrate diff`.
-- NOTE: run each statement in its own transaction (plain psql statements,
-- never wrapped in BEGIN/COMMIT, never via `migrate deploy`): Postgres
-- forbids ALTER TYPE ... ADD VALUE inside a transaction block.
ALTER TYPE "SubscriptionStatus" ADD VALUE 'UNPAID';
ALTER TABLE "Subscription" ADD COLUMN "lastStripeEventCreated" INTEGER;
