/**
 * Production schema-drift gate.
 *
 * WHY THIS EXISTS
 * Production was created with `prisma db push` and carries no
 * `_prisma_migrations` history (see docs/database.md), so migrations are
 * applied by hand as single psql statements. Nothing verified that the result
 * matched `prisma/schema.prisma`. A forgotten statement surfaces later as a
 * runtime P2022 — which has already happened once (see the comment in
 * src/app/api/posts/route.ts).
 *
 * `tests/schema-drift.test.ts` covers this offline, but only for the specific
 * columns and indexes someone remembered to add to its list. This closes the
 * general case by asking the database itself.
 *
 * SAFETY
 * - **Strictly read-only.** `migrate diff` only introspects; it never applies
 *   anything. Point it at a read-only role anyway (defence in depth).
 * - **Refuses to run against a pooled endpoint.** PgBouncer in transaction
 *   mode cannot serve introspection reliably, so the UNPOOLED/direct URL is
 *   required — and that requirement is checked rather than assumed.
 * - **Skips cleanly when unconfigured**, so CI stays green on forks and on
 *   branches without access to the secret.
 *
 * Usage:
 *   SCHEMA_DRIFT_DATABASE_URL=<direct, read-only> npm run check:schema-drift
 *
 * Exit codes: 0 = no drift (or skipped), 1 = drift detected or check failed.
 */
import { spawnSync } from "node:child_process";

const URL_VAR = "SCHEMA_DRIFT_DATABASE_URL";

function main(): void {
  const url = process.env[URL_VAR]?.trim();
  if (!url) {
    console.info(
      `[schema-drift] ${URL_VAR} is not set — skipping.\n` +
        `[schema-drift] Set it to a DIRECT (unpooled), read-only production ` +
        `connection string to enable this gate.`
    );
    return;
  }

  // The pooled endpoint cannot serve introspection reliably. Neon marks the
  // pooled host with `-pooler`; PgBouncer generally with `pgbouncer=true`.
  if (/-pooler\./.test(url) || /pgbouncer=true/i.test(url)) {
    console.error(
      `[schema-drift] ${URL_VAR} points at a POOLED endpoint. Introspection ` +
        `needs the direct/unpooled URL (DATABASE_URL_UNPOOLED / PGHOST_UNPOOLED).`
    );
    process.exit(1);
  }

  const result = spawnSync(
    "npx",
    [
      "prisma",
      "migrate",
      "diff",
      "--from-url",
      url,
      "--to-schema-datamodel",
      "prisma/schema.prisma",
      "--script",
      "--exit-code",
    ],
    { encoding: "utf8", shell: process.platform === "win32" }
  );

  if (result.error) {
    console.error("[schema-drift] could not run prisma migrate diff", result.error);
    process.exit(1);
  }

  // `--exit-code`: 0 = no difference, 2 = differences found, 1 = error.
  if (result.status === 0) {
    console.info("[schema-drift] production matches prisma/schema.prisma.");
    return;
  }

  if (result.status === 2) {
    console.error(
      "[schema-drift] DRIFT DETECTED. Production does not match " +
        "prisma/schema.prisma.\n" +
        "[schema-drift] The SQL below is what production is MISSING " +
        "(apply it by hand per docs/database.md — never `db push` on prod):\n"
    );
    // The diff is DDL only: table/column/index names, never row data.
    console.error(result.stdout.trim() || "(no script emitted)");
    process.exit(1);
  }

  console.error(
    `[schema-drift] check failed (exit ${result.status}).\n${result.stderr.trim()}`
  );
  process.exit(1);
}

main();
