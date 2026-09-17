/**
 * Backfill: encrypt social tokens that are still stored in plaintext.
 *
 * Step 3 of the rollout described in docs/backend-audit-followup.md:
 *   1. deploy the code (no key set)  -> nothing changes
 *   2. set SOCIAL_TOKEN_KEY          -> new writes encrypt, old rows still read
 *   3. run this                      -> existing rows catch up
 *
 * Safety properties:
 * - **Idempotent.** Rows already encrypted are skipped, so re-running is free
 *   and a partial run simply resumes.
 * - **Never races a token rotation.** Each row is written with a conditional
 *   update keyed on the exact value that was read (the same compare-and-swap
 *   `ensureFresh*Token` uses). If a refresh rotated the row in between, this
 *   updates nothing and moves on — the rotation already wrote ciphertext.
 * - **Read-only by default.** Requires `--apply` to write; otherwise it
 *   reports what it would do.
 *
 * Usage:
 *   npm run backfill:token-encryption          # dry run
 *   npm run backfill:token-encryption -- --apply
 */
import { prisma } from "../src/lib/prisma";
import {
  encryptToken,
  isEncryptedToken,
  resolveTokenCrypto,
} from "../src/lib/social-token-crypto";

const APPLY = process.argv.includes("--apply");
const BATCH = 200;

type Row = {
  id: string;
  accessToken: string;
  refreshToken: string | null;
};

async function main(): Promise<void> {
  const config = resolveTokenCrypto();
  if (!config) {
    console.error(
      "SOCIAL_TOKEN_KEY is not set — nothing to back fill onto. Set the key first."
    );
    process.exitCode = 1;
    return;
  }
  console.info(
    `[backfill] key ${config.keyId}, mode ${APPLY ? "APPLY" : "dry-run"}`
  );

  let cursor: string | undefined;
  let scanned = 0;
  let encrypted = 0;
  let alreadyDone = 0;
  let rotatedUnderUs = 0;

  for (;;) {
    const rows: Row[] = await prisma.socialAccount.findMany({
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: BATCH,
      orderBy: { id: "asc" },
      select: { id: true, accessToken: true, refreshToken: true },
    });
    if (rows.length === 0) break;
    cursor = rows[rows.length - 1].id;

    for (const row of rows) {
      scanned++;
      const accessDone = isEncryptedToken(row.accessToken);
      const refreshDone =
        row.refreshToken === null || isEncryptedToken(row.refreshToken);
      if (accessDone && refreshDone) {
        alreadyDone++;
        continue;
      }
      if (!APPLY) {
        encrypted++;
        continue;
      }

      // Conditional on BOTH values as read: a concurrent refresh that rotated
      // this row wrote ciphertext already, and must not be overwritten with a
      // re-encryption of the stale token.
      const result = await prisma.socialAccount.updateMany({
        where: {
          id: row.id,
          accessToken: row.accessToken,
          refreshToken: row.refreshToken,
        },
        data: {
          accessToken: encryptToken(row.accessToken, config),
          ...(row.refreshToken !== null
            ? { refreshToken: encryptToken(row.refreshToken, config) }
            : {}),
        },
      });
      if (result.count > 0) encrypted++;
      else rotatedUnderUs++;
    }
  }

  console.info(
    `[backfill] scanned=${scanned} encrypted=${encrypted} ` +
      `alreadyEncrypted=${alreadyDone} rotatedConcurrently=${rotatedUnderUs}`
  );
  if (!APPLY) {
    console.info("[backfill] dry run — re-run with --apply to write.");
  }
}

main()
  .catch((error) => {
    console.error("[backfill] failed", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
