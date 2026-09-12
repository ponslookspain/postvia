import { Skeleton } from "@/components/ui/skeleton";

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

      <div className="mb-10 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {["Posts", "Drafts", "Scheduled", "Published"].map((label) => (
          <div
            key={label}
            className="rounded-lg border border-border p-5"
          >
            <Skeleton className="mb-2 h-4 w-20" />
            <Skeleton className="h-9 w-12" />
          </div>
        ))}
      </div>

      <div className="mb-4 flex items-center justify-between gap-4">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-4 w-16" />
      </div>
      <div className="mb-10 flex items-center justify-between gap-4 rounded-lg border border-border p-4">
        <div className="min-w-0 flex-1">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="mt-2 h-3 w-48" />
        </div>
        <Skeleton className="h-7 w-24 shrink-0" />
      </div>
      <div className="mb-4 flex items-center justify-between gap-4">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-4 w-16" />
      </div>
      <div className="rounded-lg border border-border divide-y divide-border">
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={index}
            className="flex items-center justify-between gap-4 p-4"
          >
            <div className="min-w-0 flex-1">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="mt-2 h-3 w-1/3" />
            </div>
            <Skeleton className="h-5 w-20 shrink-0 rounded-4xl" />
          </div>
        ))}
      </div>
      <span className="sr-only">Loading dashboard…</span>
    </div>
  );
}
