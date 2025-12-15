'use client';

import type { AdminUserRow } from '@/app/actions/admin-users-list';
import { UserCreateDialog } from '@/components/admin/users/user-create-dialog';
import { UsersEmptyState } from '@/components/admin/users/users-empty-state';
import { UsersSectionHeader } from '@/components/admin/users/users-section-header';
import { UsersTable } from '@/components/admin/users/users-table';
import { Button } from '@/components/ui/button';
import type { NormalizedAdminUsersQuery } from '@/lib/admin-users/query';
import type { ListInternalUsersError, SerializedAdminUserRow } from '@/lib/admin-users/types';
import { cn } from '@/lib/utils';
import { UserPlus2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

type AdminUsersClientProps = {
  initialUsers: SerializedAdminUserRow[];
  initialError: ListInternalUsersError;
  initialQuery: NormalizedAdminUsersQuery;
  paginationMeta: {
    page: number;
    pageSize: number;
    total: number;
    pageCount: number;
  };
  currentUserId?: string;
  currentUserEmail?: string;
};

function deserializeUsers(users: SerializedAdminUserRow[]): AdminUserRow[] {
  return users.map((user) => ({
    ...user,
    createdAt: new Date(user.createdAt),
  }));
}

export function AdminUsersClient({
  initialUsers,
  initialError,
  initialQuery,
  paginationMeta,
  currentUserId,
  currentUserEmail,
}: AdminUsersClientProps) {
  const t = useTranslations('pages.adminUsers');
  const [createOpen, setCreateOpen] = useState(false);
  const [isTableLoading, setIsTableLoading] = useState(false);

  const users = useMemo(() => deserializeUsers(initialUsers), [initialUsers]);

  const bannerMessage = useMemo(() => {
    if (!initialError) return null;
    switch (initialError) {
      case 'UNAUTHENTICATED':
        return t('errors.unauthenticated');
      case 'FORBIDDEN':
        return t('errors.forbidden');
      default:
        return t('errors.loadFailed');
    }
  }, [initialError, t]);

  const hasFiltersApplied = initialQuery.role !== 'all' || initialQuery.search.trim() !== '';

  return (
    <div className="space-y-6">
      <UsersSectionHeader
        view="internal"
        currentUserEmail={currentUserEmail}
        primaryAction={
          <Button className="w-full sm:w-auto" onClick={() => setCreateOpen(true)}>
            <UserPlus2 className="size-4" />
            {t('page.createButton')}
          </Button>
        }
      />

      {bannerMessage ? (
        <div
          className={cn(
            'rounded-md border p-3 text-sm',
            'border-destructive/50 bg-destructive/10 text-destructive',
          )}
        >
          {bannerMessage}
        </div>
      ) : null}

      {paginationMeta.total === 0 && !hasFiltersApplied ? (
        <UsersEmptyState
          cta={<Button onClick={() => setCreateOpen(true)}>{t('page.createFirstButton')}</Button>}
        />
      ) : (
        <UsersTable
          users={users}
          query={initialQuery}
          paginationMeta={paginationMeta}
          currentUserId={currentUserId}
          isLoading={isTableLoading}
          onLoadingChangeAction={setIsTableLoading}
        />
      )}

      <UserCreateDialog
        open={createOpen}
        onOpenChangeAction={setCreateOpen}
        onSuccessAction={() => setIsTableLoading(true)}
      />
    </div>
  );
}
