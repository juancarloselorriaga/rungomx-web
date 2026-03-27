import {
  DashboardPageIntroSkeleton,
  LoadingShell,
  LoadingSurface,
  LoadingTextBlock,
} from '@/components/dashboard/page-skeleton';
import { Skeleton } from '@/components/ui/skeleton';
import { Surface } from '@/components/ui/surface';

const LIST_ITEMS = Array.from({ length: 5 });

export default function Loading() {
  return (
    <LoadingShell>
      <DashboardPageIntroSkeleton />

      <LoadingSurface>
        <LoadingTextBlock lines={['w-32', 'w-40']} lineClassName="h-4" />
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
      </LoadingSurface>

      <div className="space-y-4">
        {LIST_ITEMS.map((_, index) => (
          <Surface key={`event-skeleton-${index}`} className="overflow-hidden p-0">
            <div className="flex flex-col sm:flex-row">
              <Skeleton className="relative aspect-[16/9] w-full sm:aspect-auto sm:h-28 sm:w-44" />
              <div className="flex min-w-0 flex-1 items-start justify-between gap-4 p-4 sm:p-5">
                <div className="min-w-0 flex-1 space-y-3">
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
          </Surface>
        ))}
      </div>
    </LoadingShell>
  );
}
