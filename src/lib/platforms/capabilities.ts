/**
 * Compatibility re-export.
 *
 * Canonical location: `@/domain/social/capabilities`.
 * This shim keeps existing `@/lib/platforms/capabilities` imports working
 * while new code should import from the domain module directly.
 * No behavior change — pure re-export.
 */
export * from "@/domain/social/capabilities";
