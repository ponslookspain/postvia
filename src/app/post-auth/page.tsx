import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { postAuthTarget } from "@/lib/onboarding";

/**
 * Single post-auth decision point (Google OAuth callbacks, OTP clients).
 * Server-side only: incomplete onboardings go to /onboarding (covers
 * refresh/logout/billing-return), paid intents without a subscription go
 * to /billing, everyone else to /dashboard. No client state trusted.
 */
export const dynamic = "force-dynamic";

export default async function PostAuthPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  redirect(await postAuthTarget(user.id, user.email));
}
