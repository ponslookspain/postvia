import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { emailOTP } from "better-auth/plugins/email-otp";
import { waitUntil } from "@vercel/functions";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { sendOtpEmail, sendVerificationEmail } from "@/lib/email";
import { PRODUCTION_URL, resolveBaseURL } from "@/lib/base-url";
import {
  canonicalizeEmail,
  emailSignal,
  getAbusePepper,
  googleSignal,
  isDisposableEmail,
  liveAbuseStores,
  recordEmailChange,
  resolveAbuseIdentity,
} from "@/lib/abuse";
import { reportError } from "@/lib/diagnostics";
import {
  OTP_EXPIRES_MINUTES,
  OTP_EXPIRES_SECONDS,
  OTP_LENGTH,
  OTP_MAX_ATTEMPTS,
} from "@/lib/otp-config";

/**
 * Best-effort abuse bookkeeping for auth lifecycle events. Hooks must never
 * throw: identity resolution is advisory here (registration, linking), the
 * enforcing gates live on post creation and OAuth connect. Failures are
 * logged and skipped so auth can never break because of anti-abuse.
 */
async function trackNewUser(userId: string, email: string): Promise<void> {
  try {
    const pepper = getAbusePepper();
    await resolveAbuseIdentity({
      userId,
      signals: [emailSignal(email, pepper)],
      stores: liveAbuseStores,
    });
  } catch (error) {
    reportError("abuse", "track new user failed", error, { userId });
  }
}

/**
 * Attaches a changed email to the user's identity (merge-safe: if the new
 * address belongs to another identity the two merge). Best-effort like the
 * other trackers — enforcement lives downstream.
 */
async function trackEmailChange(userId: string, email: string): Promise<void> {
  try {
    const pepper = getAbusePepper();
    await resolveAbuseIdentity({
      userId,
      signals: [emailSignal(email, pepper)],
      stores: liveAbuseStores,
    });
  } catch (error) {
    reportError("abuse", "track email change failed", error, { userId });
  }
}

async function trackGoogleLink(userId: string, googleSub: string): Promise<void> {
  try {
    const pepper = getAbusePepper();
    await resolveAbuseIdentity({
      userId,
      signals: [googleSignal(googleSub, pepper)],
      stores: liveAbuseStores,
    });
  } catch (error) {
    reportError("abuse", "track google link failed", error, { userId });
  }
}

/**
 * Releases the previous address before it is overwritten: the old hash
 * keeps a tombstone (re-registration inherits consumed value, flagged),
 * the live old signal is freed so an unrelated future owner of the
 * recycled address does not silently merge into this live identity.
 * Runs in update.before while the DB row still carries the old address.
 */
async function releaseOldEmail(
  userId: string,
  newEmail: string
): Promise<void> {
  try {
    const current = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (!current?.email) return;
    if (canonicalizeEmail(current.email) === canonicalizeEmail(newEmail)) {
      return;
    }
    await recordEmailChange({
      userId,
      oldEmail: current.email,
      newEmail,
      stores: liveAbuseStores,
    });
  } catch (error) {
    reportError("abuse", "release old email failed", error, { userId });
  }
}

// Plaintext OTP storage ONLY for local automated E2E (explicit flag and
// never any production env): lets the gated debug endpoint read the code
// back. Production and previews always hash.
const otpE2EDebug =
  process.env.OTP_E2E_DEBUG === "1" &&
  process.env.VERCEL_ENV !== "production" &&
  process.env.NODE_ENV !== "production";

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  plugins: [
    emailOTP({
      expiresIn: OTP_EXPIRES_SECONDS,
      otpLength: OTP_LENGTH,
      allowedAttempts: OTP_MAX_ATTEMPTS,
      // Hashed at rest: the raw 6-digit code only exists in the outbound
      // email, never in the Verification table (replay/brute-force guard).
      storeOTP: otpE2EDebug ? "plain" : "hashed",
      // CRITICAL: sign-in OTP must never mint a new User. New accounts are
      // created explicitly by /api/auth/otp/request (Variant A) before the
      // email-verification OTP is sent; login for unknown emails stays a
      // neutral no-send (see src/lib/otp.ts).
      disableSignUp: true,
      // The legacy verification-link flow stays enabled in parallel
      // (emailVerification below) until the OTP flow is fully tested.
      sendVerificationOTP: async ({ email, otp, type }) => {
        await sendOtpEmail(
          { email, otp, type },
          { expiresInMinutes: OTP_EXPIRES_MINUTES }
        );
      },
    }),
  ],
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          const email =
            typeof user.email === "string" ? user.email : "";
          // Disposable mail is the cheapest multi-account fuel: refuse it
          // before the row exists. Returning false aborts creation.
          if (email && isDisposableEmail(email)) {
            return false;
          }
        },
        after: async (user) => {
          if (typeof user.id === "string" && typeof user.email === "string") {
            await trackNewUser(user.id, user.email);
          }
        },
      },
      update: {
        before: async (user) => {
          const email =
            typeof user.email === "string" ? user.email : undefined;
          // Same disposable bar as registration: changing to a throwaway
          // address is refused before it is persisted.
          if (email && isDisposableEmail(email)) {
            return false;
          }
          // Release the previous address while the row still has it.
          const record = user as unknown as Record<string, unknown>;
          if (email && typeof record.id === "string") {
            await releaseOldEmail(record.id, email);
          }
        },
        after: async (user) => {
          const record = user as unknown as Record<string, unknown>;
          if (
            typeof record.id === "string" &&
            typeof record.email === "string"
          ) {
            await trackEmailChange(record.id, record.email);
          }
        },
      },
    },
    account: {
      create: {
        after: async (account) => {
          const record = account as unknown as Record<string, unknown>;
          if (
            record.providerId === "google" &&
            typeof record.accountId === "string" &&
            typeof record.userId === "string"
          ) {
            await trackGoogleLink(record.userId, record.accountId);
          }
        },
      },
    },
  },
  secret: process.env.BETTER_AUTH_SECRET!,
  basePath: "/api/auth",
  // Dynamic per-request base URL (Better Auth `allowedHosts`): the host is
  // taken from the incoming request and must match the allowlist, so
  // Production stays on postvia.online while Preview stays on its own
  // hostname (hash URL or branch alias). A static string here would pin
  // every environment to one host: with the shared BETTER_AUTH_URL env
  // (Production+Preview scope) Preview auth escapes to postvia.online and
  // dies with state_mismatch (OAuth state/session cookies are host-bound).
  // `fallback` only applies when no request host can be resolved; it keeps
  // today's production resolution untouched.
  baseURL: {
    allowedHosts: [
      "postvia.online",
      "www.postvia.online",
      "*.vercel.app",
      "localhost:3000",
    ],
    fallback: resolveBaseURL() ?? PRODUCTION_URL,
  },
  trustedOrigins: [
    "http://localhost:3000",
    "https://postvia.online",
    "https://www.postvia.online",
    "https://*.vercel.app",
  ],
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    requireEmailVerification: true,
  },
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    expiresIn: 3600,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendVerificationEmail(user, url);
    },
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },
  account: {
    accountLinking: {
      trustedProviders: ["google"],
    },
  },
  advanced: {
    backgroundTasks: {
      handler: waitUntil,
    },
  },
});

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image?: string | null;
};

export async function getSessionUser(): Promise<AuthUser | null> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  return session?.user ?? null;
}

export async function requireUser(): Promise<AuthUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export async function getApiUser(): Promise<AuthUser | null> {
  return getSessionUser();
}
