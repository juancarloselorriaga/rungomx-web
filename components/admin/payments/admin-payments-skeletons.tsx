import { Skeleton } from '@/components/ui/skeleton';

export function AdminPaymentsWorkspaceSkeleton() {
  return (
    <div className="space-y-6">
      <section className="rounded-3xl border bg-card/70 p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-9 w-40" />
            <Skeleton className="h-4 w-72" />
          </div>
          <Skeleton className="h-11 w-full sm:w-80" />
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={`admin-payments-workspace-skeleton-${index}`}
              className="rounded-2xl border bg-background/80 px-4 py-4"
            >
              <Skeleton className="h-4 w-28" />
              <Skeleton className="mt-3 h-3 w-40" />
              <Skeleton className="mt-2 h-3 w-36" />
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={`admin-payments-stat-skeleton-${index}`}
            className="rounded-2xl border bg-card/70 p-4 shadow-sm"
          >
            <Skeleton className="h-3 w-28" />
            <Skeleton className="mt-3 h-8 w-24" />
          </div>
        ))}
      </section>

      <section className="grid gap-6 2xl:grid-cols-[1.15fr_0.85fr]">
        {Array.from({ length: 2 }).map((_, index) => (
          <div
            key={`admin-payments-panel-skeleton-${index}`}
            className="rounded-2xl border bg-card/70 p-5 shadow-sm"
          >
            <Skeleton className="h-5 w-40" />
            <Skeleton className="mt-2 h-4 w-72" />
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <Skeleton className="h-28 w-full rounded-xl" />
              <Skeleton className="h-28 w-full rounded-xl" />
            </div>
            <Skeleton className="mt-5 h-56 w-full rounded-xl" />
          </div>
        ))}
      </section>
    </div>
  );
}
