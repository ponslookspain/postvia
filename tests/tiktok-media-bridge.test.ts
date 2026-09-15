import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  createTiktokMediaUrl,
  isValidTiktokBridgeMediaId,
  parseTiktokBridgeUrl,
  serveTiktokBridgeMedia,
  signTiktokMediaToken,
  TIKTOK_BRIDGE_PATH_PREFIX,
  TIKTOK_BRIDGE_URL_TTL_MS,
  verifyTiktokMediaToken,
} from "../src/lib/tiktok-media-bridge";
import { getPlatformCapabilities } from "../src/lib/platforms/capabilities";
import { validateTargetMedia } from "../src/lib/platforms/overrides";

const SECRET = "test-bridge-secret-0123456789";
const NOW = 1_800_000_000_000;
const BASE = "https://postvia.online";
const MEDIA_A = "cm3diaAAAABBBBCCCCDDDD";
const MEDIA_B = "cm3diaEEEEFFFFGGGGHHHH";

function fakeDeps(overrides: {
  row?: { mimeType: string; pathname: string; size: number } | null;
  blob?: { stream: unknown; contentLength: string | null } | null;
} = {}) {
  const calls: string[] = [];
  return {
    calls,
    deps: {
      findMedia: async (id: string) => {
        calls.push(`find:${id}`);
        if ("row" in overrides) return overrides.row ?? null;
        return { mimeType: "image/jpeg", pathname: `media/u1/p1/${id}.jpg`, size: 1024 };
      },
      fetchBlob: async (pathname: string) => {
        calls.push(`fetch:${pathname}`);
        if (overrides.blob === undefined && !("blob" in overrides)) {
          return { stream: "BYTES" as unknown, contentLength: "1024" };
        }
        return (overrides.blob ?? null) as { stream: unknown; contentLength: string | null } | null;
      },
    },
  };
}

function signedUrl(mediaId: string, nowMs: number = NOW) {
  return createTiktokMediaUrl({ mediaId, baseUrl: BASE, secret: SECRET, nowMs });
}

function parts(url: string) {
  const parsed = parseTiktokBridgeUrl(url);
  assert.ok(parsed, `must parse: ${url}`);
  return parsed;
}

