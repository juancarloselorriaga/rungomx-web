import {
  DashboardPageIntroSkeleton,
  LoadingShell,
  LoadingSurface,
} from '@/components/dashboard/page-skeleton';
import { UsersTableSkeleton } from '@/components/admin/users/users-table-skeleton';
import { Skeleton } from '@/components/ui/skeleton';

export default function UsersLoading() {
  return (
    <LoadingShell>
      <DashboardPageIntroSkeleton showActions={false} showAside={false} />

      <LoadingSurface className="p-4">
        <Skeleton className="h-4 w-16" />
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-10 w-64 rounded-md" />
          <Skeleton className="h-10 w-20 rounded-md" />
          <Skeleton className="h-10 w-16 rounded-md" />
          <Skeleton className="h-10 w-16 rounded-md" />
          <Skeleton className="h-10 w-24 rounded-md" />
          <Skeleton className="h-10 w-28 rounded-md" />
          <Skeleton className="h-10 w-28 rounded-md" />
        </div>
      </LoadingSurface>

      <UsersTableSkeleton
        rows={5}
        columns={{ user: true, role: true, created: true, actions: true }}
        showHeader
        minWidthClassName="min-w-[720px]"
      />
    </LoadingShell>
  );
}
