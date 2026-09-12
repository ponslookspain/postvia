import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/AppShell";
import { SettingsClient } from "./SettingsClient";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser();

  const [prefs, authAccounts] = await Promise.all([
    prisma.userPreferences.findUnique({
      where: { userId: user.id },
    }),
    prisma.account.findMany({
      where: { userId: user.id },
      select: { providerId: true },
    }),
  ]);

  const providerIds = authAccounts.map((a) => a.providerId);
  const hasPassword = providerIds.includes("credential");
  const hasGoogle = providerIds.includes("google");

  return (
    <AppShell user={user}>
      <SettingsClient
        name={user.name}
        email={user.email}
        emailVerified={user.emailVerified}
        hasPassword={hasPassword}
        hasGoogle={hasGoogle}
        preferences={{
          emailNotifications: prefs?.emailNotifications ?? true,
          productUpdates: prefs?.productUpdates ?? true,
        }}
      />
    </AppShell>
  );
}
