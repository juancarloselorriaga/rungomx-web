import {
  DashboardPageIntroSkeleton,
  LoadingShell,
  LoadingStatGrid,
  LoadingSurface,
  LoadingTextBlock,
} from '@/components/dashboard/page-skeleton';
import { Skeleton } from '@/components/ui/skeleton';
import { Surface } from '@/components/ui/surface';

const ORGANIZER_EVENT_LIST_ITEMS = Array.from({ length: 5 });
const EVENT_DETAIL_ROWS = Array.from({ length: 3 });

export function OrganizerEventsFiltersSkeleton() {
  return (
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
  );
}

export function OrganizerEventsListSkeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      {ORGANIZER_EVENT_LIST_ITEMS.map((_, index) => (
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
  );
}

export function OrganizerEventsPageSkeleton() {
  return (
    <LoadingShell>
      <DashboardPageIntroSkeleton />
      <OrganizerEventsFiltersSkeleton />
      <OrganizerEventsListSkeleton />
    </LoadingShell>
  );
}

export function EventDetailPageSkeleton() {
  return (
    <LoadingShell>
      <DashboardPageIntroSkeleton
        showEyebrow={false}
        showAside={false}
        descriptionWidths={['w-56 max-w-full']}
        actionWidthClassName="h-8 w-24 rounded-full sm:w-36"
      />

      <LoadingStatGrid
        count={4}
        columnsClassName="md:grid-cols-4"
        itemClassName="min-h-24"
        compact
      />

      <LoadingSurface className="p-5">
        <LoadingTextBlock
          lines={['w-64 max-w-full', 'w-96 max-w-full']}
          lineClassName="h-4"
          className="space-y-3"
        />
        <div className="space-y-3">
          {EVENT_DETAIL_ROWS.map((_, index) => (
            <Skeleton key={`event-detail-row-${index}`} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      </LoadingSurface>
    </LoadingShell>
  );
}
