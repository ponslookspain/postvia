/**
 * Byte-level content verification (P1.3).
 *
 * The declared MIME type is client-supplied end to end, so these cases are
 * the only thing standing between "the client said image/jpeg" and "a Media
 * row describing arbitrary bytes as a JPEG".
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  detectSignatureKind,
  hasSignatureCheck,
  mediaSignatureCoverage,
  SIGNATURE_PROBE_BYTES,
  verifyMediaSignature,
} from "../src/lib/media-signature";
import { verifyStoredSignature } from "../src/lib/media-upload";
import { MEDIA_LIMITS } from "../src/lib/media";

/** Builds a head buffer from a byte prefix, padded to a realistic probe size. */
function head(...prefix: number[]): Uint8Array {
  const bytes = new Uint8Array(SIGNATURE_PROBE_BYTES);
  bytes.set(prefix.slice(0, SIGNATURE_PROBE_BYTES));
  return bytes;
}

function ascii(text: string, offset = 0): number[] {
  const out: number[] = new Array(offset).fill(0);
  for (const ch of text) out.push(ch.charCodeAt(0));
  return out;
}

const JPEG = head(0xff, 0xd8, 0xff, 0xe0);
const PNG = head(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const GIF89 = head(...ascii("GIF89a"));
const GIF87 = head(...ascii("GIF87a"));
const WEBP = head(...ascii("RIFF"), 0x24, 0x00, 0x00, 0x00, ...ascii("WEBP"));
const MP4 = head(0x00, 0x00, 0x00, 0x20, ...ascii("ftyp"), ...ascii("isom"));
const MOV = head(0x00, 0x00, 0x00, 0x14, ...ascii("ftyp"), ...ascii("qt  "));
const WEBM = head(0x1a, 0x45, 0xdf, 0xa3);

/** An HTML document — the classic "image upload" payload. */
const HTML = head(...ascii("<!DOCTYPE html><script>"));
/** An SVG — an image by extension, a script host by content. */
const SVG = head(...ascii("<svg xmlns=\"http://www.w3.org/2000/svg\">"));
/** A Windows executable. */
const EXE = head(0x4d, 0x5a, 0x90, 0x00);
/** A ZIP archive (also the container for many polyglot tricks). */
const ZIP = head(0x50, 0x4b, 0x03, 0x04);

describe("verifyMediaSignature — genuine files", () => {
  const cases: [string, Uint8Array][] = [
    ["image/jpeg", JPEG],
    ["image/png", PNG],
    ["image/gif", GIF89],
    ["image/gif", GIF87],
    ["image/webp", WEBP],
    ["video/mp4", MP4],
    ["video/quicktime", MOV],
    ["video/webm", WEBM],
  ];

  for (const [mime, bytes] of cases) {
    test(`${mime} with matching bytes is accepted`, () => {
      assert.deepEqual(verifyMediaSignature(mime, bytes), { ok: true });
    });
  }
});

describe("verifyMediaSignature — declared type does not match the bytes", () => {
  const hostile: [string, Uint8Array, string][] = [
    ["HTML claiming to be a JPEG", HTML, "image/jpeg"],
    ["SVG claiming to be a PNG", SVG, "image/png"],
    ["executable claiming to be a JPEG", EXE, "image/jpeg"],
    ["ZIP claiming to be a WebP", ZIP, "image/webp"],
    ["HTML claiming to be an MP4", HTML, "video/mp4"],
    ["a real PNG claiming to be a JPEG", PNG, "image/jpeg"],
    ["a real MP4 claiming to be a WebM", MP4, "video/webm"],
    ["a real JPEG claiming to be a video", JPEG, "video/mp4"],
  ];

  for (const [label, bytes, declared] of hostile) {
    test(`${label} is rejected`, () => {
      const result = verifyMediaSignature(declared, bytes);
      assert.equal(result.ok, false);
      assert.match(
        result.ok ? "" : result.error,
        /do not match the declared file type/
      );
    });
  }
});

describe("verifyMediaSignature — malformed and edge input", () => {
  test("empty bytes are rejected", () => {
    const result = verifyMediaSignature("image/jpeg", new Uint8Array(0));
    assert.equal(result.ok, false);
  });

  test("a truncated header cannot prove the type", () => {
    // Two bytes of a JPEG SOI: correct so far, but incomplete.
    const result = verifyMediaSignature("image/jpeg", new Uint8Array([0xff, 0xd8]));
    assert.equal(result.ok, false);
  });

  test("RIFF without the WEBP form type is rejected", () => {
    // A RIFF container that is actually a WAV file.
    const wav = head(...ascii("RIFF"), 0x24, 0, 0, 0, ...ascii("WAVE"));
    assert.equal(verifyMediaSignature("image/webp", wav).ok, false);
  });

  test("an unknown declared type fails closed", () => {
    assert.equal(verifyMediaSignature("image/svg+xml", SVG).ok, false);
    assert.equal(verifyMediaSignature("", JPEG).ok, false);
  });

  test("a valid signature buried after leading junk is rejected", () => {
    // Prepending bytes to a real JPEG must not sneak past the check.
    const shifted = head(0x00, 0xff, 0xd8, 0xff);
    assert.equal(verifyMediaSignature("image/jpeg", shifted).ok, false);
  });
});

describe("signature coverage matches the upload allowlist", () => {
  test("every accepted MIME type has a byte-level check", () => {
    const accepted = [
      ...MEDIA_LIMITS.IMAGE.mimeTypes,
      ...MEDIA_LIMITS.VIDEO.mimeTypes,
    ];
    for (const mime of accepted) {
      assert.ok(
        hasSignatureCheck(mime),
        `${mime} is accepted by MEDIA_LIMITS but has no signature check, so ` +
          `its bytes would never be verified`
      );
    }
  });

  test("the signature table adds nothing the allowlist does not accept", () => {
    const accepted = new Set<string>([
      ...MEDIA_LIMITS.IMAGE.mimeTypes,
      ...MEDIA_LIMITS.VIDEO.mimeTypes,
    ]);
    for (const mime of mediaSignatureCoverage()) {
      assert.ok(accepted.has(mime), `${mime} is verifiable but never accepted`);
    }
  });
});

describe("detectSignatureKind (diagnostics only)", () => {
  test("classifies real files", () => {
    assert.equal(detectSignatureKind(JPEG), "IMAGE");
    assert.equal(detectSignatureKind(WEBP), "IMAGE");
    assert.equal(detectSignatureKind(MP4), "VIDEO");
    assert.equal(detectSignatureKind(WEBM), "VIDEO");
  });

  test("returns null for content it does not recognize", () => {
    assert.equal(detectSignatureKind(HTML), null);
    assert.equal(detectSignatureKind(EXE), null);
  });
});

describe("verifyStoredSignature (reads only the head)", () => {
  test("requests a bounded byte range, never the whole object", async () => {
    const ranges: string[] = [];
    const result = await verifyStoredSignature(
      "media/u/p/deadbeef-x.jpg",
      "image/jpeg",
      async (_pathname, range) => {
        ranges.push(range);
        return JPEG.buffer.slice(0) as ArrayBuffer;
      }
    );

    assert.deepEqual(result, { ok: true });
    assert.deepEqual(
      ranges,
      [`bytes=0-${SIGNATURE_PROBE_BYTES - 1}`],
      "a 100MB video must not be downloaded to check 4 bytes"
    );
  });

  test("mismatched stored bytes are rejected", async () => {
    const result = await verifyStoredSignature(
      "media/u/p/deadbeef-x.jpg",
      "image/jpeg",
      async () => HTML.buffer.slice(0) as ArrayBuffer
    );
    assert.equal(result.ok, false);
  });

  test("a missing object fails closed", async () => {
    const result = await verifyStoredSignature(
      "media/u/p/deadbeef-x.jpg",
      "image/jpeg",
      async () => null
    );
    assert.equal(result.ok, false);
  });

  test("a read error fails closed rather than admitting the upload", async () => {
    const result = await verifyStoredSignature(
      "media/u/p/deadbeef-x.jpg",
      "image/jpeg",
      async () => {
        throw new Error("blob store unavailable");
      }
    );
    assert.equal(result.ok, false);
  });
});
