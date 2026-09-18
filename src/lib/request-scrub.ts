/**
 * Edge-safe request path scrubbing.
 *
 * This module is intentionally dependency-free: no `node:*` imports, no
 * crypto, no diagnostics. It exists so `src/instrumentation.ts` can strip
 * query strings without pulling `node:crypto` (via `src/lib/diagnostics.ts`)
 * into the Edge runtime graph.
 */
export function scrubRequestPath(path: string): string {
  const queryIndex = path.indexOf("?");
  return queryIndex === -1 ? path : path.slice(0, queryIndex);
}
