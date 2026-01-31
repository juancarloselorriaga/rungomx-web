'use client';

import { buildAdminUsersQueryObject } from '@/components/admin/users/search-params';
import { UsersListToolbar, type UsersListColumnKey, type UsersListDensity } from '@/components/admin/users/users-list-toolbar';
import { UsersTablePagination } from '@/components/admin/users/users-table-pagination';
import { UsersTableSkeleton } from '@/components/admin/users/users-table-skeleton';
import { EntityListView } from '@/components/list-view/entity-list-view';
import type { ListViewColumn } from '@/components/list-view/types';
import { Badge } from '@/components/common/badge';
import { Button } from '@/components/ui/button';
import { usePathname, useRouter } from '@/i18n/navigation';
import type { CanonicalRole } from '@/lib/auth/roles';
import { cn } from '@/lib/utils';
import { useFormatter } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';

function useDensityStorage(storageKey: string) {
  const subscribe = useCallback(
    (callback: () => void) => {
      const handleStorage = (e: StorageEvent) => {
        if (e.key === storageKey) callback();
      };
      window.addEventListener('storage', handleStorage);
      return () => window.removeEventListener('storage', handleStorage);
    },
    [storageKey],
  );

  const getSnapshot = useCallback(() => {
    const stored = window.localStorage.getItem(storageKey);
    return stored === 'comfortable' || stored === 'compact' ? stored : 'comfortable';
  }, [storageKey]);

  const getServerSnapshot = useCallback(() => 'comfortable' as const, []);

  const density = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setDensity = useCallback(
    (value: UsersListDensity) => {
      window.localStorage.setItem(storageKey, value);
      window.dispatchEvent(new StorageEvent('storage', { key: storageKey }));
    },
    [storageKey],
  );

  return [density, setDensity] as const;
}

export type UsersListRow = {
  userId: string;
  email: string;
  name: string;
  canonicalRoles: CanonicalRole[];
  createdAt: Date;
  proAccess?: {
    isPro: boolean;
    proUntil: Date | null;
  };
};

type UsersListSortBy = 'createdAt' | 'name' | 'email' | 'role';
type UsersListSortDir = 'asc' | 'desc';

