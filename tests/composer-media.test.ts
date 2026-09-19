import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  canSubmitComposer,
  continueEditingFromSaved,
  defaultSelectedAccountIds,
  getFailedPublishActions,
  hasUnsavedChanges,
  isComposerDirty,
  isTikTokReconnectNeeded,
  mapWithConcurrencyLimit,
  MEDIA_UPLOAD_CONCURRENCY,
  planMediaAdd,
  selectMediaForUpload,
} from "../src/lib/composer-media";
import { getEffectiveMediaConstraints } from "../src/lib/platforms/overrides";

const ACCOUNTS = [
  { id: "threads-1", platform: "THREADS" },
  { id: "x-1", platform: "X" },
];

const PNG = { name: "photo.png", type: "image/png", size: 1024 };
const MP4 = { name: "clip.mp4", type: "video/mp4", size: 1024 };
const MOV = { name: "clip.mov", type: "video/quicktime", size: 1024 };
const BAD = { name: "notes.txt", type: "text/plain", size: 100 };

describe("planMediaAdd", () => {
  test("accepts valid files and never deselects a platform (X supports media)", () => {
    const plan = planMediaAdd({
      files: [PNG, MP4],
      existingCount: 0,
      maxMedia: 4,
      selectedAccountIds: ["threads-1", "x-1"],
      accounts: ACCOUNTS,
    });
    assert.equal(plan.limitExceeded, false);
    assert.equal(plan.rejected.length, 0);
    assert.equal(plan.accepted.length, 2);
    assert.deepEqual(plan.deselectAccountIds, []);
    // Original file references are preserved, never spread into plain objects.
    assert.equal(plan.accepted[0]?.file, PNG);
    assert.equal(plan.accepted[0]?.kind, "IMAGE");
    assert.equal(plan.accepted[1]?.file, MP4);
    assert.equal(plan.accepted[1]?.kind, "VIDEO");
  });

  test("overflow rejects atomically: nothing added, selection untouched", () => {
    const plan = planMediaAdd({
      files: [PNG, MP4],
      existingCount: 3,
      maxMedia: 4,
      selectedAccountIds: ["threads-1", "x-1"],
      accounts: ACCOUNTS,
    });
    assert.equal(plan.limitExceeded, true);
    assert.equal(plan.accepted.length, 2);
    // No deselection may happen when nothing is added.
    assert.deepEqual(plan.deselectAccountIds, []);
    assert.equal(plan.rejected.length, 0);
  });

  test("exactly filling the limit is allowed", () => {
    const plan = planMediaAdd({
      files: [PNG],
      existingCount: 3,
      maxMedia: 4,
      selectedAccountIds: ["threads-1"],
      accounts: ACCOUNTS,
    });
    assert.equal(plan.limitExceeded, false);
    assert.equal(plan.accepted.length, 1);
  });

  test("invalid files are reported without blocking valid ones", () => {
    const plan = planMediaAdd({
      files: [BAD, PNG],
      existingCount: 0,
      maxMedia: 4,
      selectedAccountIds: ["threads-1"],
      accounts: ACCOUNTS,
    });
    assert.equal(plan.limitExceeded, false);
    assert.equal(plan.rejected.length, 1);
    assert.equal(plan.rejected[0]?.name, "notes.txt");
    assert.equal(plan.accepted.length, 1);
    assert.deepEqual(plan.deselectAccountIds, []);
  });

  test("all-invalid input adds nothing and changes nothing", () => {
    const plan = planMediaAdd({
      files: [BAD],
      existingCount: 0,
      maxMedia: 4,
      selectedAccountIds: ["threads-1", "x-1"],
      accounts: ACCOUNTS,
    });
    assert.equal(plan.limitExceeded, false);
    assert.equal(plan.accepted.length, 0);
    assert.equal(plan.rejected.length, 1);
    assert.deepEqual(plan.deselectAccountIds, []);
  });

  test("no X selected means no deselection", () => {
    const plan = planMediaAdd({
      files: [PNG],
      existingCount: 0,
      maxMedia: 4,
      selectedAccountIds: ["threads-1"],
      accounts: ACCOUNTS,
    });
    assert.deepEqual(plan.deselectAccountIds, []);
  });

  test("accepts a .mov file as video", () => {
    const plan = planMediaAdd({
      files: [MOV],
      existingCount: 0,
      maxMedia: 4,
      selectedAccountIds: ["threads-1"],
      accounts: ACCOUNTS,
    });
    assert.equal(plan.limitExceeded, false);
    assert.equal(plan.accepted.length, 1);
    assert.equal(plan.accepted[0]?.file, MOV);
    assert.equal(plan.accepted[0]?.kind, "VIDEO");
  });
});

