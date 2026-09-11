import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCapabilitiesRegistry } from "@/lib/platforms/capabilities";
import { AppShell } from "@/components/AppShell";
import NewPostComposer from "./NewPostComposer";

export const dynamic = "force-dynamic";

export default async function NewPostPage() {
  const user = await requireUser();

  // Load composer accounts server-side (idempotent page render) so the
  // composer does not need a client GET /api/accounts on mount.
  // Only public display fields are sent — no tokens or secrets.
  const registry = getCapabilitiesRegistry();
  const implemented = new Set(
    registry.filter((capability) => capability.implemented).map((c) => c.platform)
  );
  const accounts = await prisma.socialAccount.findMany({
    where: { userId: user.id },
    select: { id: true, platform: true, username: true },
    orderBy: [{ platform: "asc" }, { username: "asc" }],
  });

  return (
    <AppShell user={user}>
      <NewPostComposer
        userName={user.name}
        accounts={accounts.map((account) => ({
          ...account,
          implemented: implemented.has(account.platform),
        }))}
      />
    </AppShell>
  );
}
