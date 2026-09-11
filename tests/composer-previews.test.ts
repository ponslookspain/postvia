import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  buildComposerPreviews,
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
