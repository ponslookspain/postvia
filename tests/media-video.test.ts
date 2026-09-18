/**
 * Video container inspection (audit P2).
 *
 * Builds real ISO base media box structures rather than mocking the parser,
 * so the byte arithmetic (32- vs 64-bit sizes, mvhd v0 vs v1, faststart vs
 * trailing moov) is actually exercised.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  checkVideoDuration,
  isIsoBaseMediaMime,
  maxVideoDurationSeconds,
  probeIsoBaseMediaDuration,
} from "../src/lib/media-video";
import { verifyStoredVideo } from "../src/lib/media-upload";

/** `[size][type][payload]` with a 32-bit size. */
function box(type: string, payload: Uint8Array): Uint8Array {
  const size = 8 + payload.length;
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  view.setUint32(0, size);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(payload, 8);
  return out;
}

/** 64-bit extended-size box: `[1][type][largesize][payload]`. */
function largeBox(type: string, payload: Uint8Array): Uint8Array {
  const size = 16 + payload.length;
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  view.setUint32(0, 1);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  view.setBigUint64(8, BigInt(size));
  out.set(payload, 16);
  return out;
}

function mvhdV0(timescale: number, duration: number): Uint8Array {
  const payload = new Uint8Array(100);
  const view = new DataView(payload.buffer);
  view.setUint8(0, 0); // version 0
  view.setUint32(4, 0); // creation
  view.setUint32(8, 0); // modification
  view.setUint32(12, timescale);
  view.setUint32(16, duration);
  return box("mvhd", payload);
}

