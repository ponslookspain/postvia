import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/AppShell";
import { PageContainer } from "@/components/layout/PageContainer";
import { EmptyBlock } from "@/components/StateBlock";
import { canUseCalendar, getEffectivePlan } from "@/lib/entitlements";
import { parseMonthParam, type CalendarPost } from "@/lib/calendar";
import { UpgradeCta } from "@/components/billing/BillingWidgets";
import { CalendarClockIcon } from "lucide-react";
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

  const effective = await getEffectivePlan({ userId: user.id, userEmail: user.email });
  const calendarGate = canUseCalendar(effective);
  if (!calendarGate.ok) {
    return (
      <AppShell user={user}>
        <PageContainer size="wide">
          <EmptyBlock
            icon={<CalendarClockIcon />}
            title="Calendar needs a bigger plan"
            actions={
              <UpgradeCta
                reason="The visual content calendar is not included in your current plan."
                upgradeTo={calendarGate.upgradeTo}
              />
            }
          />
        </PageContainer>
      </AppShell>
    );
  }

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
      <PageContainer size="wide">
        <CalendarView
          posts={posts}
          year={year}
          monthIndex={monthIndex}
          userName={user.name}
        />
      </PageContainer>
    </AppShell>
  );
}
