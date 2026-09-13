import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  buildComposerPreviewModel,
  buildComposerPreviews,
  classifyMediaIssue,
  countCharacters,
  hasBlockingFileIssues,
  remainingCharacters,
  resolvePreviewTarget,
  type PreviewAccount,
  type PreviewOverride,
} from "../src/lib/composer-previews";

const THREADS: PreviewAccount = {
  id: "acc-threads",
  platform: "THREADS",
  username: "ponslook",
};
const X: PreviewAccount = { id: "acc-x", platform: "X", username: "ponslookdesign" };
const TIKTOK: PreviewAccount = {
  id: "acc-tiktok",
  platform: "TIKTOK",
  username: "brand",
};

const GLOBAL = "Новый ролик уже вышел 🚀";

function overrideFor(accountId: string, text: string | null): PreviewOverride {
  return { accountId, text };
}

describe("composer preview count", () => {
  test("1 selected account produces exactly 1 preview", () => {
    const previews = buildComposerPreviews([THREADS], GLOBAL, []);
    assert.equal(previews.length, 1);
    assert.equal(previews[0].accountId, THREADS.id);
  });

  test("2 selected accounts produce 2 previews", () => {
    assert.equal(buildComposerPreviews([THREADS, X], GLOBAL, []).length, 2);
  });

  test("3 selected accounts produce 3 previews", () => {
    assert.equal(
      buildComposerPreviews([THREADS, X, TIKTOK], GLOBAL, []).length,
      3
    );
  });

  test("adding an account adds a preview; removing drops it", () => {
    const before = buildComposerPreviews([THREADS], GLOBAL, []);
    assert.deepEqual(
      before.map((p) => p.accountId),
      ["acc-threads"]
    );
    const after = buildComposerPreviews([THREADS, X], GLOBAL, []);
    assert.deepEqual(
      after.map((p) => p.accountId),
      ["acc-threads", "acc-x"]
    );
    const shrunk = buildComposerPreviews([X], GLOBAL, []);
    assert.deepEqual(
      shrunk.map((p) => p.accountId),
      ["acc-x"]
    );
  });
});

describe("global text flows into previews", () => {
  test("all previews use global text when no override is set", () => {
    const previews = buildComposerPreviews([THREADS, X], GLOBAL, []);
    for (const preview of previews) {
      assert.equal(preview.text, GLOBAL);
      assert.equal(preview.customized, false);
    }
  });

  test("changing global text updates every non-customized preview", () => {
    const updated = GLOBAL + " (edited)";
    const previews = buildComposerPreviews([THREADS, X], updated, []);
    assert.deepEqual(
      previews.map((p) => p.text),
      [updated, updated]
    );
  });
});

describe("per-platform overrides", () => {
  test("customizing one platform only changes that preview", () => {
    const previews = buildComposerPreviews(
      [THREADS, X],
      GLOBAL,
      [overrideFor("acc-threads", "Смотрите новый ролик 🔥")]
    );
    assert.equal(previews[0].text, "Смотрите новый ролик 🔥");
    assert.equal(previews[0].customized, true);
    assert.equal(previews[1].text, GLOBAL, "X preview keeps global text");
    assert.equal(previews[1].customized, false);
  });

  test("changing global text does not affect a customized preview", () => {
    const previews = buildComposerPreviews(
      [THREADS, X],
      "totally different global",
      [overrideFor("acc-threads", "Смотрите новый ролик 🔥")]
    );
    assert.equal(previews[0].text, "Смотрите новый ролик 🔥");
    assert.equal(previews[1].text, "totally different global");
  });

  test("Use global (override removed) restores fallback", () => {
    const previews = buildComposerPreviews([THREADS], GLOBAL, [
      overrideFor("acc-threads", null),
    ]);
    assert.equal(previews[0].text, GLOBAL);
    assert.equal(previews[0].customized, false);
  });

  test("empty-string override counts as no override", () => {
    const previews = buildComposerPreviews([THREADS], GLOBAL, [
      overrideFor("acc-threads", ""),
    ]);
    assert.equal(previews[0].text, GLOBAL);
    assert.equal(previews[0].customized, false);
  });
});

