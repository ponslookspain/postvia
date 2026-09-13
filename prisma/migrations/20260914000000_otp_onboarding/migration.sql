-- OTP onboarding gate + server-side plan intent.
-- Additive only: two new User columns, no existing column/index touched,
-- no table dropped. Safe to apply on a live database.
ALTER TABLE "User" ADD COLUMN "onboardingCompleted" BOOLEAN NOT NULL DEFAULT false;

-- Reuses the existing "Plan" enum (FREE/GROWTH/SCALE). Nullable: NULL means
-- "no intent recorded yet" (pre-existing users, direct dashboard users).
ALTER TABLE "User" ADD COLUMN "selectedPlan" "Plan";

-- Backfill: every already-verified user (including the admin) skips the new
-- onboarding. New OTP users are created with onboardingCompleted=false and
-- are unaffected by this statement (it runs once, at migrate time).
UPDATE "User" SET "onboardingCompleted" = true WHERE "emailVerified" = true;
