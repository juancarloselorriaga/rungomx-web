import { listInternalUsers } from '@/app/actions/admin-users-list';
import { AdminUsersClient } from '@/components/admin/users/admin-users-client';
import {
  normalizeAdminUsersQuery,
  type NormalizedAdminUsersQuery,
  parseAdminUsersSearchParams,
} from '@/lib/admin-users/query';
import { type SerializedAdminUserRow } from '@/lib/admin-users/types';
import { getAuthContext } from '@/lib/auth/server';
import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import { createLocalizedPageMetadata } from '@/utils/seo';
import type { Metadata } from 'next';

type AdminUsersPageProps = LocalePageProps & {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: LocalePageProps): Promise<Metadata> {
  const { locale } = await params;

  return createLocalizedPageMetadata(locale, '/admin/users', () => ({
    title: 'Admin users',
    description: 'Manage internal administrators and staff accounts.',
  }), { robots: { index: false, follow: false } });
}

export default async function AdminUsersPage({ params, searchParams }: AdminUsersPageProps) {
  await configPageLocale(params, { pathname: '/admin/users' });
  const authContext = await getAuthContext();

  const resolvedSearchParams = await searchParams;
  const query = parseAdminUsersSearchParams(resolvedSearchParams);
  const normalizedQuery: NormalizedAdminUsersQuery = normalizeAdminUsersQuery(query);

  const result = await listInternalUsers(normalizedQuery);

  const initialUsers: SerializedAdminUserRow[] = result.ok
    ? result.users.map((user) => ({
        ...user,
        createdAt: user.createdAt.toISOString(),
      }))
    : [];

  const initialError = result.ok ? null : result.error;

  const paginationMeta = result.ok
    ? {
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
        pageCount: result.pageCount,
      }
    : {
        page: normalizedQuery.page,
        pageSize: normalizedQuery.pageSize,
        total: 0,
        pageCount: 0,
      };

  return (
    <AdminUsersClient
      initialUsers={initialUsers}
      initialError={initialError}
      initialQuery={{
        ...normalizedQuery,
        page: result.ok ? result.page : normalizedQuery.page,
        pageSize: result.ok ? result.pageSize : normalizedQuery.pageSize,
      }}
      paginationMeta={paginationMeta}
      currentUserId={authContext.user?.id}
      currentUserEmail={authContext.user?.email ?? undefined}
    />
  );
}
