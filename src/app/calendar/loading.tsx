import { Skeleton } from "@/components/ui/skeleton";

export default function CalendarLoading() {
  return (
    <div className="mx-auto w-full max-w-6xl p-4 md:p-8" aria-busy="true">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <Skeleton className="h-8 w-40" />
          <Skeleton className="mt-2 h-4 w-64" />
        </div>
        <Skeleton className="h-8 w-32" />
      </div>
      <div className="mb-4 flex items-center justify-between gap-4">
        <Skeleton className="h-7 w-40" />
        <div className="flex gap-2">
          <Skeleton className="h-7 w-20" />
          <Skeleton className="h-7 w-20" />
          <Skeleton className="h-7 w-20" />
        </div>
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-border bg-border">
          {Array.from({ length: 49 }).map((_, index) => (
            <Skeleton key={index} className="h-16 rounded-none sm:h-24" />
          ))}
        </div>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      </div>
      <span className="sr-only">Loading calendar…</span>
    </div>
  );
}
