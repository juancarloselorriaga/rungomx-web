import { Skeleton } from '@/components/ui/skeleton';

const LIST_ITEMS = Array.from({ length: 5 });

export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-10 w-40" />
      </div>

      <div className="rounded-xl border bg-card p-4 shadow-sm space-y-4">
        <div className="space-y-1">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-40" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-8 w-20" />
        </div>
      </div>

      <div className="space-y-4">
        {LIST_ITEMS.map((_, index) => (
          <div
            key={`event-skeleton-${index}`}
            className="overflow-hidden rounded-xl border bg-card shadow-sm"
          >
            <div className="flex flex-col sm:flex-row">
              <Skeleton className="relative aspect-[16/9] w-full sm:aspect-auto sm:h-28 sm:w-44" />
              <div className="flex min-w-0 flex-1 items-start justify-between gap-4 p-4 sm:p-5">
                <div className="min-w-0 space-y-3 flex-1">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-5 w-48" />
                    <Skeleton className="h-5 w-20" />
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                  <Skeleton className="h-3 w-40" />
                </div>
                <Skeleton className="h-5 w-5" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
