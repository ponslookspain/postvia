-- Batch 2 audit indexes (read-only planner change, no data touched).
-- Additive only: plain btree indexes backing hot-path lookups —
-- webhook/reconciliation by Stripe ids, monthly quota count, calendar
-- ranges, account-delete/settings reads. Safe to apply on a live
-- database (concurrent reads/writes unaffected; brief write lock while
-- each index builds).
CREATE INDEX "Subscription_stripeSubId_idx" ON "Subscription"("stripeSubId");
CREATE INDEX "Subscription_stripeCustomerId_idx" ON "Subscription"("stripeCustomerId");
CREATE INDEX "Post_userId_createdAt_idx" ON "Post"("userId", "createdAt");
CREATE INDEX "Post_userId_scheduledAt_idx" ON "Post"("userId", "scheduledAt");
CREATE INDEX "Post_userId_publishedAt_idx" ON "Post"("userId", "publishedAt");
CREATE INDEX "Account_userId_idx" ON "Account"("userId");
CREATE INDEX "Session_userId_idx" ON "Session"("userId");
