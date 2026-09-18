import { PrismaClient } from "@prisma/client";
import {
  APIRequestContext,
  Browser,
  expect,
  request as playwrightRequest,
} from "@playwright/test";
import {
  E2E_PASSWORD,
  assertThrowawayEmail,
  e2eBaseUrl,
  testEmail,
} from "./env";

/**
 * Test-user provisioning for browser E2E.
 *
 * Why password signup (not OTP) for setup:
 * `POST /api/auth/otp/request` requires a working Resend key (OTP refuses
 * to report success when nothing is sent — see src/lib/otp.ts), so it
 * cannot provision users on a key-less CI runner. The legacy password
 * signup (`POST /api/auth/sign-up/email`) dev-skips the verification mail
 * when RESEND_API_KEY is absent (see src/lib/email.ts), so we create the
 * user with a password, flip `emailVerified` via Prisma (same DB the app
 * uses — never production, guarded by assertSafeBaseUrl), then sign in.
 * The single real UI OTP flow lives in auth.otp.spec.ts and reuses the
 * triple-gated debug endpoint instead of this helper.
 */

export type ProvisionOptions = {
  tag: string;
  password?: string;
  name?: string;
  plan?: "free" | "growth" | "scale";
  /** Insert a fake THREADS social account row (plaintext token, CI throwaway only). */
  withFakeAccount?: boolean;
};

export type ProvisionedUser = {
  api: APIRequestContext;
  email: string;
  password: string;
};

function prisma(): PrismaClient {
  return new PrismaClient();
}

export async function provisionUser(opts: ProvisionOptions): Promise<ProvisionedUser> {
  const baseURL = e2eBaseUrl();
  const email = testEmail(opts.tag);
  const password = opts.password ?? E2E_PASSWORD;
  const api = await playwrightRequest.newContext({ baseURL });
  try {
    return await provisionInner(api, email, password, opts);
  } catch (error) {
    // Failure-atomic setup: a half-provisioned row (e.g. signup ok but
    // sign-in failed) must not become an orphan. Best-effort direct delete
    // of the throwaway address only; the error still propagates.
    await api.dispose().catch(() => undefined);
    const db = prisma();
    try {
      assertThrowawayEmail(email);
      await db.user.deleteMany({ where: { email } });
    } catch {
      // Cleanup is advisory here; the failure below is what matters.
    } finally {
      await db.$disconnect();
    }
    throw error;
  }
}

async function provisionInner(
  api: APIRequestContext,
  email: string,
  password: string,
  opts: ProvisionOptions
): Promise<ProvisionedUser> {

  // 1. Password signup via Better Auth core (verification mail dev-skips
  //    without RESEND_API_KEY; OTP would 400/500 instead).
  const signup = await api.post("/api/auth/sign-up/email", {
    data: { name: "", email, password, callbackURL: "/dashboard" },
  });
  if (!signup.ok()) {
    const body = await signup.text();
    throw new Error(`E2E signup failed (${signup.status()}): ${body.slice(0, 300)}`);
  }

  // 2. Mark verified directly (test DB only).
  const db = prisma();
  try {
    await db.user.update({ where: { email }, data: { emailVerified: true } });
  } finally {
    await db.$disconnect();
  }

  // 3. Password sign-in -> session cookies land in this API context.
  const signin = await api.post("/api/auth/sign-in/email", {
    data: { email, password },
  });
  if (!signin.ok()) {
    const body = await signin.text();
    throw new Error(`E2E sign-in failed (${signin.status()}): ${body.slice(0, 300)}`);
  }

  // 4. Complete onboarding (free by default; server returns { next }).
  const name = opts.name ?? `E2E ${opts.tag}`;
  const plan = opts.plan ?? "free";
  const ob = await api.post("/api/onboarding", { data: { name, plan } });
  if (!ob.ok()) {
    const body = await ob.text();
    throw new Error(`E2E onboarding failed (${ob.status()}): ${body.slice(0, 300)}`);
  }

  // 5. Optional fake social account so composer/schedule/calendar/detail
  //    flows have a selectable target without real OAuth. Tokens are fake
  //    and the rows belong to the throwaway user (cascade-deleted).
  if (opts.withFakeAccount) {
    const db2 = prisma();
    try {
      const user = await db2.user.findUnique({ where: { email }, select: { id: true } });
      if (!user) throw new Error("E2E user vanished after onboarding");
      await db2.socialAccount.create({
        data: {
          userId: user.id,
          platform: "THREADS",
          externalId: `e2e-${Date.now()}`,
          username: "e2e_fake",
          accessToken: "e2e-fake-token-never-used-against-provider",
        },
      });
    } finally {
      await db2.$disconnect();
    }
  }

  return { api, email, password };
}

/** Persist the API context cookies as a Playwright storageState file. */
export async function saveStorageState(
  api: APIRequestContext,
  path: string
): Promise<void> {
  await api.storageState({ path });
}

/** Open a fresh browser context from a saved storageState file. */
export async function contextFromState(browser: Browser, path: string) {
  return browser.newContext({ storageState: path });
}

/**
 * Destructive cleanup: DELETE /api/settings/account (exercises the real
 * product flow). Falls back to a direct Prisma delete only if the API call
 * fails for a throwaway user. Never touches non-test addresses.
 */
export async function cleanupUser(api: APIRequestContext, email: string): Promise<void> {
  assertThrowawayEmail(email);
  const res = await api.delete("/api/settings/account", {
    data: { confirmation: "delete" },
  });
  if (res.ok()) return;
  // Fallback: direct row delete (cascade removes posts/targets/media/
  // sessions/accounts). Used only when the API path already failed.
  const db = prisma();
  try {
    await db.user.deleteMany({ where: { email } });
  } finally {
    await db.$disconnect();
    await api.dispose().catch(() => undefined);
  }
}

/** Create a DRAFT post via API (requires withFakeAccount user). */
export async function createDraftPost(
  api: APIRequestContext,
  text: string,
  opts?: { scheduledAt?: string }
): Promise<{ id: string; accountId: string }> {
  const accounts = await api.get("/api/accounts");
  expect(accounts.ok()).toBeTruthy();
  // GET /api/accounts returns a bare array (see src/app/api/accounts/route.ts).
  const list = (await accounts.json()) as Array<{ id: string; platform: string }>;
  const account = Array.isArray(list) ? list[0] : undefined;
  if (!account) throw new Error("E2E: no social account for draft creation");
  const res = await api.post("/api/posts", {
    data: {
      text,
      accountIds: [account.id],
      ...(opts?.scheduledAt ? { scheduledAt: opts.scheduledAt } : {}),
    },
  });
  if (!res.ok()) {
    const body = await res.text();
    throw new Error(`E2E post create failed (${res.status()}): ${body.slice(0, 300)}`);
  }
  const post = (await res.json()) as { id: string };
  return { id: post.id, accountId: account.id };
}
