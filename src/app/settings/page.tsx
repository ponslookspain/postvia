import { requireUser } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser();

  return (
    <AppShell user={user}>
      <div className="p-8 max-w-5xl">
        <h1 className="text-2xl font-semibold mb-8">Settings</h1>
        <div className="border border-border rounded-lg p-12 text-center">
          <p className="text-muted-foreground text-sm">
            Settings coming soon
          </p>
        </div>
      </div>
    </AppShell>
  );
}