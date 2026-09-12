import { Skeleton } from "@/components/ui/skeleton";

function FeedSkeletonRows({ count }: { count: number }) {
  return (
    <div className="divide-y divide-border border-t border-border">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="flex items-start gap-4 py-5 sm:gap-5">
          <Skeleton className="size-20 shrink-0 rounded-lg sm:size-24" />
          <div className="min-w-0 flex-1">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="mt-2 h-4 w-2/3" />
            <div className="mt-2 flex items-center gap-2">
              <Skeleton className="size-4 rounded-full" />
              <Skeleton className="h-5 w-20 rounded-4xl" />
              <Skeleton className="h-3 w-28" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function DashboardLoading() {
  return (
    <div className="mx-auto w-full max-w-5xl p-4 md:p-8" aria-busy="true">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <Skeleton className="h-8 w-40" />
          <Skeleton className="mt-2 h-4 w-64" />
        </div>
        <Skeleton className="h-8 w-32" />
      </div>

      <div className="flex flex-col gap-10">
        <div>
          <div className="mb-2 flex items-center gap-2.5">
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-5 w-8 rounded-4xl" />
          </div>
          <FeedSkeletonRows count={2} />
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between gap-4">
            <Skeleton className="h-7 w-24" />
            <Skeleton className="h-4 w-28" />
          </div>
          <FeedSkeletonRows count={3} />
        </div>

        <div>
          <div className="mb-4 flex items-center justify-between gap-4">
            <Skeleton className="h-7 w-32" />
            <Skeleton className="h-4 w-16" />
          </div>
          <div className="mb-4">
            <Skeleton className="h-8 w-full max-w-md" />
          </div>
          <FeedSkeletonRows count={5} />
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-border pt-5">
          <div className="min-w-0 flex-1">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="mt-2 h-3 w-48" />
          </div>
          <Skeleton className="h-7 w-24 shrink-0" />
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-border pt-5">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-24" />
        </div>
      </div>
      <span className="sr-only">Loading dashboard…</span>
    </div>
  );
}