type UsersListTableProps<TRoleFilter extends string> = {
  users: UsersListRow[];
  query: {
    page: number;
    pageSize: number;
    role: TRoleFilter;
    search: string;
    sortBy: UsersListSortBy;
    sortDir: UsersListSortDir;
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
  densityStorageKey: string;
  labels: {
    toolbar: Parameters<typeof UsersListToolbar<TRoleFilter>>[0]['labels'];
    density: Parameters<typeof UsersListToolbar<TRoleFilter>>[0]['densityLabels'];
    table: {
      columns: {
        name: string;
        role: string;
        created: string;
        actions: string;
      };
      noMatches: {
        title: string;
        description: string;
        clearButton: string;
      };
    };
  };
  roleOptions: Array<{ key: TRoleFilter; label: string }>;
  getRoleBadgeLabelAction?: (role: CanonicalRole) => string;
  tableMinWidthClassName?: string;
  paginationTranslationNamespace?: 'pages.adminUsers.pagination' | 'pages.selfSignupUsers.pagination';
  renderActionsAction: (args: {
    user: UsersListRow;
    currentUserId?: string;
    onDeletedAction: () => void;
    onLoadingChangeAction?: (loading: boolean) => void;
  }) => ReactNode;
};

export function UsersListTable<TRoleFilter extends string>({
  users,
  query,
  paginationMeta,
  currentUserId,
  isLoading = false,
  onLoadingChangeAction,
  densityStorageKey,
  labels,
  roleOptions,
  getRoleBadgeLabelAction,
  tableMinWidthClassName,
  paginationTranslationNamespace,
  renderActionsAction,
}: UsersListTableProps<TRoleFilter>) {
  const format = useFormatter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const defaultRoleKey = roleOptions[0]?.key;

  const [density, setDensity] = useDensityStorage(densityStorageKey);

  const [columnVisibility, setColumnVisibility] = useState<Record<UsersListColumnKey, boolean>>({
    name: true,
    role: true,
    created: true,
    actions: true,
  });

  useEffect(() => {
    onLoadingChangeAction?.(false);
  }, [users, query, onLoadingChangeAction]);

  const navigate = (updates: Record<string, string | null | undefined>, options?: { replace?: boolean }) => {
    const queryObject = buildAdminUsersQueryObject(searchParams.toString(), updates);
    const href = { pathname, query: queryObject } as unknown as Parameters<typeof router.push>[0];
    onLoadingChangeAction?.(true);
    if (options?.replace) {
      router.replace(href, { scroll: false });
    } else {
      router.push(href, { scroll: false });
    }
  };

  const handleDeletedUser = useCallback(() => {
    onLoadingChangeAction?.(true);
    router.refresh();
  }, [onLoadingChangeAction, router]);

  const rowPadding = density === 'compact' ? 'py-2' : 'py-3';

  const columns = useMemo(() => {
    const formatDate = (value: Date) =>
      format.dateTime(value, {
        dateStyle: 'medium',
        timeStyle: 'short',
      });

    return [
      {
        key: 'name',
        header: labels.table.columns.name,
        sortKey: 'name',
        defaultSortDir: 'asc',
        hideable: false,
        visible: columnVisibility.name,
        cell: (user) => (
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-foreground">{user.name}</span>
              {user.proAccess?.isPro ? (
                <Badge variant="pro" size="sm">
                  Pro
                </Badge>
              ) : null}
            </div>
            <span className="text-xs text-muted-foreground">{user.email}</span>
          </div>
        ),
      },
      {
        key: 'role',
        header: labels.table.columns.role,
        sortKey: 'role',
        defaultSortDir: 'asc',
        visible: columnVisibility.role,
        cell: (user) => (
          <div className="flex flex-wrap gap-2">
            {user.canonicalRoles.map((role) => (
              <span
                key={role}
                className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-semibold capitalize text-primary"
              >
                {getRoleBadgeLabelAction
                  ? getRoleBadgeLabelAction(role)
                  : role.replace(/^internal\\.|^external\\./, '')}
              </span>
            ))}
          </div>
        ),
      },
      {
        key: 'created',
        header: labels.table.columns.created,
        sortKey: 'createdAt',
        defaultSortDir: 'desc',
        visible: columnVisibility.created,
        className: cn('text-sm text-muted-foreground'),
        cell: (user) => (
          <span suppressHydrationWarning>{formatDate(user.createdAt)}</span>
        ),
      },
      {
        key: 'actions',
        header: labels.table.columns.actions,
        align: 'right',
        visible: columnVisibility.actions,
        cell: (user) =>
          renderActionsAction({
            user,
            currentUserId,
            onDeletedAction: handleDeletedUser,
            onLoadingChangeAction,
          }),
      },
    ] satisfies Array<ListViewColumn<UsersListRow, UsersListColumnKey, UsersListSortBy>>;
  }, [
    columnVisibility.actions,
    columnVisibility.created,
    columnVisibility.name,
    columnVisibility.role,
    currentUserId,
    format,
    handleDeletedUser,
    labels.table.columns.actions,
    labels.table.columns.created,
    labels.table.columns.name,
    labels.table.columns.role,
    getRoleBadgeLabelAction,
    onLoadingChangeAction,
    renderActionsAction,
  ]);

  const emptyContent = (
    <div className="flex flex-col items-center gap-3">
      <div>
        <p className="font-semibold text-foreground">{labels.table.noMatches.title}</p>
        <p className="text-xs text-muted-foreground">{labels.table.noMatches.description}</p>
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={() => navigate({ search: null, role: String(defaultRoleKey ?? 'all'), page: '1' })}
      >
        {labels.table.noMatches.clearButton}
      </Button>
    </div>
  );

  const columnOptions = useMemo<
    ReadonlyArray<{ key: Exclude<UsersListColumnKey, 'name'>; label: string }>
  >(
    () => [
      { key: 'role', label: labels.table.columns.role },
      { key: 'created', label: labels.table.columns.created },
      { key: 'actions', label: labels.table.columns.actions },
    ],
    [labels.table.columns.actions, labels.table.columns.created, labels.table.columns.role],
  );

  return (
    <EntityListView
      items={users}
      getRowIdAction={(user) => user.userId}
      columns={columns}
      sort={{ key: query.sortBy, dir: query.sortDir }}
      onSortChangeAction={(next) => navigate({ sort: next.key, dir: next.dir, page: '1' })}
      isLoading={isLoading}
      emptyContent={emptyContent}
      controls={
        <UsersListToolbar
          key={`${String(query.role)}:${query.search}`}
          labels={labels.toolbar}
          densityLabels={labels.density}
          query={{ role: query.role, search: query.search }}
          roleOptions={roleOptions}
          defaultRoleKey={(defaultRoleKey ?? ('all' as TRoleFilter)) as TRoleFilter}
          density={density}
          onDensityChangeAction={setDensity}
          columnVisibility={columnVisibility}
          columnOptions={columnOptions}
          onToggleColumnAction={(key) =>
            setColumnVisibility((prev) => ({
              ...prev,
              [key]: !prev[key],
            }))
          }
          onNavigateAction={navigate}
        />
      }
      rowPadding={rowPadding}
      minWidthClassName={tableMinWidthClassName}
      renderSkeletonRowsAction={({ rows }) => (
        <UsersTableSkeleton
          rows={Math.max(3, Math.min(paginationMeta.pageSize ?? 5, 8, rows))}
          columns={{
            user: columnVisibility.name,
            role: columnVisibility.role,
            created: columnVisibility.created,
            actions: columnVisibility.actions,
          }}
          rowPadding={rowPadding}
          renderAsRows
          minWidthClassName={tableMinWidthClassName}
        />
      )}
      skeletonRows={Math.max(3, Math.min(paginationMeta.pageSize ?? 5, 8))}
      pagination={
        <UsersTablePagination
          page={paginationMeta.page}
          pageCount={paginationMeta.pageCount}
          pageSize={paginationMeta.pageSize}
          total={paginationMeta.total}
          basePath={pathname}
          filters={Object.fromEntries(searchParams.entries())}
          onNavigateAction={() => onLoadingChangeAction?.(true)}
          translationNamespace={paginationTranslationNamespace}
        />
      }
    />
  );
}
