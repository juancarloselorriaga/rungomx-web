'use client';

import type { AdminUserRow } from '@/app/actions/admin-users-list';
import { UsersPermissionBadge } from '@/components/admin/users/users-permission-badge';
import { UsersTableActions } from '@/components/admin/users/users-table-actions';
import { UsersTablePagination } from '@/components/admin/users/users-table-pagination';
import { UsersTableToolbar } from '@/components/admin/users/users-table-toolbar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { usePathname, useRouter } from '@/i18n/navigation';
import { useSearchParams } from 'next/navigation';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useEffect, useState } from 'react';

type ColumnKey = 'role' | 'permissions' | 'created' | 'actions';

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
};

const DENSITY_STORAGE_KEY = 'adminUsers.tableDensity';

function formatDate(value: Date) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value);
}

export function UsersTable({ users, query, paginationMeta, currentUserId }: UsersTableProps) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const [density, setDensity] = useState<'comfortable' | 'compact'>(() => {
    if (typeof window === 'undefined') return 'comfortable';
    const stored = window.localStorage.getItem(DENSITY_STORAGE_KEY);
    return stored === 'compact' || stored === 'comfortable' ? stored : 'comfortable';
  });

  const [columnVisibility, setColumnVisibility] = useState<Record<ColumnKey, boolean>>({
    role: true,
    permissions: true,
    created: true,
    actions: true,
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(DENSITY_STORAGE_KEY, density);
  }, [density]);

  const buildHref = (updates: Record<string, string | null | undefined>): Parameters<typeof router.push>[0] => {
    const params = new URLSearchParams(searchParams.toString());

    Object.entries(updates).forEach(([key, value]) => {
      if (value === null || value === undefined || value === '') {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    });

    const query = Object.fromEntries(params.entries());
    return { pathname, query } as unknown as Parameters<typeof router.push>[0];
  };

  const handleNavigate = (
    updates: Record<string, string | null | undefined>,
    options?: { replace?: boolean }
  ) => {
    const href = buildHref(updates);
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

  const visibleColumns = {
    role: columnVisibility.role,
    permissions: columnVisibility.permissions,
    created: columnVisibility.created,
    actions: columnVisibility.actions,
  } as const;

  const titleSort = query.sortBy === 'name' ? query.sortDir : null;
  const roleSort = query.sortBy === 'role' ? query.sortDir : null;
  const createdSort = query.sortBy === 'createdAt' ? query.sortDir : null;

  return (
    <div className="space-y-4">
      <UsersTableToolbar
        query={{ role: query.role, search: query.search }}
        density={density}
        onDensityChangeAction={setDensity}
        columnVisibility={columnVisibility}
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
            {!hasResults ? (
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
                    <td className={cn('px-4 align-top text-sm text-muted-foreground', rowPadding)}>
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
                        onDeletedAction={() => router.refresh()}
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
      />
    </div>
  );
}
