import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { waitForMediaRegistration } from "../src/lib/media-registration";

describe("waitForMediaRegistration", () => {
  it("settles when the status endpoint reports exists", async () => {
    let calls = 0;
    const result = await waitForMediaRegistration({
      postId: "p1",
      pathname: "media/u1/p1/abc-file",
      pollMs: 1,
      timeoutMs: 1000,
      fetchStatus: async () => {
        calls += 1;
        return calls >= 2 ? true : null;
      },
    });
    assert.equal(result, null);
    assert.ok(calls >= 2);
  });

  it("times out with a user-readable message", async () => {
    const result = await waitForMediaRegistration({
      postId: "p1",
      pathname: "media/u1/p1/abc-file",
      pollMs: 1,
      timeoutMs: 5,
      fetchStatus: async () => null,
    });
    assert.match(result ?? "", /did not finish registering/);
  });

  it("pre-aborted signal cancels without fetching", async () => {
    let calls = 0;
    const controller = new AbortController();
    controller.abort();
    const result = await waitForMediaRegistration({
      postId: "p1",
      pathname: "media/u1/p1/abc-file",
      signal: controller.signal,
      fetchStatus: async () => {
        calls += 1;
        return null;
      },
    });
    assert.match(result ?? "", /cancelled/i);
    assert.equal(calls, 0);
  });
});
