import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  getScheduleErrorActions,
  resolveScheduleClick,
  runScheduleFlow,
  type ScheduleFlowDeps,
} from "../src/lib/composer-media";

const DENIAL = { reason: "Plan limit reached.", upgradeTo: null };
const ISO = new Date(Date.now() + 3600_000).toISOString();

function recordingDeps(
  overrides: Partial<ScheduleFlowDeps> = {}
): { deps: ScheduleFlowDeps; calls: string[] } {
  const calls: string[] = [];
  const deps: ScheduleFlowDeps = {
    scheduledIso: ISO,
    hasMedia: true,
    createDraft: async () => {
      calls.push("create");
      return { ok: true, id: "post-1" };
    },
    uploadMedia: async () => {
      calls.push("upload");
      return [];
    },
    applySchedule: async () => {
      calls.push("patch");
      return { ok: true };
    },
    ...overrides,
  };
  return { deps, calls };
}

describe("runScheduleFlow", () => {
  test("success with media calls create -> upload -> patch in order", async () => {
    const { deps, calls } = recordingDeps();
    const result = await runScheduleFlow(deps);
    assert.deepEqual(calls, ["create", "upload", "patch"]);
    assert.deepEqual(result, { outcome: "scheduled", postId: "post-1" });
  });

  test("patch runs only after media upload completed", async () => {
    let uploadFinished = false;
    const { deps, calls } = recordingDeps({
      uploadMedia: async () => {
        calls.push("upload-start");
        await new Promise((r) => setTimeout(r, 5));
        uploadFinished = true;
        calls.push("upload-done");
        return [];
      },
      applySchedule: async () => {
        assert.equal(uploadFinished, true);
        calls.push("patch");
        return { ok: true };
      },
    });
    const result = await runScheduleFlow(deps);
    assert.deepEqual(calls, ["create", "upload-start", "upload-done", "patch"]);
    assert.equal(result.outcome, "scheduled");
  });

  test("media failure never reaches patch and keeps the draft", async () => {
    const { deps, calls } = recordingDeps({
      uploadMedia: async () => {
        calls.push("upload");
        return ["clip.mp4: Upload failed"];
      },
    });
    const result = await runScheduleFlow(deps);
    assert.deepEqual(calls, ["create", "upload"]);
    assert.deepEqual(result, {
      outcome: "failed-as-draft",
      postId: "post-1",
      error: "clip.mp4: Upload failed",
    });
  });

  test("schedule without media skips upload and patches directly", async () => {
    const { deps, calls } = recordingDeps({ hasMedia: false });
    const result = await runScheduleFlow(deps);
    assert.deepEqual(calls, ["create", "patch"]);
    assert.deepEqual(result, { outcome: "scheduled", postId: "post-1" });
  });

  test("create denial stops before upload and patch", async () => {
    const { deps, calls } = recordingDeps({
      createDraft: async () => {
        calls.push("create");
        return { ok: false, denial: DENIAL };
      },
    });
    const result = await runScheduleFlow(deps);
    assert.deepEqual(calls, ["create"]);
    assert.deepEqual(result, { outcome: "denied", denial: DENIAL });
  });

  test("create error leaves no post behind", async () => {
    const { deps, calls } = recordingDeps({
      createDraft: async () => {
        calls.push("create");
        return { ok: false, error: "Failed to schedule post." };
      },
    });
    const result = await runScheduleFlow(deps);
    assert.deepEqual(calls, ["create"]);
    assert.deepEqual(result, {
      outcome: "failed-before-create",
      error: "Failed to schedule post.",
    });
  });

  test("patch failure keeps the draft instead of a broken schedule", async () => {
    const { deps, calls } = recordingDeps({
      applySchedule: async () => {
        calls.push("patch");
        return { ok: false, error: "Scheduled time must be in the future" };
      },
    });
    const result = await runScheduleFlow(deps);
    assert.deepEqual(calls, ["create", "upload", "patch"]);
    assert.deepEqual(result, {
      outcome: "failed-as-draft",
      postId: "post-1",
      error: "Scheduled time must be in the future",
    });
  });

  test("patch denial surfaces the quota denial", async () => {
    const { deps } = recordingDeps({
      hasMedia: false,
      applySchedule: async () => ({
        ok: false,
        denial: DENIAL,
      }),
    });
    const result = await runScheduleFlow(deps);
    assert.deepEqual(result, { outcome: "denied", denial: DENIAL });
  });
});

describe("resolveScheduleClick", () => {
  test("non-X selection opens the schedule dialog", () => {
    assert.equal(resolveScheduleClick(false), "open-dialog");
  });

  test("X-only selection shows the inline hint instead of the dialog", () => {
    assert.equal(resolveScheduleClick(true), "show-x-hint");
  });
});

describe("getScheduleErrorActions", () => {
  test("created draft offers open-draft next to the schedule error", () => {
    assert.deepEqual(getScheduleErrorActions("post-1"), ["open-draft"]);
  });

  test("no draft id offers no draft action", () => {
    assert.deepEqual(getScheduleErrorActions(null), []);
  });
});
