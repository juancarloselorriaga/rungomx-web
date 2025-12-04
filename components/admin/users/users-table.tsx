'use client';

import type { AdminUserRow } from '@/app/actions/admin-users-list';
import { buildAdminUsersQueryObject } from '@/components/admin/users/search-params';
import { UsersPermissionBadge } from '@/components/admin/users/users-permission-badge';
import { UsersTableActions } from '@/components/admin/users/users-table-actions';
import { UsersTablePagination } from '@/components/admin/users/users-table-pagination';
import { UsersTableToolbar } from '@/components/admin/users/users-table-toolbar';
import { Button } from '@/components/ui/button';
import type { ColumnKey } from '@/lib/admin-users/types';
import { cn } from '@/lib/utils';
import { usePathname, useRouter } from '@/i18n/navigation';
import { useSearchParams } from 'next/navigation';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useEffect, useState } from 'react';

type UsersTableProps = {
  users: AdminUserRow[];
  query: {
    page: number;
    pageSize: number;
    role: 'all' | 'admin' | 'staff';
    search: string;
    sortBy: 'createdAt' | 'name' | 'email' | 'role';
    sortDir: 'asc' | 'desc';
  };
  paginationMeta: {
    page: number;
    pageSize: number;
    total: number;
    pageCount: number;
  };
  currentUserId?: string;
  isLoading?: boolean;
  onLoadingChangeAction?: (loading: boolean) => void;
};

const DENSITY_STORAGE_KEY = 'adminUsers.tableDensity';

function formatDate(value: Date) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value);
}

