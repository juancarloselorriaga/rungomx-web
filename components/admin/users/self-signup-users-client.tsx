'use client';

import { useTranslations } from 'next-intl';
import { UsersSectionHeader } from '@/components/admin/users/users-section-header';
import { SelfSignupUsersEmptyState } from '@/components/admin/users/self-signup-users-empty-state';
import { SelfSignupUsersTable } from '@/components/admin/users/self-signup-users-table';
import type { NormalizedSelfSignupUsersQuery } from '@/lib/self-signup-users/query';
import type {
  ListSelfSignupUsersError,
  SelfSignupUserRow,
  SerializedSelfSignupUserRow,
} from '@/lib/self-signup-users/types';
import { cn } from '@/lib/utils';
import { useMemo, useState } from 'react';

type SelfSignupUsersClientProps = {
  initialUsers: SerializedSelfSignupUserRow[];
  initialError: ListSelfSignupUsersError;
  initialQuery: NormalizedSelfSignupUsersQuery;
  paginationMeta: {
    page: number;
    pageSize: number;
    total: number;
    pageCount: number;
  };
  currentUserId?: string;
  currentUserEmail?: string;
};

function deserializeUsers(users: SerializedSelfSignupUserRow[]): SelfSignupUserRow[] {
  return users.map((user) => ({
    ...user,
    createdAt: new Date(user.createdAt),
  }));
}

export function SelfSignupUsersClient({
  initialUsers,
  initialError,
  initialQuery,
  paginationMeta,
  currentUserId,
  currentUserEmail,
}: SelfSignupUsersClientProps) {
  const t = useTranslations('pages.selfSignupUsers');
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
      <UsersSectionHeader view="selfSignup" currentUserEmail={currentUserEmail} />

      {bannerMessage ? (
        <div
          className={cn(
            'rounded-md border p-3 text-sm',
            'border-destructive/50 bg-destructive/10 text-destructive'
          )}
        >
          {bannerMessage}
        </div>
      ) : null}

      {paginationMeta.total === 0 && !hasFiltersApplied ? (
        <SelfSignupUsersEmptyState />
      ) : (
        <SelfSignupUsersTable
          users={users}
          query={initialQuery}
          paginationMeta={paginationMeta}
          currentUserId={currentUserId}
          isLoading={isTableLoading}
          onLoadingChangeAction={setIsTableLoading}
        />
      )}
    </div>
  );
}