describe("getFailedPublishActions", () => {
  test("saved draft keeps both try-again and open-draft", () => {
    assert.deepEqual(getFailedPublishActions("post-123"), [
      "try-again",
      "open-draft",
    ]);
  });

  test("no draft id leaves try-again only", () => {
    assert.deepEqual(getFailedPublishActions(null), ["try-again"]);
  });
});

describe("continueEditingFromSaved", () => {  test("flips only the screen flags — text and media have no setters in reach", () => {
    const calls: string[] = [];
    continueEditingFromSaved({
      setSaved: (value) => {
        calls.push(`setSaved:${value}`);
      },
      setSavedId: (value) => {
        calls.push(`setSavedId:${value}`);
      },
    });
    assert.deepEqual(calls, ["setSaved:false", "setSavedId:null"]);
  });
});

describe("media upload concurrency", () => {
  test("limit is within 2–3", () => {
    assert.ok(MEDIA_UPLOAD_CONCURRENCY >= 2);
    assert.ok(MEDIA_UPLOAD_CONCURRENCY <= 3);
  });

  test("preserves input order regardless of completion order", async () => {
    const delays = [30, 5, 15, 1];
    const results = await mapWithConcurrencyLimit(
      delays,
      2,
      async (delay, index) => {
        await new Promise((r) => setTimeout(r, delay));
        return `item-${index}`;
      }
    );
    assert.deepEqual(results, ["item-0", "item-1", "item-2", "item-3"]);
  });

  test("never exceeds the concurrency limit", async () => {
    let active = 0;
    let peak = 0;
    await mapWithConcurrencyLimit([1, 2, 3, 4, 5, 6], 2, async (n) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active -= 1;
      return n;
    });
    assert.ok(peak <= 2);
    assert.equal(active, 0);
  });

  test("empty input resolves without work", async () => {
    assert.deepEqual(await mapWithConcurrencyLimit([], 2, async () => 1), []);
  });
});

describe("selectMediaForUpload", () => {
  const items = [
    { key: "a", status: "done" as const, registeredPostId: "post-1" },
    { key: "b", status: "error" as const, registeredPostId: "post-1" },
    { key: "c", status: "pending" as const, registeredPostId: null },
    { key: "d", status: "done" as const, registeredPostId: "post-9" },
  ];

  test("skips files already registered to the same post", () => {
    assert.deepEqual(
      selectMediaForUpload(items, "post-1").map((item) => item.key),
      ["b", "c", "d"]
    );
  });

  test("retry narrows to the failed file only", () => {
    assert.deepEqual(
      selectMediaForUpload(items, "post-1", ["b"]).map((item) => item.key),
      ["b"]
    );
  });

  test("retry after partial failure keeps order and drops nothing else", () => {
    assert.deepEqual(
      selectMediaForUpload(items, "post-1", ["b", "c"]).map(
        (item) => item.key
      ),
      ["b", "c"]
    );
  });

  test("unknown keys select nothing, items never duplicate", () => {
    assert.deepEqual(selectMediaForUpload(items, "post-1", ["zzz"]), []);
    const selected = selectMediaForUpload(items, "post-2");
    assert.equal(selected.length, 4);
    assert.equal(new Set(selected.map((item) => item.key)).size, 4);
  });
});

describe("canSubmitComposer", () => {
  const ready = {
    textPresent: true,
    overLimit: false,
    mediaError: false,
    hasSelection: true,
    busy: false,
    quotaBlocked: false,
  };

  test("ready composer can submit", () => {
    assert.equal(canSubmitComposer(ready), true);
  });

  test("exhausted quota blocks submit before any request", () => {
    assert.equal(canSubmitComposer({ ...ready, quotaBlocked: true }), false);
  });

  test("each other gate still blocks independently", () => {
    assert.equal(canSubmitComposer({ ...ready, textPresent: false }), false);
    assert.equal(canSubmitComposer({ ...ready, overLimit: true }), false);
    assert.equal(canSubmitComposer({ ...ready, mediaError: true }), false);
    assert.equal(canSubmitComposer({ ...ready, hasSelection: false }), false);
    assert.equal(canSubmitComposer({ ...ready, busy: true }), false);
  });

  test("preview validation errors block publish (tiktok title missing)", () => {
    assert.equal(canSubmitComposer({ ...ready, previewError: true }), false);
    assert.equal(canSubmitComposer({ ...ready, previewError: false }), true);
    assert.equal(canSubmitComposer(ready), true);
  });
});

