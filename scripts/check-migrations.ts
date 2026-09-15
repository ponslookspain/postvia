/**
 * Prisma migration/schema drift check.
 *
 * Diffs the committed migration history against the current schema and
 * fails on ANY delta: every schema change must ship with its migration,
 * and every migration statement must still apply to the schema. Runs
 * against a THROWAWAY shadow database only (CI postgres service) — never
 * production. Fails closed when no shadow URL is provided.
 *
 * Usage:
 *   node --import tsx scripts/check-migrations.ts \
 *     --shadow-database-url postgresql://... (throwaway database server)
 */
import { execSync } from "node:child_process";

const ROOT = process.cwd();

const args = process.argv.slice(2);

function readShadowUrl(): string {
  // Accept --flag=value, --flag value (some shells split `=` pairs), and
  // the SHADOW_DATABASE_URL env var (no shell interpolation at all).
  const eq = args.find((arg) => arg.startsWith("--shadow-database-url="));
  if (eq) return eq.slice("--shadow-database-url=".length);
  const idx = args.indexOf("--shadow-database-url");
  if (idx !== -1 && typeof args[idx + 1] === "string") {
    return args[idx + 1] as string;
  }
  return process.env.SHADOW_DATABASE_URL ?? "";
}

const shadowUrl = readShadowUrl();

function fail(message: string): never {
  console.log(`FAIL ${message}`);
  process.exit(1);
}

if (!shadowUrl) {
  fail(
    "a throwaway --shadow-database-url is required (refusing to run without one)"
  );
}

// The shadow host must never be the application database: drift checks
// create temporary shadow databases on that server, and pointing them at
// the app (or smoke) database risks touching real data stores.
const appDbUrl = process.env.DATABASE_URL_POSTGRES_PRISMA_URL ?? "";
if (appDbUrl && shadowUrl === appDbUrl) {
  fail("shadow database must be separate from the application database");
}

let diff: string;
try {
  // Shell-resolved so npx.cmd works on Windows runners too.
  diff = execSync(
    "npx prisma migrate diff --from-migrations ./prisma/migrations " +
      "--to-schema-datamodel ./prisma/schema.prisma " +
      `--shadow-database-url "${shadowUrl}" --script`,
    { encoding: "utf8", cwd: ROOT }
  );
} catch (error) {
  fail(
    `could not compute the migration diff (${String((error as Error)?.message ?? error).split("\n")[0]})`
  );
}

if (diff.trim().length === 0) {
  console.log("PASS migrations match schema (empty drift diff)");
  process.exit(0);
}

fail(
  "migration history drifted from prisma/schema.prisma:\n" +
    diff
      .trim()
      .split("\n")
      .slice(0, 20)
      .map((line) => `  ${line}`)
      .join("\n")
);
