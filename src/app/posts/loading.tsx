import { PageContainer } from "@/components/layout/PageContainer";
import { LoadingBlock } from "@/components/StateBlock";
import { Skeleton } from "@/components/ui/skeleton";

export default function PostsLoading() {
  return (
    <PageContainer aria-busy="true">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1 basis-56">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="mt-2 h-4 w-64" />
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Skeleton className="h-9 w-28 rounded-lg" />
          <Skeleton className="h-9 w-32 rounded-lg" />
        </div>
      </div>
      <div className="mb-6 flex gap-5 overflow-x-auto border-b border-border">
        {Array.from({ length: 7 }).map((_, index) => (
          <Skeleton key={index} className="h-8 w-16 shrink-0 rounded-none" />
        ))}
      </div>
      <div className="mb-6 flex flex-col gap-2 md:flex-row">
        <Skeleton className="h-9 w-full" />
        <div className="flex gap-2">
          <Skeleton className="h-9 w-full md:w-40" />
          <Skeleton className="h-9 w-full md:w-36" />
        </div>
      </div>
      <div
        aria-hidden="true"
        className="hidden grid-cols-[64px_minmax(0,1fr)_150px_140px_120px_44px] items-center gap-4 border-b border-border py-3 md:grid"
      >
        <Skeleton className="h-3 w-12" />
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-14" />
        <Skeleton className="h-3 w-12" />
        <span />
      </div>
      <LoadingBlock
        rows={5}
        rowClassName="h-20 w-full"
        label="Loading posts"
      />
      <span className="sr-only">Loading posts…</span>
    </PageContainer>
  );
}
