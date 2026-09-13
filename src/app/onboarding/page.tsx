import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdminEmail } from "@/lib/entitlements";
import { OnboardingForm } from "./OnboardingForm";

export const dynamic = "force-dynamic";

/**
 * Name + plan selection for users with onboardingCompleted=false.
 * Finished users (and the admin) never see this screen.
 */
export default async function OnboardingPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (isAdminEmail(user.email)) redirect("/dashboard");
  const row = await prisma.user.findUnique({
    where: { id: user.id },
    select: { onboardingCompleted: true, name: true },
  });
  if (row?.onboardingCompleted) redirect("/dashboard");
  return <OnboardingForm initialName={row?.name && row.name !== "" ? row.name : user.name} />;
}
