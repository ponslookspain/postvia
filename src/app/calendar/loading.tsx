import { PageContainer } from "@/components/layout/PageContainer";
import { Skeleton } from "@/components/ui/skeleton";

function DaySkeleton({ chips }: { chips: number }) {
  return (
    <div className="flex h-20 flex-col gap-1 overflow-hidden bg-card p-1 sm:h-36 sm:p-1.5">
      <Skeleton className="size-6 shrink-0 rounded-full" />
      {Array.from({ length: chips }).map((_, index) => (
        <Skeleton key={index} className="hidden h-6 w-full rounded-md sm:block" />
      ))}
    </div>
  );
}

export default function CalendarLoading() {
  return (
    <PageContainer size="wide" aria-busy="true">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1 basis-56">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="mt-2 h-4 w-64" />
        </div>
        <Skeleton className="h-9 w-32 shrink-0 rounded-lg" />
      </div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex items-center gap-1">
          <Skeleton className="size-7 rounded-md" />
          <Skeleton className="h-7 w-44" />
          <Skeleton className="size-7 rounded-md" />
        </div>
        <Skeleton className="h-9 w-20 rounded-lg" />
      </div>
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div>
          <div className="grid grid-cols-7 gap-px overflow-hidden rounded-2xl bg-border">
            {Array.from({ length: 7 }).map((_, index) => (
              <Skeleton key={index} className="h-8 rounded-none" />
            ))}
            <DaySkeleton chips={2} />
            <DaySkeleton chips={1} />
            <DaySkeleton chips={3} />
            <DaySkeleton chips={0} />
            <DaySkeleton chips={1} />
            <DaySkeleton chips={2} />
            <DaySkeleton chips={0} />
            <DaySkeleton chips={1} />
            <DaySkeleton chips={0} />
            <DaySkeleton chips={2} />
            <DaySkeleton chips={1} />
            <DaySkeleton chips={0} />
            <DaySkeleton chips={3} />
            <DaySkeleton chips={1} />
          </div>
          <div className="mt-3 flex gap-4">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-20" />
          </div>
        </div>
        <div className="min-w-0">
          <div className="flex items-baseline justify-between gap-3">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-4 w-6" />
          </div>
          <div className="mt-3 flex flex-col gap-1.5">
            <Skeleton className="h-[52px] w-full rounded-lg" />
            <Skeleton className="h-[52px] w-full rounded-lg" />
            <Skeleton className="h-[52px] w-full rounded-lg" />
          </div>
        </div>
      </div>
      <span className="sr-only">Loading calendar…</span>
    </PageContainer>
  );
}
