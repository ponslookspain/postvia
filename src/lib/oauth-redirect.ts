import { NextRequest, NextResponse } from "next/server";
import {
  originToAllowedHost,
  resolveExtraTrustedOrigins,
} from "@/lib/base-url";

/**
 * Where OAuth callbacks redirect the browser.
 *
 * Background: Next.js builds `request.url` from the server's listen
 * address (`localhost:3000` in dev) while the protocol still comes from
 * `X-Forwarded-Proto` — so `new URL(path, request.url)` behind ngrok
 * produced the bizarre `https://localhost:3000/...` and bounced users off
 * the tunnel. (NextResponse.redirect() rejects relative URLs, so a
 * root-relative Location is not an option either.)
 *
 * This helper rebuilds an absolute same-app origin from the proxy headers
 * the client actually arrived on, validated against the same allowlist as
 * Better Auth (`src/lib/auth.ts`): production, www, `*.vercel.app`,
 * `localhost:3000`, plus `BETTER_AUTH_TRUSTED_ORIGINS` extras (the ngrok
 * dev host). Anything else falls back to the request host (today's
 * behavior) — never to an unvalidated, attacker-controlled value.
 */

const BUILT_IN_HOSTS = [
  "postvia.online",
  "www.postvia.online",
  "localhost:3000",
];

function isAllowedHost(
  host: string,
  env: Record<string, string | undefined> = process.env
): boolean {
  const normalized = host.trim().toLowerCase();
  if (BUILT_IN_HOSTS.includes(normalized)) return true;
  if (
    normalized.endsWith(".vercel.app") &&
    normalized.length > ".vercel.app".length
  ) {
    return true;
  }
  const extras = resolveExtraTrustedOrigins(env)
    .map(originToAllowedHost)
    .filter((entry): entry is string => entry !== null);
  return extras.includes(normalized);
}

function firstHeaderValue(value: string | null): string | null {
  if (!value) return null;
  const first = value.split(",")[0].trim().toLowerCase();
  return first.length > 0 ? first : null;
}

export type RedirectOriginInput = {
  /** Raw request.url (host may be the server listen address). */
  requestUrl: string;
  /** `host` header as received. */
  hostHeader: string | null;
  /** `x-forwarded-host` as received (set by ngrok / Vercel). */
  forwardedHost: string | null;
};

/**
 * Pure origin resolution — unit-testable without Next.js. Returns an
 * absolute origin (`https://…`, `http://localhost:3000` for local dev).
 */
export function resolveRedirectOrigin(
  input: RedirectOriginInput,
  env: Record<string, string | undefined> = process.env
): string {
  const forwarded = firstHeaderValue(input.forwardedHost);
  if (forwarded && isAllowedHost(forwarded, env)) {
    return forwarded === "localhost:3000"
      ? `http://${forwarded}`
      : `https://${forwarded}`;
  }
  const host = firstHeaderValue(input.hostHeader);
  if (host && isAllowedHost(host, env)) {
    return host === "localhost:3000" ? `http://${host}` : `https://${host}`;
  }
  // Last resort: today's behavior (server listen address). Always
  // same-app, never attacker-controlled.
  try {
    const fallback = new URL(input.requestUrl);
    return `${fallback.protocol}//${fallback.host}`;
  } catch {
    return "https://postvia.online";
  }
}

/**
 * 307 redirect to a same-app path on the origin the browser actually uses.
 * Drop-in replacement for `NextResponse.redirect(new URL(path,
 * request.url))` in OAuth callbacks.
 */
export function oauthRedirect(request: NextRequest, path: string): NextResponse {
  const origin = resolveRedirectOrigin({
    requestUrl: request.url,
    hostHeader: request.headers.get("host"),
    forwardedHost: request.headers.get("x-forwarded-host"),
  });
  return NextResponse.redirect(new URL(path, origin));
}
