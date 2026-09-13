-- Abuse audit trail (best-effort telemetry, no PII, never blocks enforcement).
-- Existing rows untouched; new table only.
CREATE TYPE "AbuseEventKind" AS ENUM ('CREATED', 'MERGED', 'SIGNAL', 'TOMBSTONE_HIT', 'RISK', 'LINK_DENY', 'POST_DENY');

CREATE TABLE "AbuseEvent" (
  "id" TEXT NOT NULL,
  "identityId" TEXT,
  "kind" "AbuseEventKind" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AbuseEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AbuseEvent_identityId_idx" ON "AbuseEvent"("identityId");
CREATE INDEX "AbuseEvent_createdAt_idx" ON "AbuseEvent"("createdAt");
