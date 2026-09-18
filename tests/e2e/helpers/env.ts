/**
 * E2E environment helpers (no `@/` imports: Playwright resolves helpers
 * without the Next path alias, so this module only uses relative imports
 * and external packages).
 *
 * Safety is load-bearing here: every spec must call `e2eBaseUrl()` (which
 * asserts the target is a local/dev origin) before creating users.
 */

// Playwright workers are plain Node processes: unlike `next dev` they do
// not auto-load .env.local. Load it (and .env) via the Node built-in so
// DATABASE_URL_* / secrets resolve the same way as the app. Ambient env
// (CI secrets) always wins — loadEnvFile never overrides existing vars.
try {
  const nodeProcess = globalThis.process;
  const loadEnvFile = (
    nodeProcess as unknown as {
      loadEnvFile?: (path?: string) => void;
    }
  ).loadEnvFile;
  if (typeof loadEnvFile === "function") {
    for (const file of [".env.local", ".env"]) {
      try {
        loadEnvFile.call(nodeProcess, file);
      } catch {
        // Missing file: fine (CI injects env directly).
      }
    }
  }
} catch {
  // Extremely defensive: env loading must never break the suite.
}

export const E2E_PASSWORD = "E2e-Test-12345!";

export function e2eBaseUrl(): string {
  const raw =
    process.env.E2E_BASE ?? process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100";
  assertSafeBaseUrl(raw);
  return raw.replace(/\/$/, "");
}

/** Refuse production-like targets unless explicitly overridden. */
export function assertSafeBaseUrl(url: string): void {
  const lowered = url.toLowerCase();
  const override = process.env.E2E_ALLOW_REMOTE === "1";
  const blocked =
    lowered.includes("postvia.online") ||
    lowered.includes("vercel.app") ||
    (!lowered.includes("localhost") && !lowered.includes("127.0.0.1"));
  if (blocked && !override) {
    throw new Error(
      `Refusing to run browser E2E against "${url}". ` +
        `Use a local dev server (E2E_BASE=http://127.0.0.1:3100). ` +
        `Override only with E2E_ALLOW_REMOTE=1 for an explicitly approved preview.`
    );
  }
}

/** Unique throwaway address; compatible with scripts/cleanup-test-users.ts. */
export function testEmail(tag: string): string {
  const safe = tag.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  return `pw-e2e-${Date.now()}-${safe}@example.com`;
}

/** Guard destructive helpers against non-test addresses. */
export function assertThrowawayEmail(email: string): void {
  const lowered = email.toLowerCase();
  if (!lowered.startsWith("pw-e2e-") && !lowered.startsWith("otp-e2e-")) {
    throw new Error(`Refusing destructive E2E action for non-test email "${email}".`);
  }
  if (!lowered.endsWith("@example.com")) {
    throw new Error(`Refusing destructive E2E action for non-example email "${email}".`);
  }
}

export function debugToken(): string {
  return process.env.OTP_DEBUG_TOKEN ?? "";
}

export function isOtpDebugConfigured(): boolean {
  return process.env.OTP_E2E_DEBUG === "1" && debugToken().length > 0;
}
