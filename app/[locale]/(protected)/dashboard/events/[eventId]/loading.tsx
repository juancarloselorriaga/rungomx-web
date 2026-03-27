import { Skeleton } from '@/components/ui/skeleton';

const CONTENT_ROWS = Array.from({ length: 3 });

export default function EventDetailLoading() {
  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border/60 bg-background/90 p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-2">
            <Skeleton className="h-8 w-72 max-w-full" />
            <Skeleton className="h-4 w-56 max-w-full" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-8 w-24 rounded-full" />
            <Skeleton className="h-8 w-36" />
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-4">
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </section>

      <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] space-y-4">
        <div className="space-y-2">
          <Skeleton className="h-6 w-64 max-w-full" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>

        <div className="space-y-3">
          {CONTENT_ROWS.map((_, index) => (
            <Skeleton key={`event-detail-row-${index}`} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      </section>
    </div>
  );
}
