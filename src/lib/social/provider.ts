/**
 * Compatibility re-export.
 *
 * Canonical location: `@/domain/social/provider`.
 * This shim keeps existing `@/lib/social/provider` imports working
 * while new code should import from the domain module directly.
 * No behavior change — pure re-export.
 */
export * from "@/domain/social/provider";
