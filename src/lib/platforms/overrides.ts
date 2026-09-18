/**
 * Compatibility re-export.
 *
 * Canonical location: `@/domain/social/overrides`.
 * This shim keeps existing `@/lib/platforms/overrides` imports working
 * while new code should import from the domain module directly.
 * No behavior change — pure re-export.
 */
export * from "@/domain/social/overrides";
