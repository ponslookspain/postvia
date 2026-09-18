/**
 * Compatibility re-export.
 *
 * Canonical location: `@/domain/media/http-range`.
 * This shim keeps existing `@/lib/http-range` imports working
 * while new code should import from the domain module directly.
 * No behavior change — pure re-export.
 */
export * from "@/domain/media/http-range";
export type * from "@/domain/media/http-range";