describe("tiktok bridge URL contract", () => {
  test("TTL exceeds TikTok's 1-hour PULL_FROM_URL download timeout", () => {
    assert.ok(TIKTOK_BRIDGE_URL_TTL_MS >= 3_600_000);
    assert.equal(TIKTOK_BRIDGE_URL_TTL_MS, 90 * 60_000);
  });

  test("TikTok receives a first-party https URL, never a blob hostname", () => {
    const url = signedUrl(MEDIA_A);
    const parsed = new URL(url);
    assert.equal(parsed.protocol, "https:");
    assert.equal(parsed.hostname, "postvia.online");
    assert.ok(parsed.pathname.startsWith(TIKTOK_BRIDGE_PATH_PREFIX));
    assert.ok(!url.includes("blob.vercel-storage.com"));
    assert.ok(url.includes(`/${MEDIA_A}?`));
  });

  test("sign/verify roundtrip with injected secret", () => {
    const url = signedUrl(MEDIA_A);
    const { mediaId, expires, sig } = parts(url);
    assert.deepEqual(verifyTiktokMediaToken({ mediaId, expires, sig, secret: SECRET, nowMs: NOW }), {
      ok: true,
    });
  });

  test("retry mints a fresh URL: expires/sig advance, both verify at their own time", () => {
    const first = signedUrl(MEDIA_A, NOW);
    const second = signedUrl(MEDIA_A, NOW + 60_000);
    assert.notEqual(first, second);
    const a = parts(first);
    const b = parts(second);
    assert.ok(Number(b.expires) > Number(a.expires));
    assert.deepEqual(
      verifyTiktokMediaToken({ ...a, secret: SECRET, nowMs: NOW }),
      { ok: true }
    );
    assert.deepEqual(
      verifyTiktokMediaToken({ ...b, secret: SECRET, nowMs: NOW + 60_000 }),
      { ok: true }
    );
  });

  test("a token for media A never authorizes media B (no cross-media use)", () => {
    const { expires, sig } = parts(signedUrl(MEDIA_A));
    assert.deepEqual(
      verifyTiktokMediaToken({ mediaId: MEDIA_B, expires, sig, secret: SECRET, nowMs: NOW }),
      { ok: false, reason: "invalid" }
    );
  });

  test("tampered signature is rejected", () => {
    const { mediaId, expires } = parts(signedUrl(MEDIA_A));
    assert.deepEqual(
      verifyTiktokMediaToken({ mediaId, expires, sig: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", secret: SECRET, nowMs: NOW }),
      { ok: false, reason: "invalid" }
    );
  });

  test("expired token is rejected with a distinct reason", () => {
    const { mediaId, expires, sig } = parts(signedUrl(MEDIA_A, NOW));
    assert.deepEqual(
      verifyTiktokMediaToken({ mediaId, expires, sig, secret: SECRET, nowMs: NOW + TIKTOK_BRIDGE_URL_TTL_MS + 10 * 60_000 }),
      { ok: false, reason: "expired" }
    );
  });

  test("missing secret fails closed (builder throws, verifier reports unconfigured)", () => {
    assert.throws(
      () => createTiktokMediaUrl({ mediaId: MEDIA_A, baseUrl: BASE, secret: "", nowMs: NOW }),
      /not configured/
    );
    assert.deepEqual(
      verifyTiktokMediaToken({ mediaId: MEDIA_A, expires: "9999999999", sig: "x", secret: "", nowMs: NOW }),
      { ok: false, reason: "unconfigured" }
    );
  });

  test("parser rejects http, wrong path, traversal, and missing params", () => {
    assert.equal(parseTiktokBridgeUrl(signedUrl(MEDIA_A).replace("https:", "http:")), null);
    assert.equal(parseTiktokBridgeUrl("https://postvia.online/api/media/abc?expires=1&sig=2"), null);
    assert.equal(
      parseTiktokBridgeUrl("https://postvia.online/api/tiktok/media/../secret?expires=1&sig=2"),
      null
    );
    assert.equal(parseTiktokBridgeUrl(`https://postvia.online/api/tiktok/media/${MEDIA_A}`), null);
  });

  test("media id validation rejects traversal and garbage", () => {
    assert.equal(isValidTiktokBridgeMediaId(MEDIA_A), true);
    for (const bad of ["", "../x", "a/b", "x".repeat(65), "id with spaces", "media/../../etc"]) {
      assert.equal(isValidTiktokBridgeMediaId(bad), false, bad);
    }
  });

  test("signature is deterministic for the same inputs", () => {
    assert.equal(
      signTiktokMediaToken({ mediaId: MEDIA_A, expiresSec: 123, secret: SECRET }),
      signTiktokMediaToken({ mediaId: MEDIA_A, expiresSec: 123, secret: SECRET })
    );
  });
});

describe("tiktok bridge serving (no redirect, correct content type)", () => {
  test("valid request streams bytes directly with image content type (200, not 3xx)", async () => {
    const f = fakeDeps();
    const { expires, sig } = parts(signedUrl(MEDIA_A));
    const result = await serveTiktokBridgeMedia(
      { mediaId: MEDIA_A, expires, sig, method: "GET" },
      { secret: SECRET, nowMs: NOW },
      f.deps
    );
    assert.equal(result.status, 200);
    // Direct 200 with bytes: the bridge never answers with a redirect.
    assert.ok(![301, 302, 303, 307, 308].includes(result.status));
    if (result.status !== 200) return;
    assert.equal(result.headers["Content-Type"], "image/jpeg");
    assert.equal(result.headers["Content-Length"], "1024");
    assert.equal(result.body, "BYTES");
    // Ownership comes from the token-bound id, not caller paths:
    // exactly one media lookup for the token's own id.
    assert.deepEqual(f.calls, [`find:${MEDIA_A}`, `fetch:media/u1/p1/${MEDIA_A}.jpg`]);
  });

  test("webp row is served with webp content type", async () => {
    const f = fakeDeps({
      row: { mimeType: "image/webp", pathname: "media/u1/p1/x.webp", size: 2048 },
    });
    const { expires, sig } = parts(signedUrl(MEDIA_A));
    const result = await serveTiktokBridgeMedia(
      { mediaId: MEDIA_A, expires, sig, method: "GET" },
      { secret: SECRET, nowMs: NOW },
      f.deps
    );
    assert.equal(result.status, 200);
    if (result.status !== 200) return;
    assert.equal(result.headers["Content-Type"], "image/webp");
  });

  test("HEAD returns headers without a body", async () => {
    const f = fakeDeps();
    const { expires, sig } = parts(signedUrl(MEDIA_A));
    const result = await serveTiktokBridgeMedia(
      { mediaId: MEDIA_A, expires, sig, method: "HEAD" },
      { secret: SECRET, nowMs: NOW },
      f.deps
    );
    assert.equal(result.status, 200);
    if (result.status !== 200) return;
    assert.equal(result.headers["Content-Type"], "image/jpeg");
    assert.equal(result.body, null);
  });

  test("bad token touches no storage and collapses to 404", async () => {
    const f = fakeDeps();
    const result = await serveTiktokBridgeMedia(
      { mediaId: MEDIA_A, expires: "9999999999", sig: "bogus", method: "GET" },
      { secret: SECRET, nowMs: NOW },
      f.deps
    );
    assert.deepEqual(result, { status: 404 });
    assert.deepEqual(f.calls, []);
  });

  test("expired token collapses to 404 without storage access", async () => {
    const f = fakeDeps();
    const { expires, sig } = parts(signedUrl(MEDIA_A, NOW));
    const result = await serveTiktokBridgeMedia(
      { mediaId: MEDIA_A, expires, sig, method: "GET" },
      { secret: SECRET, nowMs: NOW + TIKTOK_BRIDGE_URL_TTL_MS + 10 * 60_000 },
      f.deps
    );
    assert.deepEqual(result, { status: 404 });
    assert.deepEqual(f.calls, []);
  });

  test("unknown media id collapses to 404", async () => {
    const f = fakeDeps({ row: null });
    const { expires, sig } = parts(signedUrl(MEDIA_A));
    const result = await serveTiktokBridgeMedia(
      { mediaId: MEDIA_A, expires, sig, method: "GET" },
      { secret: SECRET, nowMs: NOW },
      f.deps
    );
    assert.deepEqual(result, { status: 404 });
  });

  test("non-allowlisted stored mime (png) is never served, even with a valid token", async () => {
    const f = fakeDeps({
      row: { mimeType: "image/png", pathname: "media/u1/p1/x.png", size: 512 },
    });
    const { expires, sig } = parts(signedUrl(MEDIA_A));
    const result = await serveTiktokBridgeMedia(
      { mediaId: MEDIA_A, expires, sig, method: "GET" },
      { secret: SECRET, nowMs: NOW },
      f.deps
    );
    assert.deepEqual(result, { status: 404 });
  });

  test("missing blob bytes collapse to 404", async () => {
    const f = fakeDeps({ blob: null });
    const { expires, sig } = parts(signedUrl(MEDIA_A));
    const result = await serveTiktokBridgeMedia(
      { mediaId: MEDIA_A, expires, sig, method: "GET" },
      { secret: SECRET, nowMs: NOW },
      f.deps
    );
    assert.deepEqual(result, { status: 404 });
  });
});

describe("composer gate matrix (audit scenarios A-K)", () => {
  const tiktok = () => getPlatformCapabilities("TIKTOK");
  const threads = () => getPlatformCapabilities("THREADS");
  const instagram = () => getPlatformCapabilities("INSTAGRAM");
  const x = () => getPlatformCapabilities("X");

  test("A. TikTok + JPG passes", () => {
    assert.deepEqual(validateTargetMedia(tiktok(), [{ type: "IMAGE", mimeType: "image/jpeg" }]), {
      ok: true,
    });
  });

  test("B. TikTok + WebP passes", () => {
    assert.deepEqual(validateTargetMedia(tiktok(), [{ type: "IMAGE", mimeType: "image/webp" }]), {
      ok: true,
    });
  });

  test("C. TikTok + 2 JPG passes (carousel)", () => {
    assert.deepEqual(
      validateTargetMedia(tiktok(), [
        { type: "IMAGE", mimeType: "image/jpeg" },
        { type: "IMAGE", mimeType: "image/jpeg" },
      ]),
      { ok: true }
    );
  });

  test("D. TikTok + 4 JPG passes (Postvia global limit, not TikTok 35)", () => {
    assert.deepEqual(
      validateTargetMedia(tiktok(), [
        { type: "IMAGE", mimeType: "image/jpeg" },
        { type: "IMAGE", mimeType: "image/jpeg" },
        { type: "IMAGE", mimeType: "image/webp" },
        { type: "IMAGE", mimeType: "image/jpeg" },
      ]),
      { ok: true }
    );
  });

  test("E. TikTok + PNG fails with a mime message (never sent)", () => {
    const result = validateTargetMedia(tiktok(), [{ type: "IMAGE", mimeType: "image/png" }]);
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /does not support image\/png/);
  });

  test("F. TikTok + GIF fails (never sent)", () => {
    const result = validateTargetMedia(tiktok(), [{ type: "IMAGE", mimeType: "image/gif" }]);
    assert.equal(result.ok, false);
  });

  test("G. TikTok + video still passes (existing flow)", () => {
    assert.deepEqual(validateTargetMedia(tiktok(), [{ type: "VIDEO", mimeType: "video/mp4" }]), {
      ok: true,
    });
  });

  test("H. TikTok + video + image fails closed on mixing", () => {
    const result = validateTargetMedia(tiktok(), [
      { type: "VIDEO", mimeType: "video/mp4" },
      { type: "IMAGE", mimeType: "image/jpeg" },
    ]);
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /mixing/);
  });

  test("I. Threads + image unchanged", () => {
    assert.deepEqual(validateTargetMedia(threads(), [{ type: "IMAGE", mimeType: "image/png" }]), {
      ok: true,
    });
  });

  test("J. Instagram + JPEG image unchanged", () => {
    assert.deepEqual(
      validateTargetMedia(instagram(), [{ type: "IMAGE", mimeType: "image/jpeg" }]),
      { ok: true }
    );
  });

  test("K. X + image passes (v2 media upload)", () => {
    assert.deepEqual(validateTargetMedia(x(), [{ type: "IMAGE", mimeType: "image/jpeg" }]), {
      ok: true,
    });
  });
});

