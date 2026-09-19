/**
 * Compatibility re-export.
 *
 * Canonical location: `@/domain/media/signature`.
 * This shim keeps existing `@/lib/media-signature` imports working
 * while new code should import from the domain module directly.
 * No behavior change — pure re-export.
 */
export * from "@/domain/media/signature";
