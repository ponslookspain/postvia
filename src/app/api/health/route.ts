import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Liveness + minimal dependency health in a single endpoint (per launch
// scope: no separate /db route). Public response carries no secrets,
// no internal error text, and no PII. The DB probe is a single
// `SELECT 1` — no heavy queries.
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  let db: "ok" | "unreachable" = "unreachable";
  try {
    await prisma.$queryRaw`SELECT 1`;
    db = "ok";
  } catch {
    db = "unreachable";
  }
  const body = { ok: db === "ok", db, time: new Date().toISOString() };
  return NextResponse.json(body, {
    status: db === "ok" ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