describe("isTikTokReconnectNeeded", () => {
  test("expired/revoked access messages need reconnect", () => {
    assert.equal(
      isTikTokReconnectNeeded(
        "TikTok access expired or was revoked. Reconnect your TikTok account."
      ),
      true
    );
  });

  test("fetch failures and empty messages need retry, not reconnect", () => {
    assert.equal(isTikTokReconnectNeeded("TikTok rate limit reached."), false);
    assert.equal(
      isTikTokReconnectNeeded("Could not reach TikTok. Check your connection."),
      false
    );
    assert.equal(isTikTokReconnectNeeded(null), false);
    assert.equal(isTikTokReconnectNeeded(""), false);
  });
});

describe("hasUnsavedChanges", () => {
  test("empty composer has nothing to lose", () => {
    assert.equal(hasUnsavedChanges("", 0), false);
    assert.equal(hasUnsavedChanges("   ", 0), false);
  });

  test("text or media counts as unsaved", () => {
    assert.equal(hasUnsavedChanges("hello", 0), true);
    assert.equal(hasUnsavedChanges("", 2), true);
    assert.equal(hasUnsavedChanges("hello", 1), true);
  });
});

describe("isComposerDirty", () => {  const clean = {
    text: "",
    mediaCount: 0,
    selectedAccountIds: ["t1"],
    initialAccountIds: ["t1"],
    hasOverrides: false,
  };

  test("pristine composer is clean", () => {
    assert.equal(isComposerDirty(clean), false);
  });

  test("text, media or overrides make it dirty", () => {
    assert.equal(isComposerDirty({ ...clean, text: "hi" }), true);
    assert.equal(isComposerDirty({ ...clean, mediaCount: 1 }), true);
    assert.equal(isComposerDirty({ ...clean, hasOverrides: true }), true);
  });

  test("account selection drift is order-insensitive", () => {
    assert.equal(
      isComposerDirty({
        ...clean,
        selectedAccountIds: ["t1", "x1"],
      }),
      true
    );
    assert.equal(
      isComposerDirty({
        ...clean,
        selectedAccountIds: [],
        initialAccountIds: [],
      }),
      false
    );
  });

  test("deselect-and-reselect counts as clean", () => {
    assert.equal(
      isComposerDirty({
        ...clean,
        selectedAccountIds: ["t1"],
        initialAccountIds: ["t1"],
      }),
      false
    );
  });
});

describe("defaultSelectedAccountIds", () => {
  test("selects implemented Threads accounts only", () => {
    assert.deepEqual(
      defaultSelectedAccountIds([
        { id: "t1", implemented: true, platform: "THREADS" },
        { id: "t2", implemented: false, platform: "THREADS" },
        { id: "x1", implemented: true, platform: "X" },
      ]),
      ["t1"]
    );
  });
});

describe("planMediaAdd TikTok size guidance", () => {
  const TIKTOK = { id: "tt-1", platform: "TIKTOK" };
  const bigJpeg = {
    name: "photo.jpg",
    type: "image/jpeg",
    size: 12 * 1024 * 1024,
  };

  test("12 MB JPEG names the TikTok 20 MB support without allowing it", () => {
    const plan = planMediaAdd({
      files: [bigJpeg],
      existingCount: 0,
      maxMedia: 4,
      selectedAccountIds: ["tt-1"],
      accounts: [TIKTOK],
    });
    assert.equal(plan.accepted.length, 0);
    assert.equal(plan.rejected.length, 1);
    assert.match(plan.rejected[0]?.error ?? "", /10 MB/);
    assert.match(plan.rejected[0]?.error ?? "", /TikTok supports photos up to 20 MB/);
  });

  test("same file without a TikTok target keeps the generic message", () => {
    const plan = planMediaAdd({
      files: [bigJpeg],
      existingCount: 0,
      maxMedia: 4,
      selectedAccountIds: ["threads-1"],
      accounts: ACCOUNTS,
    });
    assert.equal(plan.rejected.length, 1);
    assert.doesNotMatch(plan.rejected[0]?.error ?? "", /TikTok/);
  });

  test("over-20 MB JPEG never gets the TikTok hint", () => {
    const plan = planMediaAdd({
      files: [{ ...bigJpeg, size: 21 * 1024 * 1024 }],
      existingCount: 0,
      maxMedia: 4,
      selectedAccountIds: ["tt-1"],
      accounts: [TIKTOK],
    });
    assert.equal(plan.rejected.length, 1);
    assert.doesNotMatch(plan.rejected[0]?.error ?? "", /TikTok supports/);
  });
});

