import type { AdminUserRow, ListInternalUsersResult } from '@/app/actions/admin-users-list';

export type SerializedAdminUserRow = Omit<AdminUserRow, 'createdAt'> & { createdAt: string };

export type ListInternalUsersError =
  | Extract<ListInternalUsersResult, { ok: false }>['error']
  | null;

export type ColumnKey = 'role' | 'permissions' | 'created' | 'actions';
