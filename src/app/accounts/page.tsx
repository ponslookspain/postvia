import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { getEffectivePlan } from "@/lib/entitlements";
import { AppShell } from "@/components/AppShell";
import { PageContainer } from "@/components/layout/PageContainer";
import { LoadingBlock } from "@/components/StateBlock";
import AccountsContent from "./AccountsContent";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const user = await requireUser();
  const [xAccounts, threadsAccounts, tiktokAccounts, instagramAccounts, effective] =
    await Promise.all([
      prisma.socialAccount.findMany({
        where: { userId: user.id, platform: "X" },
        select: {
          id: true,
          platform: true,
          externalId: true,
          username: true,
          expiresAt: true,
          createdAt: true,
        },
        orderBy: { username: "asc" },
      }),
      prisma.socialAccount.findMany({
        where: { userId: user.id, platform: "THREADS" },
        select: {
          id: true,
          platform: true,
          externalId: true,
          username: true,
          expiresAt: true,
          createdAt: true,
        },
        orderBy: { username: "asc" },
      }),
      prisma.socialAccount.findMany({
        where: { userId: user.id, platform: "TIKTOK" },
        select: {
          id: true,
          platform: true,
          externalId: true,
          username: true,
          expiresAt: true,
          createdAt: true,
        },
        orderBy: { username: "asc" },
      }),
      prisma.socialAccount.findMany({
        where: { userId: user.id, platform: "INSTAGRAM" },
        select: {
          id: true,
          platform: true,
          externalId: true,
          username: true,
          expiresAt: true,
          createdAt: true,
        },
        orderBy: { username: "asc" },
      }),
      getEffectivePlan({ userId: user.id, userEmail: user.email }),
    ]);

  const totalAccounts =
    xAccounts.length +
    threadsAccounts.length +
    tiktokAccounts.length +
    instagramAccounts.length;

  const serialize = (account: (typeof threadsAccounts)[number]) => ({
    ...account,
    createdAt: account.createdAt.toISOString(),
    expiresAt: account.expiresAt ? account.expiresAt.toISOString() : null,
  });

  return (
    <AppShell user={user}>
      <Suspense
        fallback={
          <PageContainer>
            <LoadingBlock
              rows={4}
              rowClassName="h-44 w-full rounded-xl"
              label="Loading accounts"
            />
          </PageContainer>
        }
      >
        <AccountsContent
          accountsLimit={effective.entitlements.maxTotalAccounts}
          totalAccounts={totalAccounts}
          xAccounts={xAccounts.map((account) => ({
            ...account,
            createdAt: account.createdAt.toISOString(),
            expiresAt: account.expiresAt ? account.expiresAt.toISOString() : null,
          }))}
          threadsAccounts={threadsAccounts.map(serialize)}
          tiktokAccounts={tiktokAccounts.map((account) => ({
            ...account,
            createdAt: account.createdAt.toISOString(),
            expiresAt: account.expiresAt ? account.expiresAt.toISOString() : null,
          }))}
          instagramAccounts={instagramAccounts.map((account) => ({
            ...account,
            createdAt: account.createdAt.toISOString(),
            expiresAt: account.expiresAt ? account.expiresAt.toISOString() : null,
          }))}
        />
      </Suspense>
    </AppShell>
  );
}
