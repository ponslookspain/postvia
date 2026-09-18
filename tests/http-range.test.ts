/**
 * Range resolution for private media delivery (P1.8).
 *
 * The route previously returned 200 alongside a Content-Range header, which
 * is not a valid partial response — a browser treats the partial body as the
 * complete entity, so video seeking silently truncates. These cases pin the
 * 200 / 206 / 416 split and the exact Content-Range arithmetic.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  rangeLength,
  resolveRange,
  toRangeHeader,
} from "../src/lib/http-range";

const SIZE = 1000;

describe("resolveRange — no range means the whole entity", () => {
  test("a missing header serves the full body", () => {
    assert.deepEqual(resolveRange(null, SIZE), { kind: "full" });
    assert.deepEqual(resolveRange(undefined, SIZE), { kind: "full" });
    assert.deepEqual(resolveRange("", SIZE), { kind: "full" });
  });

  test("unsupported syntax is ignored rather than rejected", () => {
    // RFC 9110 permits ignoring a Range the server does not support. A 416
    // here would break clients that send a multi-range speculatively.
    for (const header of [
      "bytes=0-9,20-29", // multi-range
      "items=0-9", // non-byte unit
      "bytes=abc-def",
      "bytes=",
      "garbage",
      "bytes=1-2-3",
    ]) {
      assert.deepEqual(
        resolveRange(header, SIZE),
        { kind: "full" },
        `"${header}" should degrade to a full response`
      );
    }
  });
});

describe("resolveRange — satisfiable ranges are 206", () => {
  test("a closed range keeps both bounds", () => {
    const range = resolveRange("bytes=0-499", SIZE);
    assert.deepEqual(range, {
      kind: "partial",
      start: 0,
      end: 499,
      contentRange: "bytes 0-499/1000",
    });
  });

  test("an open-ended range runs to the last byte", () => {
    assert.deepEqual(resolveRange("bytes=500-", SIZE), {
      kind: "partial",
      start: 500,
      end: 999,
      contentRange: "bytes 500-999/1000",
    });
  });

  test("a suffix range takes the final N bytes", () => {
    assert.deepEqual(resolveRange("bytes=-200", SIZE), {
      kind: "partial",
      start: 800,
      end: 999,
      contentRange: "bytes 800-999/1000",
    });
  });

  test("a suffix longer than the entity clamps to the whole entity", () => {
    assert.deepEqual(resolveRange("bytes=-5000", SIZE), {
      kind: "partial",
      start: 0,
      end: 999,
      contentRange: "bytes 0-999/1000",
    });
  });

  test("an end past the last byte clamps instead of erroring", () => {
    assert.deepEqual(resolveRange("bytes=900-99999", SIZE), {
      kind: "partial",
      start: 900,
      end: 999,
      contentRange: "bytes 900-999/1000",
    });
  });

  test("a single-byte range is valid", () => {
    assert.deepEqual(resolveRange("bytes=0-0", SIZE), {
      kind: "partial",
      start: 0,
      end: 0,
      contentRange: "bytes 0-0/1000",
    });
  });

  test("the last byte is reachable", () => {
    assert.deepEqual(resolveRange("bytes=999-999", SIZE), {
      kind: "partial",
      start: 999,
      end: 999,
      contentRange: "bytes 999-999/1000",
    });
  });

  test("surrounding whitespace is tolerated", () => {
    const range = resolveRange("  bytes=0-9  ", SIZE);
    assert.equal(range.kind, "partial");
  });
});

describe("resolveRange — unsatisfiable ranges are 416", () => {
  test("a start at the entity length is unsatisfiable", () => {
    assert.deepEqual(resolveRange("bytes=1000-1200", SIZE), {
      kind: "unsatisfiable",
      contentRange: "bytes */1000",
    });
  });

  test("a start past the entity is unsatisfiable", () => {
    assert.deepEqual(resolveRange("bytes=5000-", SIZE), {
      kind: "unsatisfiable",
      contentRange: "bytes */1000",
    });
  });

  test("an inverted range is unsatisfiable", () => {
    assert.deepEqual(resolveRange("bytes=500-100", SIZE), {
      kind: "unsatisfiable",
      contentRange: "bytes */1000",
    });
  });

  test("a zero-length suffix is unsatisfiable", () => {
    assert.deepEqual(resolveRange("bytes=-0", SIZE), {
      kind: "unsatisfiable",
      contentRange: "bytes */1000",
    });
  });

  test("any range against an empty entity is unsatisfiable", () => {
    assert.equal(resolveRange("bytes=0-10", 0).kind, "unsatisfiable");
    assert.equal(resolveRange("bytes=-10", 0).kind, "unsatisfiable");
  });
});

describe("resolveRange — defensive input", () => {
  test("a nonsensical entity size degrades to a full response", () => {
    assert.deepEqual(resolveRange("bytes=0-9", Number.NaN), { kind: "full" });
    assert.deepEqual(resolveRange("bytes=0-9", -1), { kind: "full" });
  });

  test("bounds beyond the safe-integer range are ignored, never trusted", () => {
    assert.deepEqual(
      resolveRange("bytes=99999999999999999999-", SIZE),
      { kind: "full" },
      "an unparseable bound must not become a negative offset"
    );
  });
});

describe("derived helpers", () => {
  test("rangeLength is inclusive of both bounds", () => {
    const range = resolveRange("bytes=0-499", SIZE);
    assert.equal(range.kind, "partial");
    if (range.kind !== "partial") return;
    assert.equal(rangeLength(range), 500);
    assert.equal(rangeLength({ ...range, start: 7, end: 7 }), 1);
  });

  test("the upstream Range header reflects the CLAMPED bounds", () => {
    // The store must be asked for what we promise to deliver, so an
    // over-long client range never produces a Content-Length mismatch.
    const range = resolveRange("bytes=900-99999", SIZE);
    assert.equal(range.kind, "partial");
    if (range.kind !== "partial") return;
    assert.equal(toRangeHeader(range), "bytes=900-999");
    assert.equal(rangeLength(range), 100);
  });

  test("Content-Length and Content-Range always agree", () => {
    for (const header of [
      "bytes=0-499",
      "bytes=500-",
      "bytes=-200",
      "bytes=0-0",
      "bytes=900-99999",
    ]) {
      const range = resolveRange(header, SIZE);
      assert.equal(range.kind, "partial", header);
      if (range.kind !== "partial") continue;
      const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(range.contentRange)!;
      const declared = Number(match[2]) - Number(match[1]) + 1;
      assert.equal(declared, rangeLength(range), header);
    }
  });
});
