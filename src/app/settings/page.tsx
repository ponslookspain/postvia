import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/AppShell";
import { SettingsClient } from "./SettingsClient";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser();

  const prefs = await prisma.userPreferences.findUnique({
    where: { userId: user.id },
  });

  return (
    <AppShell user={user}>
      <SettingsClient
        name={user.name}
        email={user.email}
        emailVerified={user.emailVerified}
        preferences={{
          emailNotifications: prefs?.emailNotifications ?? true,
          productUpdates: prefs?.productUpdates ?? true,
        }}
      />
    </AppShell>
  );
}