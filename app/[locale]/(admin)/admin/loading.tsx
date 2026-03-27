import {
  DashboardPageIntroSkeleton,
  LoadingShell,
  LoadingSurface,
  LoadingTextBlock,
} from '@/components/dashboard/page-skeleton';
import { Skeleton } from '@/components/ui/skeleton';

export default function AdminDashboardLoading() {
  return (
    <LoadingShell>
      <DashboardPageIntroSkeleton showActions={false} showAside={false} />

      <section className="space-y-4">
        <div className="flex items-baseline justify-between gap-4">
          <LoadingTextBlock lines={['w-32', 'w-56']} lineClassName="h-4" className="space-y-3" />
          <Skeleton className="h-3 w-16" />
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((key) => (
            <LoadingSurface key={key} className="flex h-full flex-col justify-between p-4">
              <div className="flex items-baseline justify-between gap-3">
                <div>
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="mt-2 h-3 w-40" />
                </div>
                <Skeleton className="h-6 w-16" />
              </div>
              <Skeleton className="mt-4 h-[200px] w-full" />
            </LoadingSurface>
          ))}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {[0, 1].map((key) => (
            <LoadingSurface key={key} className="flex h-full flex-col justify-between p-4">
              <div className="flex items-baseline justify-between gap-3">
                <div>
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="mt-2 h-3 w-44" />
                </div>
                <Skeleton className="h-6 w-20" />
              </div>
              <Skeleton className="mt-4 h-[200px] w-full" />
            </LoadingSurface>
          ))}
        </div>
      </section>
    </LoadingShell>
  );
}
