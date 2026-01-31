'use client';

import { SelfSignupUsersEmptyState } from '@/components/admin/users/self-signup-users-empty-state';
import { SelfSignupUsersTableActions } from '@/components/admin/users/self-signup-users-table-actions';
import { useUsersListLabels } from '@/components/admin/users/use-users-list-labels';
import { UsersSectionHeader } from '@/components/admin/users/users-section-header';
import { UsersListTable } from '@/components/admin/users/users-list-table';
import type { NormalizedSelfSignupUsersQuery } from '@/lib/self-signup-users/query';
import type {
  ListSelfSignupUsersError,
  SelfSignupUserRow,
  SerializedSelfSignupUserRow,
} from '@/lib/self-signup-users/types';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';
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
    proAccess: {
      ...user.proAccess,
      proUntil: user.proAccess.proUntil ? new Date(user.proAccess.proUntil) : null,
    },
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
  const tToolbar = useTranslations('pages.selfSignupUsers.toolbar');
  const labels = useUsersListLabels({ pageNamespace: 'pages.selfSignupUsers', roleColumnKey: 'role' });
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
            'border-destructive/50 bg-destructive/10 text-destructive',
          )}
        >
          {bannerMessage}
        </div>
      ) : null}

      {paginationMeta.total === 0 && !hasFiltersApplied ? (
        <SelfSignupUsersEmptyState />
      ) : (
        <UsersListTable
          users={users}
          query={initialQuery}
          paginationMeta={paginationMeta}
          currentUserId={currentUserId}
          isLoading={isTableLoading}
          onLoadingChangeAction={setIsTableLoading}
          densityStorageKey="selfSignupUsers.tableDensity"
          labels={{
            toolbar: labels.toolbar,
            density: labels.table.density,
            table: {
              columns: {
                name: labels.table.columns.name,
                role: labels.table.columns.role,
                created: labels.table.columns.created,
                actions: labels.table.columns.actions,
              },
              noMatches: {
                title: labels.table.emptyNoMatches.title,
                description: labels.table.emptyNoMatches.description,
                clearButton: labels.table.emptyNoMatches.clearButton,
              },
            },
          }}
          roleOptions={[
            { key: 'all', label: tToolbar('roleAll') },
            { key: 'organizer', label: tToolbar('roleOrganizer') },
            { key: 'athlete', label: tToolbar('roleAthlete') },
            { key: 'volunteer', label: tToolbar('roleVolunteer') },
          ]}
          getRoleBadgeLabelAction={(role) => {
            switch (role) {
              case 'external.organizer':
                return tToolbar('roleOrganizer');
              case 'external.athlete':
                return tToolbar('roleAthlete');
              case 'external.volunteer':
                return tToolbar('roleVolunteer');
              default:
                return role.replace('external.', '');
            }
          }}
          tableMinWidthClassName="min-w-[720px]"
          paginationTranslationNamespace={labels.paginationNamespace}
          renderActionsAction={({ user, currentUserId, onDeletedAction }) => (
            <SelfSignupUsersTableActions
              userId={user.userId}
              userName={user.name}
              userEmail={user.email}
              currentUserId={currentUserId}
              onDeletedAction={onDeletedAction}
            />
          )}
        />
      )}
    </div>
  );
}