describe("capability-driven preview metadata", () => {
  test("limits come from the platform capability registry", () => {
    const previews = buildComposerPreviews([X, THREADS], GLOBAL, []);
    assert.equal(previews[0].maxLength, 280);
    assert.equal(previews[1].maxLength, 500);
  });

  test("overLimit is computed from the effective text per platform", () => {
    const long = "a".repeat(300);
    const previews = buildComposerPreviews([X, THREADS], long, []);
    assert.equal(previews[0].overLimit, true, "300 chars exceeds X 280");
    assert.equal(previews[1].overLimit, false, "300 chars fits Threads 500");
  });

  test("a customized preview is measured against its own override", () => {
    const long = "a".repeat(300);
    const previews = buildComposerPreviews([X], long, [
      overrideFor("acc-x", "short"),
    ]);
    assert.equal(previews[0].text, "short");
    assert.equal(previews[0].overLimit, false);
  });

  test("customization fields only contain the selected platform's capabilities", () => {
    const previews = buildComposerPreviews([THREADS, X], GLOBAL, []);
    assert.deepEqual(previews[0].fieldKeys, ["text"]);
    assert.deepEqual(previews[1].fieldKeys, ["text"]);
    assert.ok(!previews[1].fieldKeys.includes("privacy_level"));
    const tiktok = buildComposerPreviews([TIKTOK], GLOBAL, [])[0];
    assert.ok(tiktok.fieldKeys.includes("title"));
    assert.ok(tiktok.fieldKeys.includes("privacy_level"));
  });
});

describe("tiktok title contract", () => {
  test("tiktok preview never uses global text as title", () => {
    // Production contract: TikTok publishes its own title only. The
    // legacy preview must render empty (not global text) until a title
    // override is set, matching buildComposerPreviewModel.
    const previews = buildComposerPreviews([TIKTOK], GLOBAL, []);
    assert.equal(previews[0].text, "");
    assert.equal(previews[0].customized, false);
    assert.equal(previews[0].maxLength, 2200);
  });

  test("tiktok title override replaces the preview text", () => {
    const previews = buildComposerPreviews([TIKTOK], GLOBAL, [
      overrideFor("acc-tiktok", "Мой заголовок"),
    ]);
    assert.equal(previews[0].text, "Мой заголовок");
    assert.equal(previews[0].customized, true);
  });

  test("empty tiktok title counts as no override", () => {
    const previews = buildComposerPreviews([TIKTOK], GLOBAL, [
      overrideFor("acc-tiktok", ""),
    ]);
    assert.equal(previews[0].text, "");
    assert.equal(previews[0].customized, false);
  });

  test("global text change never leaks into the tiktok preview", () => {
    const previews = buildComposerPreviews([TIKTOK], "totally different global", []);
    assert.equal(previews[0].text, "");
  });
});

describe("countCharacters", () => {
  test("counts unicode code points like the server contract", () => {
    assert.equal(countCharacters("hello"), 5);
    assert.equal(countCharacters("🚀"), 1);
    assert.equal(countCharacters("🚀".repeat(279)), 279);
    assert.equal(countCharacters("Новый ролик уже вышел 🚀"), 23);
  });

  test("emoji-heavy text gates overLimit by code points", () => {
    // 279 emoji: 558 UTF-16 units but 279 code points — fits X 280.
    const fits = buildComposerPreviews([X], "🚀".repeat(279), []);
    assert.equal(fits[0].overLimit, false);
    const over = buildComposerPreviews([X], "🚀".repeat(281), []);
    assert.equal(over[0].overLimit, true);
  });
});

describe("remainingCharacters", () => {
  test("reports what is left, clamped at zero", () => {
    assert.equal(remainingCharacters("hello", 280), 275);
    assert.equal(remainingCharacters("🚀".repeat(279), 280), 1);
    assert.equal(remainingCharacters("a".repeat(300), 280), 0);
  });
});

