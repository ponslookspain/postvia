/**
 * One-off, manually-invoked full data reset for Postvia (Vercel Blob + OIDC).
 *
 * Clears ALL user/test data from PostgreSQL (rows only - tables and the
 * Prisma schema are untouched) and deletes every media object under the
 * `media/` prefix from the Vercel Blob store so nothing is left orphaned
 * after the DB reset.
 *
 * Credentials: the Blob store uses OIDC-only auth. There is NO
 * BLOB_READ_WRITE_TOKEN in this project. Local Vercel CLI OIDC tokens are
 * scoped to the "development" environment and are REJECTED by the Blob API,
 * because this project enables OIDC for the production environment only.
 * The script therefore runs a SAFE, read-only ACCESS CHECK (via the Vercel
 * CLI `vercel blob list`) and refuses to delete anything until that check
 * succeeds. Run it inside a production Vercel context (production OIDC) to
 * complete the full reset; from a local dev machine the check fails and
 * nothing is mutated - exactly the intended protection.
 *
 * Usage:
 *   npm run reset:data:check   # access check + read-only summary
 *   npm run reset:data         # requires a passing access check + typing RESET
 *
 * Required environment:
 *   - DATABASE_URL_POSTGRES_PRISMA_URL   (Prisma datasource)
 *   - BLOB_STORE_ID (+ production VERCEL_OIDC_TOKEN) via the environment the
 *     reset is executed in; the Vercel CLI is already linked to the project.
 */

import { PrismaClient } from "@prisma/client";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { spawn } from "node:child_process";
import { list, del } from "@vercel/blob";

const TABLES = [
  "User",
  "Session",
  "Account",
  "Verification",
  "Post",
  "PostTarget",
  "Media",
  "SocialAccount",
  "UserPreferences",
] as const;

const MEDIA_BLOB_PREFIX = "media/";
const BLOB_DELETE_CHUNK_SIZE = 500;
const CLI_TIMEOUT_MS = 120_000;

type CliResult = { code: number; stdout: string; stderr: string };

function hasStdinData(): boolean {
  return !stdin.isTTY;
}

async function countTable(
  prisma: PrismaClient,
  table: string
): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
    `SELECT COUNT(*)::bigint AS count FROM "${table}"`
  );
  return Number(rows[0]?.count ?? BigInt(0));
}

/**
 * Runs `vercel blob ...` via the linked Vercel CLI. Read-only for checks;
 * used for the delete phase too. Never prompts (--yes / --non-interactive).
 */
function runVercelBlobCli(args: string[]): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    const base = ["npx", "--no-install", "vercel", "blob", ...args, "--non-interactive"];
    const child =
      process.platform === "win32"
        ? spawn(base.join(" "), { shell: true, windowsHide: true, stdio: ["ignore", "pipe", "pipe"], env: process.env })
        : spawn("npx", base.slice(1), { stdio: ["ignore", "pipe", "pipe"], env: process.env });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill(), CLI_TIMEOUT_MS);
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, stdout, stderr });
    });
  });
}

function lookupBlobAuth(): string | null {
  if (process.env.BLOB_STORE_ID) {
    if (process.env.VERCEL_OIDC_TOKEN) return "OIDC";
    return "OIDC (no VERCEL_OIDC_TOKEN visible; available inside Vercel)";
  }
  return null;
}

/** Read-only access check. Returns null on success, or an error message. */
async function accessCheckBlob(): Promise<string | null> {
  const cliProbe = await runVercelBlobCli([
    "list",
    `--prefix=${MEDIA_BLOB_PREFIX}`,
    "--limit=1",
  ]);
  if (cliProbe.code !== 0) {
    const detail = (cliProbe.stderr || cliProbe.stdout).trim();
    return `Vercel CLI denied Blob access (exit ${cliProbe.code}):\n  ${detail}`;
  }
  // SDK probe uses identical OIDC credential resolution; confirm it too.
  try {
    await list({ prefix: MEDIA_BLOB_PREFIX, limit: 1 });
  } catch (error) {
    return `Blob SDK probe failed. ${String(error)}`;
  }
  return null;
}

async function listAllMediaBlobs(): Promise<string[]> {
  const pathnames: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: MEDIA_BLOB_PREFIX, cursor, limit: 1000 });
    for (const blob of page.blobs) pathnames.push(blob.pathname);
    cursor = page.cursor ?? undefined;
    if (!page.hasMore) break;
  } while (cursor);
  return pathnames;
}

async function deleteBlobsCli(pathnames: string[]): Promise<void> {
  for (let i = 0; i < pathnames.length; i += BLOB_DELETE_CHUNK_SIZE) {
    const chunk = pathnames.slice(i, i + BLOB_DELETE_CHUNK_SIZE);
    const result = await runVercelBlobCli(["del", ...chunk]);
    if (result.code !== 0) {
      console.warn(
        `vercel blob del failed for a chunk (exit ${result.code}); ` +
          `falling back to Blob SDK del().\n${(result.stderr || result.stdout).trim()}`
      );
      await del(chunk);
    }
    console.log(
      `  deleted ${Math.min(i + BLOB_DELETE_CHUNK_SIZE, pathnames.length)}/${pathnames.length}`
    );
  }
}