function mvhdV1(timescale: number, duration: number): Uint8Array {
  const payload = new Uint8Array(120);
  const view = new DataView(payload.buffer);
  view.setUint8(0, 1); // version 1
  view.setBigUint64(4, BigInt(0)); // creation
  view.setBigUint64(12, BigInt(0)); // modification
  view.setUint32(20, timescale);
  view.setBigUint64(24, BigInt(duration));
  return box("mvhd", payload);
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

const FTYP = box("ftyp", new Uint8Array([...Buffer.from("isomiso2avc1")]));

describe("probeIsoBaseMediaDuration — real box structures", () => {
  test("faststart layout: moov before mdat", () => {
    const file = concat(
      FTYP,
      box("moov", mvhdV0(1000, 42_000)),
      box("mdat", new Uint8Array(64))
    );
    assert.deepEqual(probeIsoBaseMediaDuration(file), {
      ok: true,
      durationSeconds: 42,
    });
  });

  test("mvhd version 1 (64-bit duration)", () => {
    const file = concat(FTYP, box("moov", mvhdV1(48_000, 48_000 * 90)));
    const probe = probeIsoBaseMediaDuration(file);
    assert.equal(probe.ok, true);
    if (!probe.ok) return;
    assert.equal(probe.durationSeconds, 90);
  });

  test("64-bit extended box size is honoured", () => {
    const file = concat(FTYP, largeBox("moov", mvhdV0(600, 3_600)));
    const probe = probeIsoBaseMediaDuration(file);
    assert.equal(probe.ok, true);
    if (!probe.ok) return;
    assert.equal(probe.durationSeconds, 6);
  });

  test("trailing moov (non-faststart) is found via the tail buffer", () => {
    const head = concat(FTYP, box("mdat", new Uint8Array(512)));
    const tail = box("moov", mvhdV0(1000, 12_500));
    // Head alone cannot resolve it...
    assert.deepEqual(probeIsoBaseMediaDuration(head), {
      ok: true,
      durationSeconds: null,
    });
    // ...but head + tail can.
    assert.deepEqual(probeIsoBaseMediaDuration(head, tail), {
      ok: true,
      durationSeconds: 12.5,
    });
  });

  test("fractional durations are preserved", () => {
    const file = concat(FTYP, box("moov", mvhdV0(30_000, 45_045)));
    const probe = probeIsoBaseMediaDuration(file);
    assert.equal(probe.ok, true);
    if (!probe.ok) return;
    assert.ok(Math.abs((probe.durationSeconds ?? 0) - 1.5015) < 1e-6);
  });
});

describe("probeIsoBaseMediaDuration — malformed input", () => {
  test("a zero-duration movie is rejected as unusable", () => {
    const file = concat(FTYP, box("moov", mvhdV0(1000, 0)));
    const probe = probeIsoBaseMediaDuration(file);
    assert.equal(probe.ok, false);
    if (probe.ok) return;
    assert.match(probe.error, /damaged|no playable content/i);
  });

  test("a zero timescale cannot yield a duration and stays undeterminable", () => {
    const file = concat(FTYP, box("moov", mvhdV0(0, 1000)));
    assert.deepEqual(probeIsoBaseMediaDuration(file), {
      ok: true,
      durationSeconds: null,
    });
  });

  test("a box claiming a size smaller than its header cannot loop forever", () => {
    const malformed = new Uint8Array(32);
    new DataView(malformed.buffer).setUint32(0, 2); // size 2 < header 8
    for (let i = 0; i < 4; i++) malformed[4 + i] = "moov".charCodeAt(i);
    // Must return, not hang.
    assert.deepEqual(probeIsoBaseMediaDuration(malformed), {
      ok: true,
      durationSeconds: null,
    });
  });

  test("truncated and empty buffers are undeterminable, not fatal", () => {
    assert.deepEqual(probeIsoBaseMediaDuration(new Uint8Array(0)), {
      ok: true,
      durationSeconds: null,
    });
    assert.deepEqual(probeIsoBaseMediaDuration(new Uint8Array([0, 0, 0])), {
      ok: true,
      durationSeconds: null,
    });
  });

  test("a valid container with no moov is allowed (fail-open)", () => {
    const file = concat(FTYP, box("mdat", new Uint8Array(128)));
    assert.deepEqual(probeIsoBaseMediaDuration(file), {
      ok: true,
      durationSeconds: null,
    });
  });

  test("a moov with no mvhd is allowed (fail-open)", () => {
    const file = concat(FTYP, box("moov", box("trak", new Uint8Array(16))));
    assert.deepEqual(probeIsoBaseMediaDuration(file), {
      ok: true,
      durationSeconds: null,
    });
  });
});

describe("checkVideoDuration — the optional cap", () => {
  test("no cap configured means nothing is ever rejected", () => {
    assert.deepEqual(checkVideoDuration(99_999, null), { ok: true });
  });

  test("an undeterminable duration always passes", () => {
    assert.deepEqual(checkVideoDuration(null, 60), { ok: true });
  });

  test("a duration at the cap passes; past it fails", () => {
    assert.deepEqual(checkVideoDuration(60, 60), { ok: true });
    const over = checkVideoDuration(61, 60);
    assert.equal(over.ok, false);
  });

  test("the message uses minutes for long caps and seconds for short ones", () => {
    const long = checkVideoDuration(700, 600);
    assert.equal(long.ok, false);
    if (long.ok) return;
    assert.match(long.error, /10 minutes/);

    const short = checkVideoDuration(45, 30);
    assert.equal(short.ok, false);
    if (short.ok) return;
    assert.match(short.error, /30 seconds/);
  });

  test("the cap is unset by default — a duration limit is a product decision", () => {
    assert.equal(maxVideoDurationSeconds({}), null);
    assert.equal(maxVideoDurationSeconds({ MEDIA_MAX_VIDEO_SECONDS: "" }), null);
    assert.equal(maxVideoDurationSeconds({ MEDIA_MAX_VIDEO_SECONDS: "abc" }), null);
    assert.equal(maxVideoDurationSeconds({ MEDIA_MAX_VIDEO_SECONDS: "0" }), null);
    assert.equal(maxVideoDurationSeconds({ MEDIA_MAX_VIDEO_SECONDS: "180" }), 180);
  });
});

describe("verifyStoredVideo — ranged reads against the store", () => {
  const PATH = "media/u/p/0123456789abcdef0123456789abcdef-clip.mp4";

  test("reads only the head when moov is at the front", async () => {
    const file = concat(FTYP, box("moov", mvhdV0(1000, 30_000)), box("mdat", new Uint8Array(1024)));
    const ranges: string[] = [];

    const result = await verifyStoredVideo(PATH, "video/mp4", file.length, async (_p, range) => {
      ranges.push(range);
      return file.buffer.slice(0) as ArrayBuffer;
    });

    assert.deepEqual(result, { ok: true, durationSeconds: 30 });
    assert.equal(ranges.length, 1, "no tail read needed for a faststart file");
  });

  test("falls back to a tail read for a trailing moov", async () => {
    // Larger than head probe + tail probe, so the tail read starts past 0.
    const size = 1024 * 1024;
    const head = concat(FTYP, box("mdat", new Uint8Array(1024)));
    const tail = box("moov", mvhdV0(1000, 5_000));
    const ranges: string[] = [];

    const result = await verifyStoredVideo(PATH, "video/mp4", size, async (_p, range) => {
      ranges.push(range);
      return (range === "bytes=0-65535" ? head : tail).buffer.slice(0) as ArrayBuffer;
    });

    assert.deepEqual(result, { ok: true, durationSeconds: 5 });
    assert.equal(ranges.length, 2, "head then tail");
    assert.equal(ranges[1], `bytes=${size - 256 * 1024}-${size - 1}`);
  });

  test("a file smaller than the tail probe re-reads from the start", async () => {
    // tailStart clamps to 0, so the second read covers the whole object
    // rather than asking for a negative offset.
    const size = 100 * 1024;
    const head = concat(FTYP, box("mdat", new Uint8Array(1024)));
    const whole = concat(head, box("moov", mvhdV0(1000, 9_000)));
    const ranges: string[] = [];

    const result = await verifyStoredVideo(PATH, "video/mp4", size, async (_p, range) => {
      ranges.push(range);
      return (range === "bytes=0-65535" ? head : whole).buffer.slice(0) as ArrayBuffer;
    });

    assert.deepEqual(result, { ok: true, durationSeconds: 9 });
    assert.equal(ranges[1], `bytes=0-${size - 1}`);
  });

  test("a damaged container is rejected", async () => {
    const file = concat(FTYP, box("moov", mvhdV0(1000, 0)));
    const result = await verifyStoredVideo(PATH, "video/mp4", file.length, async () =>
      file.buffer.slice(0) as ArrayBuffer
    );
    assert.equal(result.ok, false);
  });

  test("WebM is not parsed and is allowed through", async () => {
    let reads = 0;
    const result = await verifyStoredVideo(PATH, "video/webm", 1024, async () => {
      reads++;
      return new Uint8Array(0).buffer as ArrayBuffer;
    });
    assert.deepEqual(result, { ok: true, durationSeconds: null });
    assert.equal(reads, 0, "no pointless reads for a container we cannot parse");
  });

  test("a read failure does not block the upload (fail-open quality gate)", async () => {
    const result = await verifyStoredVideo(PATH, "video/mp4", 1024, async () => {
      throw new Error("blob store unavailable");
    });
    assert.deepEqual(result, { ok: true, durationSeconds: null });
  });

  test("quicktime is inspected like mp4", () => {
    assert.ok(isIsoBaseMediaMime("video/quicktime"));
    assert.ok(isIsoBaseMediaMime("video/mp4"));
    assert.ok(!isIsoBaseMediaMime("video/webm"));
    assert.ok(!isIsoBaseMediaMime("image/jpeg"));
  });
});
