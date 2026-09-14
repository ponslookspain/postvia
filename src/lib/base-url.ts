export const PRODUCTION_URL = "https://postvia.online";

export function resolveBaseURL(
  env: Record<string, string | undefined> = process.env
): string | undefined {
  if (env.BETTER_AUTH_URL) return env.BETTER_AUTH_URL;
  if (env.VERCEL_ENV === "production") {
    return env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`
      : PRODUCTION_URL;
  }
  if (env.VERCEL_URL) return `https://${env.VERCEL_URL}`;
  return undefined;
}

/**
 * Extra Better Auth origins for LOCAL development only (stable HTTPS tunnel
 * host used for OAuth callbacks + session origin, e.g. a Cloudflare Tunnel
 * hostname in front of `http://localhost:3000`).
 *
 * Read from `BETTER_AUTH_TRUSTED_ORIGINS` (comma-separated full origins,
 * e.g. `https://dev.postvia.online`). Empty/unset by default, so
 * Production and Preview resolution is untouched: this only ever ADDS
 * entries, never replaces the built-in allowlist in `src/lib/auth.ts`.
 * The dev hostname itself is never hardcoded here — it lives in
 * `.env.local` / `.env.example` / `docs/local-social-dev.md`.
 */
export function resolveExtraTrustedOrigins(
  env: Record<string, string | undefined> = process.env
): string[] {
  const raw = env.BETTER_AUTH_TRUSTED_ORIGINS ?? "";
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const origin = part.trim().replace(/\/+$/, "");
    if (!origin) continue;
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      continue;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") continue;
    // Strip default ports so `https://host:443` and `https://host` converge.
    const host = parsed.host.toLowerCase();
    const normalized = `${parsed.protocol}//${host}${parsed.pathname.replace(/\/+$/, "")}`;
    if (!seen.has(normalized)) seen.add(normalized);
  }
  return [...seen];
}

/**
 * Maps one trusted origin to its Better Auth `allowedHosts` entry
 * (host, or host:port for non-default ports). Returns null for origins
 * with a non-root path — Better Auth matches hosts, not paths.
 */
export function originToAllowedHost(origin: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  if (parsed.pathname !== "" && parsed.pathname !== "/") return null;
  return parsed.host.toLowerCase();
}