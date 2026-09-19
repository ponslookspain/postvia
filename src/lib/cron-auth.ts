import { NextRequest, NextResponse } from "next/server";
import { reportError } from "@/lib/diagnostics";

const AUTH_PREFIX = "Bearer ";

/**
 * Timing-safe comparison of the `Authorization: Bearer <CRON_SECRET>`
 * header. Missing/empty secret always rejects, so there is no
 * unauthenticated execution path.
 */
export function isCronAuthorized(authHeader: string | null): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected || expected.length === 0) return false;
  if (!authHeader || !authHeader.startsWith(AUTH_PREFIX)) return false;

  const provided = authHeader.slice(AUTH_PREFIX.length);
  if (provided.length !== expected.length) return false;

  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Shared cron route wrapper (E5): Bearer auth gate + generic 500 envelope
 * with diagnostics. Route handlers pass only their work function; GET and
 * POST share it (Vercel Cron uses GET, manual triggers use POST). A
 * handler failure can never leak internals — the raw cause stays in
 * diagnostics.
 */
export function withCron(
  handler: (request: NextRequest) => Promise<NextResponse>
): {
  GET: (request: NextRequest) => Promise<NextResponse>;
  POST: (request: NextRequest) => Promise<NextResponse>;
} {
  const wrapped = async (request: NextRequest): Promise<NextResponse> => {
    if (!isCronAuthorized(request.headers.get("authorization"))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    try {
      return await handler(request);
    } catch (error) {
      reportError("cron", "cron handler failed", error);
      return NextResponse.json({ error: "Cron run failed" }, { status: 500 });
    }
  };
  return { GET: wrapped, POST: wrapped };
}