async function main() {
  const isCheck = process.argv.includes("--check");
  const authLabel = lookupBlobAuth();

  const prisma = new PrismaClient();
  try {
    const dbInfo = await prisma.$queryRawUnsafe<
      { db: string; user: string; host: string | null }[]
    >(
      "SELECT current_database() AS db, current_user AS user, inet_server_addr()::text AS host"
    );
    const info = dbInfo[0];

    console.log("Postvia full data reset");
    console.log("=========================");
    console.log(`Database: ${info.user}@${info.host ?? "local"} / ${info.db}`);
    console.log(`Blob auth: ${authLabel ?? "MISSING (BLOB_STORE_ID required)"}`);
    console.log(`Vercel env: ${process.env.VERCEL_ENV ?? "local (not on Vercel)"}`);
    console.log("");

    const tableCounts: Record<string, number> = {};
    for (const table of TABLES) {
      tableCounts[table] = await countTable(prisma, table);
    }
    const totalRows = Object.values(tableCounts).reduce((a, b) => a + b, 0);

    console.log("Tables to be cleared (rows):");
    for (const table of TABLES) {
      console.log(`  ${table.padEnd(16)} ${tableCounts[table]}`);
    }
    console.log(`  TOTAL rows                ${totalRows}`);
    console.log("");

    // SAFE ACCESS CHECK - nothing is inspected/deleted until this passes.
    console.log("Access check (read-only; Vercel CLI -> Blob API)...");
    const denial = await accessCheckBlob();
    if (denial) {
      console.error(
        "ACCESS CHECK FAILED - the reset was NOT started and nothing was deleted.\n" +
          denial +
          "\n\nThis is expected when running locally: the Vercel CLI OIDC token " +
          "here is scoped to the development environment, and postvia-blob " +
          "accepts OIDC for the production environment only. Execute the reset " +
          "inside a production Vercel context (production OIDC) and re-run."
      );
      process.exitCode = 1;
      return;
    }
    console.log("Access check OK - Blob store reachable via production OIDC.");

    let blobs: string[];
    try {
      blobs = await listAllMediaBlobs();
    } catch (error) {
      console.error("Could not enumerate Blob objects. The reset was NOT started.\n", error);
      process.exitCode = 1;
      return;
    }
    console.log(
      `Blob objects under ${MEDIA_BLOB_PREFIX}: ${blobs.length}`
    );
    console.log("");

    if (isCheck) {
      console.log("DRY RUN -- nothing was changed.");
      return;
    }

    if (totalRows === 0 && blobs.length === 0) {
      console.log("Nothing to reset; database and Blob store are already empty.");
      return;
    }

    console.log(
      `Type RESET to delete ${totalRows} rows and ${blobs.length} blob object(s), or anything else to abort.`
    );

    let line: string;
    if (hasStdinData()) {
      line = "";
      for await (const chunk of stdin) line += chunk.toString();
      line = line.trim();
    } else {
      const rl = createInterface({ input: stdin, output: stdout });
      try {
        line = (await rl.question("> ")).trim();
      } finally {
        rl.close();
      }
    }
    if (line !== "RESET") {
      console.log("Aborted. Nothing was changed.");
      process.exitCode = 1;
      return;
    }

    if (blobs.length > 0) {
      console.log(`Deleting ${blobs.length} Blob object(s)...`);
      await deleteBlobsCli(blobs);
      console.log("Blob objects deleted.");
    } else {
      console.log("No Blob objects to delete.");
    }

    console.log("Clearing database rows...");
    await prisma.$transaction((tx) =>
      tx.$executeRawUnsafe(
        `TRUNCATE TABLE ${TABLES.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`
      )
    );
    console.log("Database rows cleared.");

    console.log("");
    console.log("Verifying reset...");
    let remainingRows = 0;
    for (const table of TABLES) {
      const n = await countTable(prisma, table);
      remainingRows += n;
      if (n > 0) console.log(`  WARN ${table}: still has ${n} row(s)`);
    }
    const remainingBlobs = await listAllMediaBlobs();
    if (remainingBlobs.length > 0) {
      console.log(
        `  WARN Blob store: ${remainingBlobs.length} object(s) remain under ${MEDIA_BLOB_PREFIX}`
      );
    }

    console.log(
      remainingRows === 0 && remainingBlobs.length === 0
        ? "OK: database and Blob store are empty."
        : "RESET INCOMPLETE -- see warnings above."
    );
    if (remainingRows > 0 || remainingBlobs.length > 0) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("Reset failed:", error);
  process.exitCode = 1;
});