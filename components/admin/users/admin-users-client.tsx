'use client';

import type { AdminUserRow, ListInternalUsersResult } from '@/app/actions/admin-users-list';
import { UsersEmptyState } from '@/components/admin/users/users-empty-state';
import { UsersTable } from '@/components/admin/users/users-table';
import { UserCreateDialog } from '@/components/admin/users/user-create-dialog';
import { Button } from '@/components/ui/button';
import { useSession } from '@/lib/auth/client';
import { cn } from '@/lib/utils';
import { UserPlus2 } from 'lucide-react';
import { useMemo, useState } from 'react';

type SerializedAdminUserRow = Omit<AdminUserRow, 'createdAt'> & { createdAt: string };
type ListError = Extract<ListInternalUsersResult, { ok: false }>['error'] | null;

type AdminUsersClientProps = {
  initialUsers: SerializedAdminUserRow[];
  initialError: ListError;
  initialQuery: {
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
};

function deserializeUsers(users: SerializedAdminUserRow[]): AdminUserRow[] {
  return users.map((user) => ({
    ...user,
    createdAt: new Date(user.createdAt),
  }));
}

function listErrorToMessage(error: ListError) {
  if (!error) return null;
  switch (error) {
    case 'UNAUTHENTICATED':
      return 'Your session expired. Please sign in again.';
    case 'FORBIDDEN':
      return 'You are not allowed to view internal users.';
    default:
      return 'Could not load internal users right now. Please try again.';
  }
}

export function AdminUsersClient({ initialUsers, initialError, initialQuery, paginationMeta }: AdminUsersClientProps) {
  const { data } = useSession();
  const [createOpen, setCreateOpen] = useState(false);

  const users = useMemo(() => deserializeUsers(initialUsers), [initialUsers]);
  const bannerMessage = listErrorToMessage(initialError);

  const hasFiltersApplied = initialQuery.role !== 'all' || initialQuery.search.trim() !== '';

  const adminEmail = data?.user?.email;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary/80">Admin</p>
          <div className="space-y-1">
            <h1 className="text-3xl font-bold leading-tight">Internal users</h1>
            <p className="text-muted-foreground">
              Create administrators or staff accounts and review their permissions.
            </p>
          </div>
          {adminEmail ? (
            <p className="text-xs text-muted-foreground">Signed in as {adminEmail}</p>
          ) : null}
        </div>

        <Button className="w-full sm:w-auto" onClick={() => setCreateOpen(true)}>
          <UserPlus2 className="size-4" />
          Create internal user
        </Button>
      </div>

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
        <UsersEmptyState
          cta={(
            <Button onClick={() => setCreateOpen(true)}>
              Create first admin
            </Button>
          )}
        />
      ) : (
        <UsersTable
          users={users}
          query={initialQuery}
          paginationMeta={paginationMeta}
          currentUserId={data?.user?.id}
        />
      )}

      <UserCreateDialog
        open={createOpen}
        onOpenChangeAction={setCreateOpen}
      />
    </div>
  );
}
