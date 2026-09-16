import Link from "next/link";
import { CircleCheckIcon, TriangleAlertIcon } from "lucide-react";
import { getSessionUser } from "@/lib/auth";
import { ResendVerificationForm } from "./ResendVerificationForm";
import { AuthShell } from "@/components/AuthShell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

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
    <AuthShell
      title={errorTitle ? "Verification failed" : "Email verified"}
      description={
        errorTitle
          ? errorTitle
          : "Your email address has been successfully verified."
      }
    >
      <div className="flex flex-col gap-4">
        {errorTitle ? (
          <>
            <Alert color="error" variant="outline">
              <TriangleAlertIcon />
              <AlertTitle>Verification failed</AlertTitle>
              <AlertDescription>
                Request a new verification link below.
              </AlertDescription>
            </Alert>
            <ResendVerificationForm />
          </>
        ) : (
          <>
            <Alert color="neutral" variant="outline">
              <CircleCheckIcon />
              <AlertTitle>Verified</AlertTitle>
              <AlertDescription>
                You can now continue to your account.
              </AlertDescription>
            </Alert>
            <Button
              nativeButton={false}
              render={<Link href={user ? "/dashboard" : "/login"} />}
              className="w-full"
            >
              {user ? "Go to dashboard" : "Sign in"}
            </Button>
          </>
        )}
      </div>
    </AuthShell>
  );
}
