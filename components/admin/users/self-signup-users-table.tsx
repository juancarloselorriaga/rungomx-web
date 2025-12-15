'use client';

import { buildAdminUsersQueryObject } from '@/components/admin/users/search-params';
import { SelfSignupUsersTableToolbar } from '@/components/admin/users/self-signup-users-table-toolbar';
import { UsersTablePagination } from '@/components/admin/users/users-table-pagination';
import { UsersTableSkeleton } from '@/components/admin/users/users-table-skeleton';
import { Button } from '@/components/ui/button';
import { usePathname, useRouter } from '@/i18n/navigation';
import type { SelfSignupUserRow, SelfSignupUsersColumnKey } from '@/lib/self-signup-users/types';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

type SelfSignupUsersTableProps = {
  users: SelfSignupUserRow[];
  query: {
    page: number;
    pageSize: number;
    role: 'all' | 'organizer' | 'athlete' | 'volunteer';
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

const DENSITY_STORAGE_KEY = 'selfSignupUsers.tableDensity';

export function SelfSignupUsersTable({
  users,
  query,
  paginationMeta,
  isLoading = false,
  onLoadingChangeAction,
}: SelfSignupUsersTableProps) {
  const t = useTranslations('pages.selfSignupUsers.table');
  const tToolbar = useTranslations('pages.selfSignupUsers.toolbar');
  const format = useFormatter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const formatDate = (value: Date) => {
    return format.dateTime(value, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  };

  const [density, setDensity] = useState<'comfortable' | 'compact'>('comfortable');

  const [columnVisibility, setColumnVisibility] = useState<
    Record<SelfSignupUsersColumnKey, boolean>
  >({
    role: true,
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
    options?: { replace?: boolean },
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
    handleNavigate({ search: null, role: 'all', page: '1' });
  };

  const visibleColumns = {
    role: columnVisibility.role,
    created: columnVisibility.created,
    actions: columnVisibility.actions,
  } as const;

  const titleSort = query.sortBy === 'name' ? query.sortDir : null;
  const roleSort = query.sortBy === 'role' ? query.sortDir : null;
  const createdSort = query.sortBy === 'createdAt' ? query.sortDir : null;

  const roleLabels = useMemo(
    () =>
      ({
        'external.organizer': tToolbar('roleOrganizer'),
        'external.athlete': tToolbar('roleAthlete'),
        'external.volunteer': tToolbar('roleVolunteer'),
      }) as const,
    [tToolbar],
  );

  return (
    <div className="space-y-4">
      <SelfSignupUsersTableToolbar
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
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-muted/60">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <button
                  type="button"
                  className="flex items-center gap-1 text-foreground hover:text-primary"
                  onClick={() => handleSort('name')}
                >
                  {t('columns.name')}
                  {titleSort ? (
                    titleSort === 'asc' ? (
                      <ChevronUp className="size-4" />
                    ) : (
                      <ChevronDown className="size-4" />
                    )
                  ) : null}
                </button>
              </th>
              {visibleColumns.role ? (
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <button
                    type="button"
                    className="flex items-center gap-1 text-foreground hover:text-primary"
                    onClick={() => handleSort('role')}
                  >
                    {t('columns.role')}
                    {roleSort ? (
                      roleSort === 'asc' ? (
                        <ChevronUp className="size-4" />
                      ) : (
                        <ChevronDown className="size-4" />
                      )
                    ) : null}
                  </button>
                </th>
              ) : null}
              {visibleColumns.created ? (
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <button
                    type="button"
                    className="flex items-center gap-1 text-foreground hover:text-primary"
                    onClick={() => handleSort('createdAt')}
                  >
                    {t('columns.created')}
                    {createdSort ? (
                      createdSort === 'asc' ? (
                        <ChevronUp className="size-4" />
                      ) : (
                        <ChevronDown className="size-4" />
                      )
                    ) : null}
                  </button>
                </th>
              ) : null}
              {visibleColumns.actions ? (
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('columns.actions')}
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <UsersTableSkeleton
                rows={Math.max(3, Math.min(paginationMeta.pageSize ?? 5, 8))}
                columns={{
                  role: columnVisibility.role,
                  created: columnVisibility.created,
                  actions: columnVisibility.actions,
                }}
                rowPadding={rowPadding as 'py-2' | 'py-3'}
                renderAsRows
                minWidthClassName="min-w-[720px]"
              />
            ) : !hasResults ? (
              <tr>
                <td
                  className="px-4 py-8 text-center text-sm text-muted-foreground"
                  colSpan={
                    1 +
                    Number(visibleColumns.role) +
                    Number(visibleColumns.created) +
                    Number(visibleColumns.actions)
                  }
                >
                  <div className="flex flex-col items-center gap-3">
                    <div>
                      <p className="font-semibold text-foreground">
                        {t('emptyState.noMatches.title')}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t('emptyState.noMatches.description')}
                      </p>
                    </div>
                    <Button size="sm" variant="outline" onClick={handleClearFilters}>
                      {t('emptyState.noMatches.clearButton')}
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
                            {roleLabels[role as keyof typeof roleLabels] ??
                              role.replace('external.', '')}
                          </span>
                        ))}
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
                    <td
                      className={cn('px-4 align-top text-right text-muted-foreground', rowPadding)}
                    >
                      &mdash;
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
        onNavigateAction={() => onLoadingChangeAction?.(true)}
        translationNamespace="pages.selfSignupUsers.pagination"
      />
    </div>
  );
}
