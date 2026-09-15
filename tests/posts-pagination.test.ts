import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  createdBeforeWhere,
  paginateByCursor,
  parseListPagination,
  POST_PAGE_DEFAULT,
  POST_PAGE_MAX,
} from "../src/lib/pagination";

/**
 * Cursor pagination for the posts list (B6): bounded pages, stable
 * keyset order, defensive params. No database needed.
 */
describe("parseListPagination", () => {
  test("defaults to the first page", () => {
    assert.deepEqual(parseListPagination({}), {
      limit: POST_PAGE_DEFAULT,
      cursor: null,
    });
    assert.deepEqual(parseListPagination({ limit: "", cursor: "" }), {
      limit: POST_PAGE_DEFAULT,
      cursor: null,
    });
  });

  test("accepts numeric and string limits, clamps the range", () => {
    assert.equal(parseListPagination({ limit: 10 }).limit, 10);
    assert.equal(parseListPagination({ limit: "25" }).limit, 25);
    assert.equal(parseListPagination({ limit: 0 }).limit, 1);
    assert.equal(parseListPagination({ limit: -5 }).limit, 1);
    assert.equal(parseListPagination({ limit: 2.7 }).limit, 2);
    assert.equal(
      parseListPagination({ limit: POST_PAGE_MAX + 500 }).limit,
      POST_PAGE_MAX
    );
    assert.equal(parseListPagination({ limit: "garbage" }).limit, POST_PAGE_DEFAULT);
    assert.equal(parseListPagination({ limit: Number.NaN }).limit, POST_PAGE_DEFAULT);
  });

  test("passes cursor ids through, drops empties", () => {
    assert.equal(parseListPagination({ cursor: "cuid123" }).cursor, "cuid123");
    assert.equal(parseListPagination({ cursor: 42 }).cursor, null);
  });
});

describe("createdBeforeWhere", () => {
  test("builds a strictly-before keyset predicate", () => {
    const at = new Date("2026-09-10T12:00:00Z");
    assert.deepEqual(createdBeforeWhere(at, "abc"), {
      OR: [{ createdAt: { lt: at } }, { createdAt: at, id: { lt: "abc" } }],
    });
  });
});

describe("paginateByCursor", () => {
  const rows = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ id: `p${i}` }));

  test("short result sets have no next cursor", () => {
    assert.deepEqual(paginateByCursor(rows(3), 50), {
      page: rows(3),
      nextCursor: null,
    });
    assert.deepEqual(paginateByCursor([], 50), { page: [], nextCursor: null });
  });

  test("exact-limit result sets have no next cursor", () => {
    const { page, nextCursor } = paginateByCursor(rows(50), 50);
    assert.equal(page.length, 50);
    assert.equal(nextCursor, null);
  });

  test("overflow rows prove another page and yield the last id", () => {
    const { page, nextCursor } = paginateByCursor(rows(51), 50);
    assert.equal(page.length, 50);
    assert.equal(nextCursor, "p49");
  });
});
