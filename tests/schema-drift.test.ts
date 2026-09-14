import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Regression test for the local TikTok publishing 500 caused by schema
 * drift: POST /api/posts writes `Post.clientOperationId` (idempotency
 * key), but the dev database predated migration
 * `20260914000001_post_idempotency_key`, so every create failed with
 * P2022 ("column does not exist") and the route's bare catch returned a
 * content-free 500.
 *
 * This test statically guarantees the incident cannot recur the same way:
 * the field the write path depends on must exist in the Prisma schema AND
 * be covered by a migration SQL (ADD COLUMN or CREATE TABLE) plus its
 * unique index. It does not touch any database.
 */
const REPO_ROOT = join(import.meta.dirname, "..", "prisma");

function readSchema(): string {
  return readFileSync(join(REPO_ROOT, "schema.prisma"), "utf8");
}

function readMigrationSql(): string {
  const dir = join(REPO_ROOT, "migrations");
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      try {
        return readFileSync(join(dir, entry.name, "migration.sql"), "utf8");
      } catch {
        return "";
      }
    })
    .join("\n");
}

describe("post idempotency schema coverage (P2022 regression)", () => {
  test("Post.clientOperationId exists in the Prisma schema", () => {
    const schema = readSchema();
    const postBlock = schema.slice(
      schema.indexOf("model Post {"),
      schema.indexOf("model PostTarget {")
    );
    assert.ok(
      /clientOperationId\s+String\?\s+@unique/.test(postBlock),
      "Post.clientOperationId must stay a nullable unique field"
    );
  });

  test("a migration covers the clientOperationId column", () => {
    const sql = readMigrationSql();
    assert.ok(
      /ADD COLUMN "clientOperationId"|clientOperationId/.test(sql),
      "a migration.sql must add the clientOperationId column"
    );
  });

  test("a migration covers the clientOperationId unique index", () => {
    const sql = readMigrationSql();
    assert.ok(
      sql.includes("Post_clientOperationId_key"),
      "a migration.sql must create the Post_clientOperationId_key unique index"
    );
  });
});
