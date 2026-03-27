import {
  DashboardPageIntroSkeleton,
  LoadingShell,
  LoadingStatGrid,
  LoadingSurface,
  LoadingTextBlock,
} from '@/components/dashboard/page-skeleton';
import { Skeleton } from '@/components/ui/skeleton';
import { InsetSurface, Surface } from '@/components/ui/surface';

type PaymentsWorkspaceSkeletonProps = {
  showContextCard?: boolean;
  loadingAriaLabel: string;
};

export function PaymentsWorkspaceSkeleton({
  showContextCard = true,
  loadingAriaLabel,
}: PaymentsWorkspaceSkeletonProps) {
  return (
    <LoadingShell loadingAriaLabel={loadingAriaLabel}>
      {showContextCard ? <DashboardPageIntroSkeleton showActions={false} /> : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(20rem,0.9fr)]">
        <LoadingSurface>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <LoadingTextBlock lines={['w-48', 'w-60']} lineClassName="h-4" className="space-y-3" />
            <Skeleton className="h-4 w-36" />
          </div>
          <LoadingStatGrid
            count={4}
            columnsClassName="sm:grid-cols-2 xl:grid-cols-4"
            itemClassName="p-4"
            compact
          />
        </LoadingSurface>

        <LoadingSurface variant="inset" className="border-border/60 bg-background/80 p-5">
          <LoadingTextBlock lines={['w-28', 'w-56', 'w-full', 'w-4/5']} lineClassName="h-4" />
          <div className="mt-5 space-y-3">
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-full" />
            <Skeleton className="mx-auto h-4 w-28" />
          </div>
        </LoadingSurface>
      </div>

      <section className="space-y-4">
        <LoadingTextBlock
          lines={['w-72', 'w-96 max-w-full']}
          lineClassName="h-4"
          className="space-y-3"
        />
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 2 }).map((_, sectionIndex) => (
            <Surface key={`queue-section-skeleton-${sectionIndex}`} className="p-4">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="mt-2 h-4 w-80 max-w-full" />
              <div className="mt-4 space-y-3">
                {Array.from({ length: 2 }).map((__, itemIndex) => (
                  <InsetSurface
                    key={`queue-item-skeleton-${sectionIndex}-${itemIndex}`}
                    className="border-border/55 bg-background/80 p-4"
                  >
                    <Skeleton className="h-5 w-48" />
                    <Skeleton className="mt-2 h-4 w-full" />
                    <Skeleton className="mt-4 h-4 w-28" />
                  </InsetSurface>
                ))}
              </div>
            </Surface>
          ))}
        </div>
      </section>
    </LoadingShell>
  );
}

export function PayoutHistorySkeleton() {
  return (
    <LoadingSurface className="p-6">
      <LoadingTextBlock
        lines={['w-56', 'w-[32rem] max-w-full']}
        lineClassName="h-4"
        className="space-y-3"
      />
      <div className="mt-6 overflow-hidden rounded-lg border">
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1.2fr_44px] gap-4 border-b bg-muted/20 px-4 py-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={`history-header-${index}`} className="h-4 w-full" />
          ))}
        </div>
        {Array.from({ length: 5 }).map((_, rowIndex) => (
          <div
            key={`history-row-${rowIndex}`}
            className="grid grid-cols-[2fr_1fr_1fr_1fr_1.2fr_44px] gap-4 border-b px-4 py-4 last:border-b-0"
          >
            {Array.from({ length: 6 }).map((__, cellIndex) => (
              <Skeleton key={`history-cell-${rowIndex}-${cellIndex}`} className="h-5 w-full" />
            ))}
          </div>
        ))}
      </div>
    </LoadingSurface>
  );
}

type PayoutDetailSkeletonProps = {
  loadingAriaLabel: string;
};

export function PayoutDetailSkeleton({ loadingAriaLabel }: PayoutDetailSkeletonProps) {
  return (
    <LoadingShell loadingAriaLabel={loadingAriaLabel}>
      <DashboardPageIntroSkeleton
        showEyebrow={false}
        showActions={false}
        showAside={false}
        descriptionWidths={['w-[28rem] max-w-full']}
      />

      <LoadingSurface className="p-6">
        <LoadingTextBlock lines={['w-48', 'w-72']} lineClassName="h-4" className="space-y-3" />
        <LoadingStatGrid count={4} columnsClassName="md:grid-cols-2 xl:grid-cols-4" compact />
        <Skeleton className="mt-5 h-12 w-44" />
      </LoadingSurface>

      <LoadingSurface className="p-6">
        <LoadingTextBlock lines={['w-52', 'w-72']} lineClassName="h-4" className="space-y-3" />
        <div className="mt-5 space-y-4">
          {Array.from({ length: 3 }).map((_, index) => (
            <InsetSurface
              key={`timeline-skeleton-${index}`}
              className="border-border/55 bg-background/80 p-5"
            >
              <div className="flex items-center gap-2">
                <Skeleton className="h-6 w-24 rounded-full" />
                <Skeleton className="h-4 w-28" />
              </div>
              <Skeleton className="mt-4 h-6 w-56" />
              <Skeleton className="mt-2 h-4 w-full" />
              <Skeleton className="mt-2 h-4 w-3/4" />
            </InsetSurface>
          ))}
        </div>
      </LoadingSurface>

      <LoadingSurface className="p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="mt-2 h-4 w-80 max-w-full" />
        <Skeleton className="mt-5 h-11 w-44" />
      </LoadingSurface>
    </LoadingShell>
  );
}
