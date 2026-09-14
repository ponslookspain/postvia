-- Schedule/bulk idempotency key on Post.
-- Additive only: one nullable column + one unique index, no existing
-- column/index touched, no table dropped. Safe to apply on a live database.
-- Existing rows keep NULL (Postgres unique indexes treat NULLs as distinct,
-- so no backfill and no conflict are possible).
ALTER TABLE "Post" ADD COLUMN "clientOperationId" TEXT;

CREATE UNIQUE INDEX "Post_clientOperationId_key" ON "Post"("clientOperationId");
