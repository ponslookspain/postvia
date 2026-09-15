import type { Platform } from "@prisma/client";
import type { SocialProvider } from "@/lib/social/provider";
import type {
  PublishAccount,
  PublishOutcome,
  PublishPost,
  PublishTarget,
} from "@/lib/publish";
import type { EffectiveTargetContent } from "@/lib/platforms/overrides";

/**
 * Single per-platform dispatch record (E1 platform registry).
 *
 * One table in `src/lib/publish.ts` implements this interface per
 * implemented platform, replacing the `getProvider` switch, the
 * execute if-chain, and the resume if-chain. Adding a platform means
 * adding one table entry (plus its provider impl and OAuth routes) —
 * never editing dispatch code. All imports here are type-only, so this
 * module introduces no runtime dependency cycles.
 */
export interface PlatformDispatch {
  /**
   * Generic `SocialProvider` factory for the legacy generic publish
   * path. Absent when the platform has no generic provider publish flow
   * (TikTok publishes only through its custom Direct Post pipeline).
   */
  createProvider?: () => SocialProvider;
  execute(
    post: PublishPost,
    target: PublishTarget,
    account: PublishAccount,
    effective: EffectiveTargetContent
  ): Promise<PublishOutcome>;
  resume(targetId: string): Promise<"complete" | "failed" | "pending" | "skip">;
}

/**
 * Thrown when dispatch is attempted for a platform with no table entry.
 * Callers that already failed closed on `!caps.implemented` never reach
 * this; `publishPostTargets` converts it into a failed target via its
 * settled-result handling, exactly like the old `Unsupported platform`
 * throw.
 */
export class UnknownPlatformError extends Error {
  constructor(readonly platform: string) {
    super(`Unsupported platform: ${platform}`);
    this.name = "UnknownPlatformError";
  }
}

/**
 * Resolve one dispatch record or throw `UnknownPlatformError`.
 * Pure and unit-testable without a database.
 */
export function getDispatchEntry(
  table: Partial<Record<Platform, PlatformDispatch>>,
  platform: string
): PlatformDispatch {
  const entry = (table as Record<string, PlatformDispatch | undefined>)[
    platform
  ];
  if (!entry) throw new UnknownPlatformError(platform);
  return entry;
}
