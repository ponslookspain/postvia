import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/AppShell";
import { parseMonthParam, type CalendarPost } from "@/lib/calendar";
import { CalendarView } from "./CalendarView";

export const dynamic = "force-dynamic";

const DAY_MS = 86_400_000;
const MAX_POSTS = 200;

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const { year, monthIndex } = parseMonthParam(
    typeof params.month === "string" ? params.month : undefined
  );

  // Visible grid spans the month plus leading/trailing week days: pad the
  // query by a week on each side so edge cells are populated.
  const rangeStart = new Date(Date.UTC(year, monthIndex, 1) - 7 * DAY_MS);
  const rangeEnd = new Date(Date.UTC(year, monthIndex + 1, 1) + 7 * DAY_MS);

  const rows = await prisma.post.findMany({
    where: {
      userId: user.id,
      OR: [
        { scheduledAt: { gte: rangeStart, lte: rangeEnd } },
        { publishedAt: { gte: rangeStart, lte: rangeEnd } },
        { status: "DRAFT" },
        { status: "PUBLISHING" },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: MAX_POSTS,
    include: {
      targets: {
        include: { socialAccount: { select: { username: true } } },
      },
      media: { take: 1, select: { id: true, type: true } },
    },
  });

  // Strip to plain JSON for the client component (Dates don't cross RSC).
  const posts: CalendarPost[] = rows.map((post) => ({
    id: post.id,
    text: post.text,
    status: post.status,
    scheduledAt: post.scheduledAt ? post.scheduledAt.toISOString() : null,
    publishedAt: post.publishedAt ? post.publishedAt.toISOString() : null,
    createdAt: post.createdAt.toISOString(),
    targets: post.targets.map((target) => ({
      platform: target.platform,
      username: target.socialAccount?.username ?? null,
    })),
    previewMedia: post.media[0]
      ? { id: post.media[0].id, type: post.media[0].type }
      : null,
  }));

  return (
    <AppShell user={user}>
      <div className="mx-auto w-full max-w-6xl p-4 md:p-8">
        <CalendarView
          posts={posts}
          year={year}
          monthIndex={monthIndex}
          userName={user.name}
        />
      </div>
    </AppShell>
  );
}
