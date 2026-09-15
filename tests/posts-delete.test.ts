import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  applyPostDeleted,
  type PostListItem,
} from "../src/app/posts/PostsList";

function item(id: string, status = "DRAFT"): PostListItem {
  return {
    id,
    text: `post ${id}`,
    status,
    createdAt: new Date("2026-09-10T12:00:00Z").toISOString(),
    scheduledAt: null,
    publishedAt: null,
    targets: [],
    media: [],
    mediaCount: 0,
  };
}

/**
 * Delete UX: a successful DELETE removes the row from the current
 * status-filtered list immediately (no page reload). The client list
 * is seeded once from server props, so router.refresh() alone leaves
 * it stale — applyPostDeleted is the immediate merge.
 */
describe("applyPostDeleted", () => {
  test("removes the deleted post and decrements the total", () => {
    const current = [item("p1"), item("p2"), item("p3")];
    const next = applyPostDeleted(current, 3, "p2");
    assert.deepEqual(
      next.items.map((post) => post.id),
      ["p1", "p3"]
    );
    assert.equal(next.total, 2);
  });

  test("works within a status-filtered view", () => {
    const current = [item("p1", "DRAFT"), item("p2", "DRAFT")];
    const next = applyPostDeleted(current, 2, "p1");
    assert.deepEqual(
      next.items.map((post) => post.id),
      ["p2"]
    );
    assert.equal(next.total, 1);
  });

  test("unknown id leaves items and total untouched", () => {
    const current = [item("p1"), item("p2")];
    const next = applyPostDeleted(current, 2, "missing");
    assert.equal(next.items, current);
    assert.equal(next.total, 2);
  });

  test("total never goes negative", () => {
    const next = applyPostDeleted([item("p1")], 0, "p1");
    assert.deepEqual(
      next.items.map((post) => post.id),
      []
    );
    assert.equal(next.total, 0);
  });
});
