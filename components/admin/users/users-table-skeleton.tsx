'use client';

import { Skeleton } from '@/components/ui/skeleton';

type UsersTableSkeletonProps = {
  rows?: number;
  columns: {
    user?: boolean;
    role?: boolean;
    created?: boolean;
    actions?: boolean;
  };
  rowPadding?: 'py-2' | 'py-3';
  showHeader?: boolean;
  minWidthClassName?: string;
  renderAsRows?: boolean;
};

export function UsersTableSkeleton({
  rows = 5,
  columns,
  rowPadding = 'py-3',
  showHeader = false,
  minWidthClassName = 'min-w-[820px]',
  renderAsRows = false,
}: UsersTableSkeletonProps) {
  const columnOrder = [
    { key: 'name', visible: columns.user !== false },
    { key: 'role', visible: !!columns.role },
    { key: 'created', visible: !!columns.created },
    { key: 'actions', visible: !!columns.actions },
  ] as const;

  const rowsMarkup = Array.from({ length: rows }).map((_, index) => (
    <tr key={`skeleton-${index}`} className="border-t">
      {columns.user !== false ? (
        <td className={`px-4 align-top ${rowPadding}`}>
          <div className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-40" />
          </div>
        </td>
      ) : null}
      {columns.role ? (
        <td className={`px-4 align-top ${rowPadding}`}>
          <div className="flex gap-2">
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-5 w-12 rounded-full" />
          </div>
        </td>
      ) : null}
      {columns.created ? (
        <td className={`px-4 align-top ${rowPadding}`}>
          <Skeleton className="h-4 w-24" />
        </td>
      ) : null}
      {columns.actions ? (
        <td className={`px-4 align-top ${rowPadding}`}>
          <Skeleton className="ml-auto h-8 w-20" />
        </td>
      ) : null}
    </tr>
  ));

  if (renderAsRows) {
    return <>{rowsMarkup}</>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border/60 bg-[color-mix(in_oklch,var(--background)_82%,var(--background-surface)_18%)] shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <table className={`w-full ${minWidthClassName} text-sm`}>
        {showHeader ? (
          <thead className="bg-muted/30">
            <tr>
              {columnOrder
                .filter((col) => col.visible)
                .map((col) => (
                  <th key={col.key} className="px-4 py-3">
                    <Skeleton className="h-3 w-20" />
                  </th>
                ))}
            </tr>
          </thead>
        ) : null}
        <tbody>{rowsMarkup}</tbody>
      </table>
    </div>
  );
}
