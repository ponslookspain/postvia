import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getCapabilitiesRegistry,
} from "@/lib/platforms/capabilities";
import { AppShell } from "@/components/AppShell";
import { BulkScheduler } from "./BulkScheduler";

export const dynamic = "force-dynamic";

export default async function BulkPostsPage() {
  const user = await requireUser();

  // Only accounts whose platform can publish video are offered: anything
  // else could never produce a valid bulk item (capability registry).
  const registry = getCapabilitiesRegistry();
  const videoCapable = new Set(
    registry
      .filter(
        (capability) => capability.implemented && capability.media.video
      )
      .map((capability) => capability.platform)
  );
  const accounts = await prisma.socialAccount.findMany({
    where: { userId: user.id },
    select: { id: true, platform: true, username: true },
    orderBy: [{ platform: "asc" }, { username: "asc" }],
  });

  return (
    <AppShell user={user}>
      <BulkScheduler
        accounts={accounts
          .filter((account) => videoCapable.has(account.platform))
          .map((account) => ({ ...account }))}
      />
    </AppShell>
  );
}
