/**
 * Deploy-time environment guard (names only — values are never read,
 * printed, or logged).
 *
 * 1. Parity: every `process.env.NAME` / `env.NAME` reference under
 *    `src/` and `scripts/` (excluding `*.test.ts`) must be documented in
 *    `.env.example`. Fails the run on any undocumented name so a new
 *    variable can never silently miss deployment configuration.
 * 2. Boot presence: the app cannot boot without these names set. Fails
 *    when any is missing/empty. Override with `--require-boot=A,B`.
 * 3. Production recommended: warned (never failed) when absent so a
 *    degraded deployment is visible without blocking a hotfix.
 *
 * Usage:
 *   node --import tsx scripts/check-env.ts [--require-boot=A,B]
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// Invoked from the repository root (npm script convention), so the
// working directory is the project root. Values are never inspected.
const ROOT = process.cwd();
const BOOT_DEFAULT = [
  "DATABASE_URL_POSTGRES_PRISMA_URL",
  "BETTER_AUTH_SECRET",
];
// Warn-only: degraded features (auth email, abuse enforcement, cron,
// social login) when absent — see docs/environment.md.
const RECOMMENDED = [
  "ABUSE_HASH_PEPPER",
  "RESEND_API_KEY",
  "CRON_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|mts)$/.test(entry) && !/\.test\./.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

// Platform-provided at runtime (Vercel/Next/Node) — never app config,
// so excluded from the .env.example parity requirement.
const PLATFORM_PROVIDED = new Set([
  "NEXT_RUNTIME",
  "NODE_ENV",
  "VERCEL_ENV",
  "VERCEL_URL",
  "VERCEL_PROJECT_PRODUCTION_URL",
  "VERCEL_OIDC_TOKEN",
]);
const NAME = "[A-Z][A-Z0-9_]*";
const envRefs = new RegExp(`(?:process\\.env|[^\\w$.]env)\\.(${NAME})`, "g");

const referenced = new Set<string>();
for (const file of [...walk(join(ROOT, "src")), ...walk(join(ROOT, "scripts"))]) {
  // Skip self: this script intentionally reads env metadata.
  if (relative(ROOT, file) === join("scripts", "check-env.ts")) continue;
  const text = readFileSync(file, "utf8");
  for (const match of text.matchAll(envRefs)) referenced.add(match[1]);
}
// `process.env["QUOTED"]` form.
for (const file of [...walk(join(ROOT, "src")), ...walk(join(ROOT, "scripts"))]) {
  if (relative(ROOT, file) === join("scripts", "check-env.ts")) continue;
  const text = readFileSync(file, "utf8");
  for (const match of text.matchAll(/process\.env\[\s*"([A-Z][A-Z0-9_]*)"\s*\]/g)) {
    referenced.add(match[1]);
  }
}

const documented = new Set<string>();
const examplePath = join(ROOT, ".env.example");
for (const line of readFileSync(examplePath, "utf8").split("\n")) {
  const match = line.match(/^\s*#?\s*([A-Z][A-Z0-9_]*)\s*=/);
  if (match) documented.add(match[1]);
}

let failures = 0;
const missingDocs = [...referenced]
  .filter((n) => !PLATFORM_PROVIDED.has(n) && !documented.has(n))
  .sort();
if (missingDocs.length > 0) {
  failures++;
  console.log("FAIL undocumented env names (add to .env.example):");
  for (const n of missingDocs) console.log(`  - ${n}`);
} else {
  console.log(`PASS env parity (${referenced.size} referenced, all documented)`);
}

const bootArg = process.argv.find((a) => a.startsWith("--require-boot="));
const required = (bootArg ? bootArg.slice("--require-boot=".length) : "")
  ? bootArg!.slice("--require-boot=".length).split(",").filter(Boolean)
  : BOOT_DEFAULT;
const missingBoot = required.filter((n) => !process.env[n]);
if (missingBoot.length > 0) {
  failures++;
  console.log("FAIL required env names missing:");
  for (const n of missingBoot) console.log(`  - ${n}`);
} else {
  console.log(`PASS required env present (${required.join(", ")})`);
}

const missingRecommended = RECOMMENDED.filter((n) => !process.env[n]);
if (missingRecommended.length > 0) {
  console.log("WARN recommended env names absent (degraded features):");
  for (const n of missingRecommended) console.log(`  - ${n}`);
} else {
  console.log("PASS recommended env present");
}

process.exit(failures > 0 ? 1 : 0);
