import { PageContainer } from "@/components/layout/PageContainer";
import { LoadingBlock } from "@/components/StateBlock";
import { Skeleton } from "@/components/ui/skeleton";

export default function PostsLoading() {
  return (
    <PageContainer aria-busy="true">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1 basis-48">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="mt-2 h-4 w-64" />
        </div>
        <div className="flex shrink-0 gap-2">
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-8 w-32" />
        </div>
      </div>
      <div className="mb-4 flex flex-wrap gap-x-4 gap-y-2">
        {Array.from({ length: 7 }).map((_, index) => (
          <Skeleton key={index} className="h-4 w-16" />
        ))}
      </div>
      <div className="mb-4 flex flex-col gap-2 md:flex-row">
        <Skeleton className="h-11 w-full" />
        <div className="flex gap-2">
          <Skeleton className="h-11 w-full md:w-40" />
          <Skeleton className="h-11 w-full md:w-36" />
        </div>
      </div>
      <LoadingBlock
        rows={5}
        rowClassName="h-24 w-full rounded-xl"
        label="Loading posts"
      />
      <span className="sr-only">Loading posts…</span>
    </PageContainer>
  );
}
