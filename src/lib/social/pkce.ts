/**
 * Compatibility re-export.
 *
 * Canonical location: `@/domain/social/pkce`.
 * This shim keeps existing `@/lib/social/pkce` imports working
 * while new code should import from the domain module directly.
 * No behavior change — pure re-export.
 */
export * from "@/domain/social/pkce";
