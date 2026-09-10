import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { getOrCreateDemoUser } from "@/lib/auth";
import AccountsContent from "./AccountsContent";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const user = await getOrCreateDemoUser();
  const [xAccount, threadsAccount] = await Promise.all([
    prisma.socialAccount.findUnique({
      where: {
        userId_platform: {
          userId: user.id,
          platform: "X",
        },
      },
      select: {
        id: true,
        platform: true,
        externalId: true,
        username: true,
        createdAt: true,
      },
    }),
    prisma.socialAccount.findUnique({
      where: {
        userId_platform: {
          userId: user.id,
          platform: "THREADS",
        },
      },
      select: {
        id: true,
        platform: true,
        externalId: true,
        username: true,
        createdAt: true,
      },
    }),
  ]);

  const serialize = (account: typeof xAccount) =>
    account ? { ...account, createdAt: account.createdAt.toISOString() } : null;

  return (
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
      />
    </Suspense>
  );
}