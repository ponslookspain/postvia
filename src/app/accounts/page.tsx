import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { Skeleton } from "@/components/ui/skeleton";
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
          expiresAt: true,
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
          expiresAt: true,
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
    ]);

  const serialize = (account: typeof xAccount) =>
    account
      ? {
          ...account,
          createdAt: account.createdAt.toISOString(),
          expiresAt: account.expiresAt ? account.expiresAt.toISOString() : null,
        }
      : null;

  return (
    <AppShell user={user}>
      <Suspense
        fallback={
          <div className="mx-auto w-full max-w-5xl p-4 md:p-8">
            <div className="mb-6">
              <Skeleton className="h-8 w-40" />
              <Skeleton className="mt-2 h-4 w-64" />
            </div>
            <div className="flex flex-col gap-4">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-32 w-full" />
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