describe("bridge signing secret precedence", () => {
  test("dedicated TIKTOK_BRIDGE_SECRET wins over BETTER_AUTH_SECRET", () => {
    const savedBridge = process.env.TIKTOK_BRIDGE_SECRET;
    const savedAuth = process.env.BETTER_AUTH_SECRET;
    try {
      process.env.TIKTOK_BRIDGE_SECRET = "dedicated-bridge-secret";
      process.env.BETTER_AUTH_SECRET = "auth-secret-fallback";
      const url = createTiktokMediaUrl({ mediaId: MEDIA_A, baseUrl: BASE, nowMs: NOW });
      const parsed = parts(url);
      assert.deepEqual(
        verifyTiktokMediaToken({ ...parsed, secret: "dedicated-bridge-secret", nowMs: NOW }),
        { ok: true }
      );
      assert.deepEqual(
        verifyTiktokMediaToken({ ...parsed, secret: "auth-secret-fallback", nowMs: NOW }),
        { ok: false, reason: "invalid" }
      );
    } finally {
      if (savedBridge === undefined) delete process.env.TIKTOK_BRIDGE_SECRET;
      else process.env.TIKTOK_BRIDGE_SECRET = savedBridge;
      if (savedAuth === undefined) delete process.env.BETTER_AUTH_SECRET;
      else process.env.BETTER_AUTH_SECRET = savedAuth;
    }
  });

  test("BETTER_AUTH_SECRET fallback keeps existing URLs verifying", () => {
    const savedBridge = process.env.TIKTOK_BRIDGE_SECRET;
    const savedAuth = process.env.BETTER_AUTH_SECRET;
    try {
      delete process.env.TIKTOK_BRIDGE_SECRET;
      process.env.BETTER_AUTH_SECRET = "auth-secret-fallback";
      const url = createTiktokMediaUrl({ mediaId: MEDIA_A, baseUrl: BASE, nowMs: NOW });
      const parsed = parts(url);
      assert.deepEqual(
        verifyTiktokMediaToken({ ...parsed, secret: "auth-secret-fallback", nowMs: NOW }),
        { ok: true }
      );
    } finally {
      if (savedBridge === undefined) delete process.env.TIKTOK_BRIDGE_SECRET;
      else process.env.TIKTOK_BRIDGE_SECRET = savedBridge;
      if (savedAuth === undefined) delete process.env.BETTER_AUTH_SECRET;
      else process.env.BETTER_AUTH_SECRET = savedAuth;
    }
  });
});
