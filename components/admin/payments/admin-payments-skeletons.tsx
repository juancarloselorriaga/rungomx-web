import {
  DashboardPageIntroSkeleton,
  LoadingShell,
  LoadingStatGrid,
  LoadingSurface,
  LoadingTextBlock,
} from '@/components/dashboard/page-skeleton';
import { Skeleton } from '@/components/ui/skeleton';
import { InsetSurface } from '@/components/ui/surface';

export function AdminPaymentsWorkspaceSkeleton() {
  return (
    <LoadingShell>
      <DashboardPageIntroSkeleton showAside={false} actionWidthClassName="h-11 w-full sm:w-80" />

      <LoadingStatGrid count={4} columnsClassName="md:grid-cols-2 xl:grid-cols-4" compact />

      <section className="grid gap-6 2xl:grid-cols-[1.15fr_0.85fr]">
        {Array.from({ length: 2 }).map((_, index) => (
          <LoadingSurface key={`admin-payments-panel-skeleton-${index}`} className="p-5">
            <LoadingTextBlock lines={['w-40', 'w-72']} lineClassName="h-4" className="space-y-3" />
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <InsetSurface className="border-border/55 bg-background/80 p-4">
                <Skeleton className="h-28 w-full rounded-xl" />
              </InsetSurface>
              <InsetSurface className="border-border/55 bg-background/80 p-4">
                <Skeleton className="h-28 w-full rounded-xl" />
              </InsetSurface>
            </div>
            <Skeleton className="mt-5 h-56 w-full rounded-xl" />
          </LoadingSurface>
        ))}
      </section>
    </LoadingShell>
  );
}
