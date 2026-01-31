import type { CanonicalRole } from '@/lib/auth/roles';

export type ProAccessSummary = {
  isPro: boolean;
  proUntil: Date | null;
};

export type SelfSignupUserRow = {
  userId: string;
  email: string;
  name: string;
  canonicalRoles: CanonicalRole[];
  createdAt: Date;
  isInternal: false;
  proAccess: ProAccessSummary;
};

export type SerializedProAccessSummary = Omit<ProAccessSummary, 'proUntil'> & {
  proUntil: string | null;
};

export type SerializedSelfSignupUserRow = Omit<SelfSignupUserRow, 'createdAt' | 'proAccess'> & {
  createdAt: string;
  proAccess: SerializedProAccessSummary;
};

export type ListSelfSignupUsersResult =
  | {
      ok: true;
      users: SelfSignupUserRow[];
      page: number;
      pageSize: number;
      total: number;
      pageCount: number;
    }
  | { ok: false; error: 'UNAUTHENTICATED' | 'FORBIDDEN' | 'SERVER_ERROR' };

export type ListSelfSignupUsersError =
  | Extract<ListSelfSignupUsersResult, { ok: false }>['error']
  | null;

export type SelfSignupUsersColumnKey = 'role' | 'created' | 'actions';
