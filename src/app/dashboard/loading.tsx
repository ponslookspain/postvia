import { PageContainer } from "@/components/layout/PageContainer";
import { LoadingBlock } from "@/components/StateBlock";
import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <PageContainer aria-busy="true">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1 basis-56">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="mt-2 h-4 w-64" />
        </div>
        <Skeleton className="h-9 w-32 shrink-0 rounded-lg" />
      </div>

      <div className="flex flex-col" style={{ gap: "var(--section-gap)" }}>
        <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-4 sm:gap-x-6">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="min-w-0">
              <Skeleton className="h-8 w-16" />
              <Skeleton className="mt-2 h-4 w-24" />
              <Skeleton className="mt-1 h-3 w-20" />
            </div>
          ))}
        </div>

        <div className="grid items-start gap-4 lg:grid-cols-3">
          <Skeleton className="h-56 w-full rounded-xl lg:col-span-2" />
          <div className="flex flex-col gap-1">
            <Skeleton className="mb-2 h-4 w-24" />
            <Skeleton className="h-9 w-full rounded-lg" />
            <Skeleton className="h-9 w-full rounded-lg" />
            <Skeleton className="h-9 w-full rounded-lg" />
          </div>
        </div>

        <div>
          <div className="mb-4 flex items-center justify-between gap-4">
            <Skeleton className="h-7 w-32" />
            <Skeleton className="h-4 w-16" />
          </div>
          <LoadingBlock
            rows={3}
            rowClassName="h-24 w-full rounded-xl"
            label="Loading dashboard"
          />
        </div>
      </div>
      <span className="sr-only">Loading dashboard…</span>
    </PageContainer>
  );
}