describe("composer preview model", () => {
  test("text platforms use global text with global source", () => {
    const [threads] = buildComposerPreviewModel({
      accounts: [THREADS],
      globalText: GLOBAL,
      overrides: [],
    });
    assert.equal(threads?.text, GLOBAL);
    assert.equal(threads?.source, "global");
    assert.equal(threads?.customized, false);
    assert.equal(threads?.contentKey, "text");
    assert.equal(threads?.contentLabel, "Text");
    assert.equal(threads?.characterCount, countCharacters(GLOBAL));
    assert.equal(threads?.validation.valid, true);
    assert.deepEqual(threads?.validation.errors, []);
  });

  test("override replaces only that target", () => {
    const [threads, x] = buildComposerPreviewModel({
      accounts: [THREADS, X],
      globalText: GLOBAL,
      overrides: [overrideFor("acc-threads", "custom")],
    });
    assert.equal(threads?.text, "custom");
    assert.equal(threads?.source, "override");
    assert.equal(threads?.customized, true);
    assert.equal(x?.text, GLOBAL);
    assert.equal(x?.source, "global");
  });

  test("tiktok without title never shows global text as title", () => {
    const [tiktok] = buildComposerPreviewModel({
      accounts: [TIKTOK],
      globalText: GLOBAL,
      overrides: [],
      media: [{ type: "VIDEO", mimeType: "video/mp4" }],
    });
    assert.equal(tiktok?.text, "");
    assert.equal(tiktok?.source, "global");
    assert.equal(tiktok?.customized, false);
    assert.equal(tiktok?.contentKey, "title");
    assert.equal(tiktok?.validation.valid, false);
    assert.deepEqual(
      tiktok?.validation.errors.map((issue) => issue.code),
      ["tiktok-title-missing"]
    );
  });

  test("tiktok title override becomes the effective content", () => {
    const [tiktok] = buildComposerPreviewModel({
      accounts: [TIKTOK],
      globalText: GLOBAL,
      overrides: [overrideFor("acc-tiktok", "Мой заголовок")],
      media: [{ type: "VIDEO", mimeType: "video/mp4" }],
    });
    assert.equal(tiktok?.text, "Мой заголовок");
    assert.equal(tiktok?.source, "override");
    assert.equal(tiktok?.customized, true);
    assert.equal(tiktok?.validation.valid, true);
  });

  test("instagram caption stays distinguishable from threads text", () => {
    const [threads, instagram] = buildComposerPreviewModel({
      accounts: [
        THREADS,
        { id: "acc-ig", platform: "INSTAGRAM", username: "brand" },
      ],
      globalText: GLOBAL,
      overrides: [],
    });
    assert.equal(threads?.contentKey, "text");
    assert.equal(threads?.contentLabel, "Text");
    assert.equal(instagram?.contentKey, "text");
    assert.equal(instagram?.contentLabel, "Caption");
    assert.equal(instagram?.maxLength, 2200);
  });

  test("over-limit text is a structured error", () => {
    const [x] = buildComposerPreviewModel({
      accounts: [X],
      globalText: "a".repeat(300),
      overrides: [],
    });
    assert.equal(x?.overLimit, true);
    assert.equal(x?.validation.valid, false);
    assert.deepEqual(
      x?.validation.errors.map((issue) => issue.code),
      ["text-over-limit"]
    );
    assert.ok(x !== undefined && x.validation.errors[0]?.message.includes("280"));
  });

  test("empty text is a warning, not an error", () => {
    const [threads] = buildComposerPreviewModel({
      accounts: [THREADS],
      globalText: "",
      overrides: [],
    });
    assert.equal(threads?.validation.valid, true);
    assert.deepEqual(
      threads?.validation.warnings.map((issue) => issue.code),
      ["content-empty"]
    );
  });

  test("media count overflow maps to a stable code per account", () => {
    const [threads, tiktok] = buildComposerPreviewModel({
      accounts: [THREADS, TIKTOK],
      globalText: GLOBAL,
      overrides: [overrideFor("acc-tiktok", "title")],
      media: [
        { type: "VIDEO", mimeType: "video/mp4" },
        { type: "VIDEO", mimeType: "video/mp4" },
      ],
    });
    assert.equal(threads?.mediaState, "error");
    assert.deepEqual(
      threads?.validation.errors.map((issue) => issue.code),
      ["media-too-many"]
    );
    assert.equal(tiktok?.mediaState, "error");
    assert.equal(tiktok?.validation.valid, false);
  });

  test("unsupported mime maps to a stable code", () => {
    const [threads] = buildComposerPreviewModel({
      accounts: [THREADS],
      globalText: GLOBAL,
      overrides: [],
      media: [{ type: "VIDEO", mimeType: "video/avi" }],
    });
    assert.equal(threads?.mediaState, "error");
    assert.deepEqual(
      threads?.validation.errors.map((issue) => issue.code),
      ["media-mime-unsupported"]
    );
  });

  test("oversized file with known size maps per file", () => {
    const [threads] = buildComposerPreviewModel({
      accounts: [THREADS],
      globalText: GLOBAL,
      overrides: [],
      media: [
        { type: "VIDEO", mimeType: "video/mp4", size: 200 * 1024 * 1024 },
      ],
    });
    assert.deepEqual(
      threads?.media[0]?.issues.map((issue) => issue.code),
      ["media-too-large"]
    );
    assert.equal(threads?.validation.valid, true);
  });

  test("override settings travel on the model", () => {
    const [tiktok] = buildComposerPreviewModel({
      accounts: [TIKTOK],
      globalText: GLOBAL,
      overrides: [overrideFor("acc-tiktok", "title")],
      overrideSettings: {
        "acc-tiktok": { privacy_level: "SELF_ONLY" },
      },
    });
    assert.equal(tiktok?.hasSettingsOverride, true);
    assert.deepEqual(tiktok?.settings, { privacy_level: "SELF_ONLY" });
  });

  test("reset override returns the target to global", () => {
    const withOverride = buildComposerPreviewModel({
      accounts: [THREADS],
      globalText: GLOBAL,
      overrides: [overrideFor("acc-threads", "custom")],
    })[0];
    assert.equal(withOverride?.text, "custom");
    assert.equal(withOverride?.inheritsGlobal, false);
    const reset = buildComposerPreviewModel({
      accounts: [THREADS],
      globalText: GLOBAL,
      overrides: [],
    })[0];
    assert.equal(reset?.text, GLOBAL);
    assert.equal(reset?.source, "global");
    assert.equal(reset?.customized, false);
    assert.equal(reset?.inheritsGlobal, true);
  });

  test("override on one account never leaks into another", () => {
    const secondThreads = {
      id: "acc-threads-2",
      platform: "THREADS",
      username: "other",
    } as const;
    const [first, second] = buildComposerPreviewModel({
      accounts: [THREADS, secondThreads],
      globalText: GLOBAL,
      overrides: [overrideFor("acc-threads", "custom")],
    });
    assert.equal(first?.text, "custom");
    assert.equal(first?.source, "override");
    assert.equal(second?.text, GLOBAL);
    assert.equal(second?.source, "global");
    assert.equal(second?.customized, false);
    assert.equal(second?.inheritsGlobal, true);
  });

  test("settings-only override keeps inheriting global content", () => {
    const [threads] = buildComposerPreviewModel({
      accounts: [THREADS],
      globalText: GLOBAL,
      overrides: [],
      overrideSettings: {
        "acc-threads": { privacy_level: "SELF_ONLY" },
      },
    });
    assert.equal(threads?.text, GLOBAL);
    assert.equal(threads?.customized, false);
    assert.equal(threads?.hasSettingsOverride, true);
    assert.equal(threads?.inheritsGlobal, true);
  });

  test("tiktok without title inherits nothing", () => {
    const [tiktok] = buildComposerPreviewModel({
      accounts: [TIKTOK],
      globalText: GLOBAL,
      overrides: [],
      media: [{ type: "VIDEO", mimeType: "video/mp4" }],
    });
    assert.equal(tiktok?.inheritsGlobal, false);
  });
});

