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
    include: { targets: { include: { socialAccount: { select: { username: true } } } }, media: true },
  });

  if (!post) notFound();

  const serialized = {
    ...post,
    username: post.targets[0]?.socialAccount?.username ?? null,
    createdAt: post.createdAt.toISOString(),
    scheduledAt: post.scheduledAt?.toISOString() ?? null,
    publishedAt: post.publishedAt?.toISOString() ?? null,
    media: post.media.map((m) => ({
      id: m.id,
      filename: m.filename,
      mimeType: m.mimeType,
      size: m.size,
      type: m.type,
      createdAt: m.createdAt.toISOString(),
    })),
  };

  return (
    <AppShell user={user}>
      <PostDetailClient params={Promise.resolve({ id })} post={serialized} />
    </AppShell>
  );
}
