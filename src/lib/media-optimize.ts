/**
 * Compatibility re-export.
 *
 * Canonical location: `@/domain/media/optimize`.
 * This shim keeps existing `@/lib/media-optimize` imports working
 * while new code should import from the domain module directly.
 * No behavior change — pure re-export.
 */
export * from "@/domain/media/optimize";
