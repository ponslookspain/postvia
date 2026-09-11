import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { ResendVerificationForm } from "./ResendVerificationForm";

export const dynamic = "force-dynamic";

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : null;
  const user = await getSessionUser();

  const errorMessages: Record<string, string> = {
    TOKEN_EXPIRED: "This verification link has expired.",
    INVALID_TOKEN: "This verification link is invalid.",
    USER_NOT_FOUND: "No account was found for this email address.",
  };

  const errorTitle = errorMessages[error ?? ""] ?? null;

  return (
    <div className="min-h-screen flex items-center justify-center p-8">
      <div className="w-full max-w-sm text-center">
        {errorTitle ? (
          <>
            <div className="mb-6 text-4xl">⚠️</div>
            <h1 className="text-2xl font-semibold mb-2">
              Verification failed
            </h1>
            <p className="text-sm text-muted-foreground mb-6">{errorTitle}</p>
            <ResendVerificationForm />
          </>
        ) : (
          <>
            <div className="mb-6 text-4xl">✅</div>
            <h1 className="text-2xl font-semibold mb-2">Email verified</h1>
            <p className="text-sm text-muted-foreground mb-6">
              Your email address has been successfully verified.
            </p>
            {user ? (
              <Link
                href="/dashboard"
                className="inline-block bg-primary text-primary-foreground text-sm font-medium px-4 py-2 rounded-md hover:opacity-90 transition-opacity"
              >
                Go to dashboard
              </Link>
            ) : (
              <Link
                href="/login"
                className="inline-block bg-primary text-primary-foreground text-sm font-medium px-4 py-2 rounded-md hover:opacity-90 transition-opacity"
              >
                Sign in
              </Link>
            )}
          </>
        )}
      </div>
    </div>
  );
}