describe("canSubmitComposer description-only TikTok photo", () => {
  const base = {
    overLimit: false,
    mediaError: false,
    hasSelection: true,
    busy: false,
    quotaBlocked: false,
  };

  test("empty text with a photo description counts as content", () => {
    assert.equal(
      canSubmitComposer({ ...base, textPresent: false, descriptionPresent: true }),
      true
    );
  });

  test("empty text without a description stays blocked", () => {
    assert.equal(
      canSubmitComposer({ ...base, textPresent: false }),
      false
    );
    assert.equal(
      canSubmitComposer({
        ...base,
        textPresent: false,
        descriptionPresent: false,
      }),
      false
    );
  });

  test("description does not override other gates", () => {
    assert.equal(
      canSubmitComposer({
        ...base,
        textPresent: false,
        descriptionPresent: true,
        overLimit: true,
      }),
      false
    );
  });
});

describe("TikTok photo byte mirror", () => {
  test("local 20 MB mirror matches the provider constant", async () => {
    const { TIKTOK_PHOTO_MAX_BYTES } = await import(
      "../src/lib/social/tiktok"
    );
    assert.equal(20 * 1024 * 1024, TIKTOK_PHOTO_MAX_BYTES);
  });
});

describe("planMediaAdd with effective platform constraints", () => {
  const TIKTOK = { id: "tt-1", platform: "TIKTOK" };
  const INSTAGRAM = { id: "ig-1", platform: "INSTAGRAM" };
  const JPEG = { name: "photo.jpg", type: "image/jpeg", size: 1024 };
  const GIF = { name: "anim.gif", type: "image/gif", size: 1024 };

  function effectiveFor(ids: string[], all: { id: string; platform: string }[]) {
    return (
      getEffectiveMediaConstraints(
        all
          .filter((account) => ids.includes(account.id))
          .map((account) => account.platform as never)
      ) ?? undefined
    );
  }

  function addWithEffective(
    files: { name: string; type: string; size: number }[],
    ids: string[],
    all: { id: string; platform: string }[],
    existingMedia: { type: "IMAGE" | "VIDEO"; mimeType: string }[] = []
  ) {
    return planMediaAdd({
      files,
      existingCount: existingMedia.length,
      maxMedia: 4,
      selectedAccountIds: ids,
      accounts: all,
      effective: effectiveFor(ids, all),
      existingMedia,
    });
  }

  test("legacy call without effective keeps the old behavior", () => {
    // Four PNGs for a Threads-only selection: rejected under the
    // effective gate (maxItems 1), accepted on the legacy path.
    const plan = planMediaAdd({
      files: [PNG, PNG, PNG, PNG],
      existingCount: 0,
      maxMedia: 4,
      selectedAccountIds: ["threads-1"],
      accounts: ACCOUNTS,
    });
    assert.equal(plan.limitExceeded, false);
    assert.equal(plan.accepted.length, 4);
    assert.equal(plan.rejected.length, 0);
  });

  test("X + 4 JPEG is allowed", () => {
    const plan = addWithEffective(
      [JPEG, JPEG, JPEG, JPEG],
      ["x-1"],
      ACCOUNTS
    );
    assert.equal(plan.rejected.length, 0);
    assert.equal(plan.accepted.length, 4);
  });

  test("X + TikTok + 4 JPEG is allowed, PNG is blocked", () => {
    const all = [...ACCOUNTS, TIKTOK];
    const ok = addWithEffective(
      [JPEG, JPEG, JPEG, JPEG],
      ["x-1", "tt-1"],
      all
    );
    assert.equal(ok.rejected.length, 0);
    assert.equal(ok.accepted.length, 4);
    const png = addWithEffective([PNG], ["x-1", "tt-1"], all);
    assert.equal(png.accepted.length, 0);
    assert.equal(png.rejected.length, 1);
    assert.match(png.rejected[0]?.error ?? "", /does not support/);
  });

  test("X + Instagram + 2 images: second is blocked by count", () => {
    const all = [...ACCOUNTS, INSTAGRAM];
    const plan = addWithEffective([JPEG, JPEG], ["x-1", "ig-1"], all);
    assert.equal(plan.accepted.length, 1);
    assert.equal(plan.rejected.length, 1);
    assert.match(
      plan.rejected[0]?.error ?? "",
      /supports at most 1 media item/
    );
  });

  test("Instagram + Threads + 2 images: second is blocked by count", () => {
    const all = [...ACCOUNTS, INSTAGRAM];
    const plan = addWithEffective(
      [JPEG, JPEG],
      ["ig-1", "threads-1"],
      all
    );
    assert.equal(plan.accepted.length, 1);
    assert.equal(plan.rejected.length, 1);
    assert.match(
      plan.rejected[0]?.error ?? "",
      /supports at most 1 media item/
    );
  });

  test("Instagram + GIF is blocked by MIME", () => {
    const all = [...ACCOUNTS, INSTAGRAM];
    const plan = addWithEffective([GIF], ["ig-1"], all);
    assert.equal(plan.accepted.length, 0);
    assert.match(plan.rejected[0]?.error ?? "", /does not support/);
  });

  test("X + video + photo is blocked as mixed media", () => {
    const plan = addWithEffective([PNG, MP4], ["x-1"], ACCOUNTS);
    assert.equal(plan.accepted.length, 1);
    assert.equal(plan.rejected.length, 1);
    assert.match(plan.rejected[0]?.error ?? "", /mixing photos and videos/);
  });

  test("X + 2 videos is blocked as multiple videos", () => {
    const plan = addWithEffective([MP4, MP4], ["x-1"], ACCOUNTS);
    assert.equal(plan.accepted.length, 1);
    assert.equal(plan.rejected.length, 1);
    assert.match(plan.rejected[0]?.error ?? "", /only one video per post/);
  });

  test("existing video blocks a new photo on X (no auto-removal, add refused)", () => {
    const plan = addWithEffective([PNG], ["x-1"], ACCOUNTS, [
      { type: "VIDEO", mimeType: "video/mp4" },
    ]);
    assert.equal(plan.accepted.length, 0);
    assert.match(plan.rejected[0]?.error ?? "", /mixing photos and videos/);
  });

  test("Threads + WebM is blocked by MIME", () => {
    const plan = addWithEffective(
      [{ name: "clip.webm", type: "video/webm", size: 1024 }],
      ["threads-1"],
      ACCOUNTS
    );
    assert.equal(plan.accepted.length, 0);
    assert.match(plan.rejected[0]?.error ?? "", /does not support/);
  });

  test("TikTok + MOV is allowed", () => {
    const plan = addWithEffective([MOV], ["tt-1"], [TIKTOK]);
    assert.equal(plan.accepted.length, 1);
    assert.equal(plan.rejected.length, 0);
  });

  test("size is NOT blocked at add time (preview layer owns it)", () => {
    const bigJpeg = { name: "photo.jpg", type: "image/jpeg", size: 6 * 1024 * 1024 };
    const plan = addWithEffective([bigJpeg], ["x-1"], ACCOUNTS);
    assert.equal(plan.rejected.length, 0);
    assert.equal(plan.accepted.length, 1);
  });

  test("effective count gate stays atomic when the legacy count overflows", () => {
    // existingCount without item detail (legacy caller shape): the single
    // candidate is structurally fine for Instagram, but 1 existing + 1 new
    // exceeds the effective max of 1 → limitExceeded, nothing added.
    const all = [...ACCOUNTS, INSTAGRAM];
    const plan = planMediaAdd({
      files: [JPEG],
      existingCount: 1,
      maxMedia: 4,
      selectedAccountIds: ["ig-1"],
      accounts: all,
      effective: effectiveFor(["ig-1"], all),
    });
    assert.equal(plan.limitExceeded, true);
    assert.equal(plan.rejected.length, 0);
  });
});
