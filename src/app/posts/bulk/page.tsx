import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getCapabilitiesRegistry,
} from "@/lib/platforms/capabilities";
import {
  getEffectivePlan,
  getRemainingQuota,
  getUpgradeTarget,
  getUsage,
} from "@/lib/entitlements";
import { AppShell } from "@/components/AppShell";
import { BulkScheduler } from "./BulkScheduler";

export const dynamic = "force-dynamic";

export default async function BulkPostsPage() {
  const user = await requireUser();

  // Only accounts whose platform can publish media are offered: anything
  // else could never produce a valid bulk item (capability registry).
  const registry = getCapabilitiesRegistry();
  const videoCapable = new Set(
    registry
      .filter(
        (capability) => capability.implemented && capability.media.video
      )
      .map((capability) => capability.platform)
  );
  const [accounts, effective, usage] = await Promise.all([
    prisma.socialAccount.findMany({
      where: { userId: user.id },
      select: { id: true, platform: true, username: true },
      orderBy: [{ platform: "asc" }, { username: "asc" }],
    }),
    getEffectivePlan({ userId: user.id, userEmail: user.email }),
    getUsage(user.id),
  ]);
  const quota = getRemainingQuota(effective, usage);

  return (
    <AppShell user={user}>
      <BulkScheduler
        accounts={accounts
          .filter((account) => videoCapable.has(account.platform))
          .map((account) => ({ ...account }))}
        billing={{
          bulk: effective.bypass || effective.entitlements.bulk,
          maxBulk: effective.bypass
            ? Number.MAX_SAFE_INTEGER
            : effective.entitlements.maxBulkVideos,
          postsLeft: quota.postsLeft,
          upgradeTo: getUpgradeTarget(effective.plan),
        }}
      />
    </AppShell>
  );
}
