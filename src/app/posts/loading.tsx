import { Skeleton } from "@/components/ui/skeleton";

export default function PostsLoading() {
  return (
    <div className="mx-auto w-full max-w-5xl p-4 md:p-8" aria-busy="true">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <Skeleton className="h-8 w-32" />
          <Skeleton className="mt-2 h-4 w-64" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-8 w-32" />
        </div>
      </div>
      <div className="mb-2 flex flex-wrap gap-x-4 gap-y-2">
        {Array.from({ length: 7 }).map((_, index) => (
          <Skeleton key={index} className="h-4 w-16" />
        ))}
      </div>
      <div className="divide-y divide-border border-t border-border">
        {Array.from({ length: 5 }).map((_, index) => (
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
      <span className="sr-only">Loading posts…</span>
    </div>
  );
}
