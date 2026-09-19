/**
 * Compatibility re-export.
 *
 * Canonical location: `@/domain/billing/plans`.
 * This shim keeps existing `@/lib/plans` imports working
 * while new code should import from the domain module directly.
 * No behavior change — pure re-export.
 */
export * from "@/domain/billing/plans";
export type * from "@/domain/billing/plans";
