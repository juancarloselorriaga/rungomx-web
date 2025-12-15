export type AdminUsersSortBy = 'createdAt' | 'name' | 'email' | 'role';

export type AdminUsersSortDir = 'asc' | 'desc';

export type AdminUsersRoleFilter = 'all' | 'admin' | 'staff';

export type AdminUsersQuery = {
  page?: number;
  pageSize?: number;
  sortBy?: AdminUsersSortBy;
  sortDir?: AdminUsersSortDir;
  role?: AdminUsersRoleFilter;
  search?: string;
};

export const DEFAULT_ADMIN_USERS_PAGE_SIZE = 10;
export const MAX_ADMIN_USERS_PAGE_SIZE = 100;

export type NormalizedAdminUsersQuery = Required<
  Pick<AdminUsersQuery, 'page' | 'pageSize' | 'sortBy' | 'sortDir' | 'role' | 'search'>
>;

export function normalizeAdminUsersQuery(query?: AdminUsersQuery): NormalizedAdminUsersQuery {
  const page = Math.max(1, Number.isFinite(query?.page) ? Math.floor(Number(query?.page)) : 1);

  const rawPageSize = Number.isFinite(query?.pageSize)
    ? Math.floor(Number(query?.pageSize))
    : DEFAULT_ADMIN_USERS_PAGE_SIZE;
  const pageSize = Math.min(Math.max(1, rawPageSize), MAX_ADMIN_USERS_PAGE_SIZE);

  const sortBy: NormalizedAdminUsersQuery['sortBy'] = [
    'createdAt',
    'name',
    'email',
    'role',
  ].includes(query?.sortBy as string)
    ? (query?.sortBy as NormalizedAdminUsersQuery['sortBy'])
    : 'createdAt';

  const defaultSortDir: NormalizedAdminUsersQuery['sortDir'] =
    sortBy === 'createdAt' ? 'desc' : 'asc';
  const sortDir: NormalizedAdminUsersQuery['sortDir'] =
    query?.sortDir === 'asc' || query?.sortDir === 'desc' ? query.sortDir : defaultSortDir;

  const role: NormalizedAdminUsersQuery['role'] = ['admin', 'staff', 'all'].includes(
    query?.role as string,
  )
    ? (query?.role as NormalizedAdminUsersQuery['role'])
    : 'all';

  const search = query?.search?.trim() ?? '';

  return { page, pageSize, sortBy, sortDir, role, search };
}

type RawSearchParams = Record<string, string | string[] | undefined>;

export function parseAdminUsersSearchParams(rawSearchParams?: RawSearchParams): AdminUsersQuery {
  const normalizeNumber = (value?: string | string[]) => {
    if (!value) return undefined;
    const raw = Array.isArray(value) ? value[0] : value;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  };

  const roleValue = rawSearchParams?.role;
  const rawRole = Array.isArray(roleValue) ? roleValue[0] : roleValue;
  const role: AdminUsersQuery['role'] =
    rawRole === 'admin' || rawRole === 'staff' ? rawRole : 'all';

  const sortValue = rawSearchParams?.sort;
  const rawSort = Array.isArray(sortValue) ? sortValue[0] : sortValue;
  const sortBy: AdminUsersQuery['sortBy'] =
    rawSort === 'name' || rawSort === 'email' || rawSort === 'role' || rawSort === 'createdAt'
      ? rawSort
      : 'createdAt';

  const dirValue = rawSearchParams?.dir;
  const rawDir = Array.isArray(dirValue) ? dirValue[0] : dirValue;
  const sortDir: AdminUsersQuery['sortDir'] =
    rawDir === 'asc' || rawDir === 'desc' ? rawDir : sortBy === 'createdAt' ? 'desc' : 'asc';

  const searchValue = rawSearchParams?.search;
  const search = Array.isArray(searchValue) ? searchValue[0] : (searchValue ?? '');

  return {
    page: Math.max(1, normalizeNumber(rawSearchParams?.page) ?? 1),
    pageSize: normalizeNumber(rawSearchParams?.pageSize),
    role,
    search: search.trim(),
    sortBy,
    sortDir,
  };
}
