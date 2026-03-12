import { Skeleton } from '@/components/ui/skeleton';

type PaymentsWorkspaceSkeletonProps = {
  showContextCard?: boolean;
  loadingAriaLabel: string;
};

export function PaymentsWorkspaceSkeleton({
  showContextCard = true,
  loadingAriaLabel,
}: PaymentsWorkspaceSkeletonProps) {
  return (
    <div className="space-y-6" role="status" aria-live="polite" aria-label={loadingAriaLabel}>
      {showContextCard ? (
        <section className="rounded-xl border bg-card/80 p-5 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="space-y-2">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-8 w-72 max-w-full" />
              <Skeleton className="h-4 w-80 max-w-full" />
              <Skeleton className="h-4 w-40" />
            </div>
            <Skeleton className="h-10 w-48" />
          </div>
        </section>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(20rem,0.9fr)]">
        <section className="rounded-xl border bg-card/80 p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <Skeleton className="h-7 w-48" />
              <Skeleton className="h-4 w-60" />
            </div>
            <Skeleton className="h-4 w-36" />
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={`wallet-skeleton-${index}`} className="rounded-lg border bg-background/70 p-4">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="mt-3 h-8 w-24" />
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border bg-card/80 p-5 shadow-sm">
          <div className="space-y-2">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-9 w-56" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
          </div>
          <div className="mt-5 space-y-3">
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-full" />
            <Skeleton className="mx-auto h-4 w-28" />
          </div>
        </section>
      </div>

      <section className="space-y-4">
        <div className="space-y-2">
          <Skeleton className="h-8 w-72" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 2 }).map((_, sectionIndex) => (
            <div
              key={`queue-section-skeleton-${sectionIndex}`}
              className="rounded-xl border bg-card/80 p-4 shadow-sm"
            >
              <Skeleton className="h-6 w-40" />
              <Skeleton className="mt-2 h-4 w-80 max-w-full" />
              <div className="mt-4 space-y-3">
                {Array.from({ length: 2 }).map((__, itemIndex) => (
                  <div
                    key={`queue-item-skeleton-${sectionIndex}-${itemIndex}`}
                    className="rounded-lg border bg-background/80 p-4"
                  >
                    <Skeleton className="h-5 w-48" />
                    <Skeleton className="mt-2 h-4 w-full" />
                    <Skeleton className="mt-4 h-4 w-28" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export function PayoutHistorySkeleton() {
  return (
    <section className="rounded-xl border bg-card/80 p-6 shadow-sm">
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-[32rem] max-w-full" />
      </div>
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
    </section>
  );
}

type PayoutDetailSkeletonProps = {
  loadingAriaLabel: string;
};

export function PayoutDetailSkeleton({ loadingAriaLabel }: PayoutDetailSkeletonProps) {
  return (
    <div className="space-y-6" role="status" aria-live="polite" aria-label={loadingAriaLabel}>
      <div className="space-y-3">
        <div className="flex gap-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-28" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-4 w-[28rem] max-w-full" />
        </div>
      </div>

      <section className="rounded-xl border bg-card/80 p-6 shadow-sm">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={`detail-metric-${index}`} className="space-y-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-6 w-24" />
            </div>
          ))}
        </div>
        <Skeleton className="mt-5 h-12 w-44" />
      </section>

      <section className="rounded-xl border bg-card/80 p-6 shadow-sm">
        <div className="space-y-2">
          <Skeleton className="h-8 w-52" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="mt-5 space-y-4">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={`timeline-skeleton-${index}`} className="rounded-xl border bg-background/80 p-5">
              <div className="flex items-center gap-2">
                <Skeleton className="h-6 w-24 rounded-full" />
                <Skeleton className="h-4 w-28" />
              </div>
              <Skeleton className="mt-4 h-6 w-56" />
              <Skeleton className="mt-2 h-4 w-full" />
              <Skeleton className="mt-2 h-4 w-3/4" />
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border bg-card/80 p-6 shadow-sm">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="mt-2 h-4 w-80 max-w-full" />
        <Skeleton className="mt-5 h-11 w-44" />
      </section>
    </div>
  );
}
