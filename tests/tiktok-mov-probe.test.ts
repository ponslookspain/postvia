import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  findOwnedTikTokAccount,
  firstDiffIndex,
} from "../src/app/api/admin/tiktok-mov-probe/route";

const OWN_TIKTOK = {
  id: "cmtxcp97700011704dz66yjeg",
  platform: "TIKTOK",
  username: "ponslookspain",
};
const OWN_THREADS = {
  id: "cmtxcp97700021704dz66yjeg",
  platform: "THREADS",
  username: "ponslookspain",
};
const ACCOUNTS = [OWN_TIKTOK, OWN_THREADS];

describe("probe account lookup", () => {
  test("existing TikTok SocialAccount of the current userId is found by id", () => {
    assert.deepEqual(
      findOwnedTikTokAccount(ACCOUNTS, "cmtxcp97700011704dz66yjeg"),
      OWN_TIKTOK
    );
  });

  test("foreign id (not in own accounts) does not pass", () => {
    assert.equal(
      findOwnedTikTokAccount(ACCOUNTS, "cmtxcp97700031704dz66yjeg"),
      null
    );
  });

  test("own account of another platform does not pass", () => {
    assert.equal(
      findOwnedTikTokAccount(ACCOUNTS, "cmtxcp97700021704dz66yjeg"),
      null
    );
  });

  test("near-miss id does not pass", () => {
    // Same head/tail/length as the real id, one char off in the middle.
    assert.equal(
      findOwnedTikTokAccount(ACCOUNTS, "cmtxcp97700011705dz66yjeg"),
      null
    );
  });
});

describe("firstDiffIndex", () => {
  test("pinpoints the first differing index", () => {
    assert.equal(
      firstDiffIndex("cmtxcp97700011704dz66yjeg", "cmtxcp97700011705dz66yjeg"),
      16
    );
    assert.equal(firstDiffIndex("abc", "abc"), -1);
    assert.equal(firstDiffIndex("abc", "abcd"), 3);
  });
});