describe("classifyMediaIssue", () => {
  test("maps known validator messages to stable codes", () => {
    assert.equal(
      classifyMediaIssue("Threads supports at most 1 media item"),
      "media-too-many"
    );
    assert.equal(
      classifyMediaIssue("TikTok requires exactly one media item"),
      "media-required"
    );
    assert.equal(
      classifyMediaIssue("File exceeds the 100 MB limit for videos"),
      "media-too-large"
    );
    assert.equal(
      classifyMediaIssue("Something completely unexpected"),
      "media-invalid"
    );
  });
});

describe("resolvePreviewTarget", () => {
  const pick = (platform: string, accountId: string) => ({
    platform: platform as "X" | "THREADS" | "INSTAGRAM" | "TIKTOK",
    accountId,
  });

  test("empty selection resolves to null", () => {
    assert.equal(resolvePreviewTarget([], "X"), null);
    assert.equal(resolvePreviewTarget([], null), null);
  });

  test("preferred platform wins when still selected", () => {
    assert.deepEqual(
      resolvePreviewTarget(
        [pick("THREADS", "t1"), pick("X", "x1")],
        "X"
      ),
      { platform: "X", accountId: "x1" }
    );
  });

  test("disappeared platform falls back to first in switcher order", () => {
    assert.deepEqual(
      resolvePreviewTarget(
        [pick("TIKTOK", "k1"), pick("THREADS", "t1")],
        "INSTAGRAM"
      ),
      { platform: "THREADS", accountId: "t1" }
    );
  });

  test("null preference resolves to first in switcher order", () => {
    assert.deepEqual(
      resolvePreviewTarget([pick("TIKTOK", "k1"), pick("X", "x1")], null),
      { platform: "X", accountId: "x1" }
    );
  });

  test("multi-account platform resolves to its first selected account", () => {
    assert.deepEqual(
      resolvePreviewTarget(
        [pick("THREADS", "t1"), pick("THREADS", "t2")],
        "THREADS"
      ),
      { platform: "THREADS", accountId: "t1" }
    );
  });
});

