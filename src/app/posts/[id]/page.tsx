import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import PostDetailClient from "./PostDetailClient";

export const dynamic = "force-dynamic";

export default async function PostDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();

  const post = await prisma.post.findFirst({
    where: { id, userId: user.id },
    include: { targets: true },
  });

  if (!post) notFound();

  const targetPlatform = post.targets[0]?.platform;
  const account = targetPlatform
    ? await prisma.socialAccount.findUnique({
        where: {
          userId_platform: {
            userId: post.userId,
            platform: targetPlatform,
          },
        },
        select: { username: true },
      })
    : null;

  const serialized = {
    ...post,
    username: account?.username ?? null,
    createdAt: post.createdAt.toISOString(),
    scheduledAt: post.scheduledAt?.toISOString() ?? null,
    publishedAt: post.publishedAt?.toISOString() ?? null,
  };

  return (
    <AppShell user={user}>
      <PostDetailClient params={Promise.resolve({ id })} post={serialized} />
    </AppShell>
  );
}
