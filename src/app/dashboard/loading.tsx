import { PageContainer } from "@/components/layout/PageContainer";
import { LoadingBlock } from "@/components/StateBlock";
import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <PageContainer aria-busy="true">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-x-4 gap-y-4">
        <div className="min-w-0 flex-1 basis-72">
          <Skeleton className="h-8 w-52" />
          <Skeleton className="mt-2.5 h-5 w-80 max-w-full" />
        </div>
        <Skeleton className="h-9 w-32 shrink-0 rounded-full" />
      </div>

      <div className="flex flex-col" style={{ gap: "var(--section-gap)" }}>
        <Skeleton className="h-48 w-full rounded-2xl" />

        <div>
          <div className="mb-4 flex items-center justify-between gap-4">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-16" />
          </div>
          <LoadingBlock
            rows={2}
            rowClassName="h-20 w-full rounded-xl"
            label="Loading dashboard"
          />
        </div>

        <Skeleton className="h-52 w-full rounded-2xl" />
        <Skeleton className="h-14 w-full rounded-xl" />
      </div>
      <span className="sr-only">Loading dashboard…</span>
    </PageContainer>
  );
}
