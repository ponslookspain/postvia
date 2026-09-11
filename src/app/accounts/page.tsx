import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import AccountsContent from "./AccountsContent";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const user = await requireUser();
  const [xAccount, threadsAccount, tiktokAccounts, instagramAccounts] =
    await Promise.all([
      prisma.socialAccount.findFirst({
        where: { userId: user.id, platform: "X" },
        select: {
          id: true,
          platform: true,
          externalId: true,
          username: true,
          createdAt: true,
        },
      }),
      prisma.socialAccount.findFirst({
        where: { userId: user.id, platform: "THREADS" },
        select: {
          id: true,
          platform: true,
          externalId: true,
          username: true,
          createdAt: true,
        },
      }),
      prisma.socialAccount.findMany({
        where: { userId: user.id, platform: "TIKTOK" },
        select: {
          id: true,
          platform: true,
          externalId: true,
          username: true,
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
          createdAt: true,
        },
        orderBy: { username: "asc" },
      }),
    ]);

  const serialize = (account: typeof xAccount) =>
    account ? { ...account, createdAt: account.createdAt.toISOString() } : null;

  return (
    <AppShell user={user}>
      <Suspense
        fallback={
          <div className="p-8 max-w-5xl">
            <h1 className="text-2xl font-semibold mb-8">Accounts</h1>
            <div className="border border-border rounded-lg p-12 text-center">
              <p className="text-muted-foreground text-sm">Loading...</p>
            </div>
          </div>
        }
      >
        <AccountsContent
          xAccount={serialize(xAccount)}
          threadsAccount={serialize(threadsAccount)}
          tiktokAccounts={tiktokAccounts.map((account) => ({
            ...account,
            createdAt: account.createdAt.toISOString(),
          }))}
          instagramAccounts={instagramAccounts.map((account) => ({
            ...account,
            createdAt: account.createdAt.toISOString(),
          }))}
        />
      </Suspense>
    </AppShell>
  );
}
