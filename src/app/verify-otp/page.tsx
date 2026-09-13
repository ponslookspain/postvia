import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { VerifyOtpForm } from "./VerifyOtpForm";

export const dynamic = "force-dynamic";

export default async function VerifyOtpPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Already signed in with a finished session and no pending OTP context:
  // still allow the page (a fresh code may have just been requested).
  // Post-verify routing is decided server-side by /post-auth.
  await getSessionUser();
  const params = await searchParams;
  const email = typeof params.email === "string" ? params.email : "";
  const mode = params.mode === "login" ? ("login" as const) : ("signup" as const);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    redirect(mode === "login" ? "/login" : "/signup");
  }
  return <VerifyOtpForm email={email} mode={mode} />;
}