describe("rich media validation", () => {
  test("per-file layer reports size only, never mime", () => {
    const [threads] = buildComposerPreviewModel({
      accounts: [THREADS],
      globalText: GLOBAL,
      overrides: [],
      media: [{ type: "VIDEO", mimeType: "video/avi", size: 1024 }],
    });
    // MIME is the platform layer's job (see media-mime-unsupported above).
    assert.deepEqual(threads?.media[0]?.issues ?? null, []);
  });

  test("no size means no per-file issues", () => {
    const [threads] = buildComposerPreviewModel({
      accounts: [THREADS],
      globalText: GLOBAL,
      overrides: [],
      media: [{ type: "VIDEO", mimeType: "video/mp4" }],
    });
    assert.deepEqual(threads?.media[0]?.issues ?? null, []);
    assert.equal(hasBlockingFileIssues([threads]), false);
  });

  test("oversized file blocks submit paths", () => {
    const models = buildComposerPreviewModel({
      accounts: [THREADS],
      globalText: GLOBAL,
      overrides: [],
      media: [
        { type: "VIDEO", mimeType: "video/mp4", size: 200 * 1024 * 1024 },
      ],
    });
    assert.equal(hasBlockingFileIssues(models), true);
    assert.equal(hasBlockingFileIssues([]), false);
  });

  test("TikTok MOV stays valid (empirically verified regression)", () => {
    const [tiktok] = buildComposerPreviewModel({
      accounts: [TIKTOK],
      globalText: GLOBAL,
      overrides: [overrideFor("acc-tiktok", "title")],
      media: [{ type: "VIDEO", mimeType: "video/quicktime", size: 1024 }],
    });
    assert.equal(tiktok?.mediaState, "ok");
    assert.deepEqual(tiktok?.media[0]?.issues ?? null, []);
    assert.equal(tiktok?.validation.valid, true);
  });
});
