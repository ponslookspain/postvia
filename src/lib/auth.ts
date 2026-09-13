import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { waitUntil } from "@vercel/functions";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { sendVerificationEmail } from "@/lib/email";
import { resolveBaseURL } from "@/lib/base-url";
import {
  emailSignal,
  getAbusePepper,
  googleSignal,
  isDisposableEmail,
  liveAbuseStores,
  resolveAbuseIdentity,
} from "@/lib/abuse";
import { reportError } from "@/lib/diagnostics";

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

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
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
  baseURL: resolveBaseURL(),
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