export function UsersTable({
  users,
  query,
  paginationMeta,
  currentUserId,
  isLoading = false,
  onLoadingChangeAction,
}: UsersTableProps) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const [density, setDensity] = useState<'comfortable' | 'compact'>('comfortable');

  const [columnVisibility, setColumnVisibility] = useState<Record<ColumnKey, boolean>>({
    role: true,
    permissions: true,
    created: true,
    actions: true,
  });

  useEffect(() => {
    onLoadingChangeAction?.(false);
  }, [users, query, onLoadingChangeAction]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(DENSITY_STORAGE_KEY, density);
  }, [density]);

  const handleNavigate = (
    updates: Record<string, string | null | undefined>,
    options?: { replace?: boolean }
  ) => {
    const queryObject = buildAdminUsersQueryObject(searchParams.toString(), updates);
    const href = { pathname, query: queryObject } as unknown as Parameters<typeof router.push>[0];
    onLoadingChangeAction?.(true);
    if (options?.replace) {
      router.replace(href, { scroll: false });
    } else {
      router.push(href, { scroll: false });
    }
  };

  const handleSort = (column: 'name' | 'role' | 'createdAt') => {
    const isSameColumn = query.sortBy === column;
    const nextDir = isSameColumn
      ? query.sortDir === 'asc'
        ? 'desc'
        : 'asc'
      : column === 'createdAt'
        ? 'desc'
        : 'asc';

    handleNavigate({ sort: column, dir: nextDir, page: '1' });
  };

  const rowPadding = density === 'compact' ? 'py-2' : 'py-3';

  const hasResults = users.length > 0;

  const handleClearFilters = () => {
    handleNavigate({ search: null, role: null, page: '1' });
  };

  const handleDeletedUser = () => {
    onLoadingChangeAction?.(true);
    router.refresh();
  };

  const visibleColumns = {
    role: columnVisibility.role,
    permissions: columnVisibility.permissions,
    created: columnVisibility.created,
    actions: columnVisibility.actions,
  } as const;

  const titleSort = query.sortBy === 'name' ? query.sortDir : null;
  const roleSort = query.sortBy === 'role' ? query.sortDir : null;
  const createdSort = query.sortBy === 'createdAt' ? query.sortDir : null;

  const renderSkeletonRows = () => {
    const count = Math.max(3, Math.min(paginationMeta.pageSize ?? 5, 8));
    const skeletonColumns = {
      role: columnVisibility.role,
      permissions: columnVisibility.permissions,
      created: columnVisibility.created,
      actions: columnVisibility.actions,
    };

    return Array.from({ length: count }).map((_, index) => (
      <tr key={`skeleton-${index}`} className="border-t">
        <td className={cn('px-4 align-top', rowPadding)}>
          <div className="space-y-2">
            <div className="h-4 w-32 rounded bg-muted animate-pulse" />
            <div className="h-3 w-40 rounded bg-muted animate-pulse" />
          </div>
        </td>
        {skeletonColumns.role ? (
          <td className={cn('px-4 align-top', rowPadding)}>
            <div className="flex gap-2">
              <div className="h-5 w-16 rounded-full bg-muted animate-pulse" />
              <div className="h-5 w-12 rounded-full bg-muted animate-pulse" />
            </div>
          </td>
        ) : null}
        {skeletonColumns.permissions ? (
          <td className={cn('px-4 align-top', rowPadding)}>
            <div className="flex flex-wrap gap-2">
              <div className="h-6 w-24 rounded bg-muted animate-pulse" />
              <div className="h-6 w-28 rounded bg-muted animate-pulse" />
            </div>
          </td>
        ) : null}
        {skeletonColumns.created ? (
          <td className={cn('px-4 align-top', rowPadding)}>
            <div className="h-4 w-24 rounded bg-muted animate-pulse" />
          </td>
        ) : null}
        {skeletonColumns.actions ? (
          <td className={cn('px-4 align-top', rowPadding)}>
            <div className="ml-auto h-8 w-20 rounded bg-muted animate-pulse" />
          </td>
        ) : null}
      </tr>
    ));
  };

  return (
    <div className="space-y-4">
      <UsersTableToolbar
        query={{ role: query.role, search: query.search }}
        density={density}
        onDensityChangeAction={setDensity}
        columnVisibility={columnVisibility}
        onLoadingChangeAction={onLoadingChangeAction}
        onToggleColumnAction={(key) =>
          setColumnVisibility((prev) => ({
            ...prev,
            [key]: !prev[key],
          }))
        }
      />

      <div className="overflow-x-auto rounded-lg border bg-card shadow-sm">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-muted/60">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <button
                  type="button"
                  className="flex items-center gap-1 text-foreground hover:text-primary"
                  onClick={() => handleSort('name')}
                >
                  Name
                  {titleSort ? titleSort === 'asc' ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" /> : null}
                </button>
              </th>
              {visibleColumns.role ? (
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <button
                    type="button"
                    className="flex items-center gap-1 text-foreground hover:text-primary"
                    onClick={() => handleSort('role')}
                  >
                    Internal role
                    {roleSort ? roleSort === 'asc' ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" /> : null}
                  </button>
                </th>
              ) : null}
              {visibleColumns.permissions ? (
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Permissions
                </th>
              ) : null}
              {visibleColumns.created ? (
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <button
                    type="button"
                    className="flex items-center gap-1 text-foreground hover:text-primary"
                    onClick={() => handleSort('createdAt')}
                  >
                    Created
                    {createdSort ? createdSort === 'asc' ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" /> : null}
                  </button>
                </th>
              ) : null}
              {visibleColumns.actions ? <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              renderSkeletonRows()
            ) : !hasResults ? (
              <tr>
                <td
                  className="px-4 py-8 text-center text-sm text-muted-foreground"
                  colSpan={1 + Number(visibleColumns.role) + Number(visibleColumns.permissions) + Number(visibleColumns.created) + Number(visibleColumns.actions)}
                >
                  <div className="flex flex-col items-center gap-3">
                    <div>
                      <p className="font-semibold text-foreground">No users match your filters</p>
                      <p className="text-xs text-muted-foreground">Try adjusting your search or clearing filters.</p>
                    </div>
                    <Button size="sm" variant="outline" onClick={handleClearFilters}>
                      Clear filters
                    </Button>
                  </div>
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={user.userId} className="border-t hover:bg-muted/30">
                  <td className={cn('px-4 align-top', rowPadding)}>
                    <div className="flex flex-col gap-1">
                      <span className="font-semibold text-foreground">{user.name}</span>
                      <span className="text-xs text-muted-foreground">{user.email}</span>
                    </div>
                  </td>
                  {visibleColumns.role ? (
                    <td className={cn('px-4 align-top', rowPadding)}>
                      <div className="flex flex-wrap gap-2">
                        {user.canonicalRoles.map((role) => (
                          <span
                            key={role}
                            className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-semibold capitalize text-primary"
                          >
                            {role.replace('internal.', '')}
                          </span>
                        ))}
                      </div>
                    </td>
                  ) : null}
                  {visibleColumns.permissions ? (
                    <td className={cn('px-4 align-top', rowPadding)}>
                      <div className="flex flex-wrap gap-2">
                        <UsersPermissionBadge label="Admin area" enabled={user.permissions.canAccessAdminArea} />
                        <UsersPermissionBadge label="Manage users" enabled={user.permissions.canManageUsers} />
                        <UsersPermissionBadge label="Staff tools" enabled={user.permissions.canViewStaffTools} />
                      </div>
                    </td>
                  ) : null}
                  {visibleColumns.created ? (
                    <td
                      className={cn('px-4 align-top text-sm text-muted-foreground', rowPadding)}
                      suppressHydrationWarning
                    >
                      {formatDate(user.createdAt)}
                    </td>
                  ) : null}
                  {visibleColumns.actions ? (
                    <td className={cn('px-4 align-top', rowPadding)}>
                      <UsersTableActions
                        userId={user.userId}
                        userName={user.name}
                        userEmail={user.email}
                        currentUserId={currentUserId}
                        onDeletedAction={handleDeletedUser}
                        onLoadingChangeAction={onLoadingChangeAction}
                      />
                    </td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <UsersTablePagination
        page={paginationMeta.page}
        pageCount={paginationMeta.pageCount}
        pageSize={paginationMeta.pageSize}
        total={paginationMeta.total}
        basePath={pathname}
        filters={Object.fromEntries(searchParams.entries())}
        onNavigate={() => onLoadingChangeAction?.(true)}
      />
    </div>
  );
}
