import { listInternalUsers, type AdminUserRow, type AdminUsersQuery } from '@/app/actions/admin-users-list';
import { AdminUsersClient } from '@/components/admin/users/admin-users-client';
import { getAuthContext } from '@/lib/auth/server';
import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import { createLocalizedPageMetadata } from '@/utils/seo';
import type { Metadata } from 'next';

type SerializedAdminUserRow = Omit<AdminUserRow, 'createdAt'> & { createdAt: string };

type AdminUsersPageProps = LocalePageProps & {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function parseSearchParams(rawSearchParams?: Record<string, string | string[] | undefined>): AdminUsersQuery {
  const normalizeNumber = (value?: string | string[]) => {
    if (!value) return undefined;
    const raw = Array.isArray(value) ? value[0] : value;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  };

  const roleValue = rawSearchParams?.role;
  const rawRole = Array.isArray(roleValue) ? roleValue[0] : roleValue;
  const role: AdminUsersQuery['role'] = rawRole === 'admin' || rawRole === 'staff' ? rawRole : 'all';

  const sortValue = rawSearchParams?.sort;
  const rawSort = Array.isArray(sortValue) ? sortValue[0] : sortValue;
  const sortBy: AdminUsersQuery['sortBy'] = rawSort === 'name' || rawSort === 'email' || rawSort === 'role' || rawSort === 'createdAt'
    ? rawSort
    : 'createdAt';

  const dirValue = rawSearchParams?.dir;
  const rawDir = Array.isArray(dirValue) ? dirValue[0] : dirValue;
  const sortDir: AdminUsersQuery['sortDir'] = rawDir === 'asc' || rawDir === 'desc'
    ? rawDir
    : sortBy === 'createdAt'
      ? 'desc'
      : 'asc';

  const searchValue = rawSearchParams?.search;
  const search = Array.isArray(searchValue) ? searchValue[0] : searchValue ?? '';

  return {
    page: Math.max(1, normalizeNumber(rawSearchParams?.page) ?? 1),
    pageSize: normalizeNumber(rawSearchParams?.pageSize),
    role,
    search: search.trim(),
    sortBy,
    sortDir,
  } satisfies AdminUsersQuery;
}

export async function generateMetadata({ params }: LocalePageProps): Promise<Metadata> {
  const { locale } = await params;

  return createLocalizedPageMetadata(locale, '/admin/users', () => ({
    title: 'Admin users',
    description: 'Manage internal administrators and staff accounts.',
  }), { robots: { index: false, follow: false } });
}

export default async function AdminUsersPage({ params, searchParams }: AdminUsersPageProps) {
  await configPageLocale(params, { pathname: '/admin/users' });
  await getAuthContext();

  const resolvedSearchParams = await searchParams;
  const query = parseSearchParams(resolvedSearchParams);

  const result = await listInternalUsers(query);

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
        page: query.page ?? 1,
        pageSize: query.pageSize ?? 20,
        total: 0,
        pageCount: 0,
      };

  return (
    <AdminUsersClient
      initialUsers={initialUsers}
      initialError={initialError}
      initialQuery={{
        page: result.ok ? result.page : query.page ?? 1,
        pageSize: result.ok ? result.pageSize : query.pageSize ?? 20,
        role: query.role ?? 'all',
        search: query.search ?? '',
        sortBy: query.sortBy ?? 'createdAt',
        sortDir: query.sortDir ?? (query.sortBy === 'createdAt' ? 'desc' : 'asc'),
      }}
      paginationMeta={paginationMeta}
    />
  );
}
