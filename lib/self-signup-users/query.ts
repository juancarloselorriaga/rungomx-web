import { DEFAULT_ADMIN_USERS_PAGE_SIZE, MAX_ADMIN_USERS_PAGE_SIZE } from '../admin-users/query';

export type SelfSignupUsersSortBy = 'createdAt' | 'name' | 'email' | 'role';

export type SelfSignupUsersSortDir = 'asc' | 'desc';

export type SelfSignupUsersRoleFilter = 'all' | 'organizer' | 'athlete' | 'volunteer';

export type SelfSignupUsersQuery = {
  page?: number;
  pageSize?: number;
  sortBy?: SelfSignupUsersSortBy;
  sortDir?: SelfSignupUsersSortDir;
  role?: SelfSignupUsersRoleFilter;
  search?: string;
};

export const DEFAULT_SELF_SIGNUP_USERS_PAGE_SIZE = DEFAULT_ADMIN_USERS_PAGE_SIZE;
export const MAX_SELF_SIGNUP_USERS_PAGE_SIZE = MAX_ADMIN_USERS_PAGE_SIZE;

export type NormalizedSelfSignupUsersQuery = Required<
  Pick<SelfSignupUsersQuery, 'page' | 'pageSize' | 'sortBy' | 'sortDir' | 'role' | 'search'>
>;

export function normalizeSelfSignupUsersQuery(
  query?: SelfSignupUsersQuery,
): NormalizedSelfSignupUsersQuery {
  const page = Math.max(1, Number.isFinite(query?.page) ? Math.floor(Number(query?.page)) : 1);

  const rawPageSize = Number.isFinite(query?.pageSize)
    ? Math.floor(Number(query?.pageSize))
    : DEFAULT_SELF_SIGNUP_USERS_PAGE_SIZE;
  const pageSize = Math.min(Math.max(1, rawPageSize), MAX_SELF_SIGNUP_USERS_PAGE_SIZE);

  const sortBy: NormalizedSelfSignupUsersQuery['sortBy'] = [
    'createdAt',
    'name',
    'email',
    'role',
  ].includes(query?.sortBy as string)
    ? (query?.sortBy as NormalizedSelfSignupUsersQuery['sortBy'])
    : 'createdAt';

  const defaultSortDir: NormalizedSelfSignupUsersQuery['sortDir'] =
    sortBy === 'createdAt' ? 'desc' : 'asc';
  const sortDir: NormalizedSelfSignupUsersQuery['sortDir'] =
    query?.sortDir === 'asc' || query?.sortDir === 'desc' ? query.sortDir : defaultSortDir;

  const role: NormalizedSelfSignupUsersQuery['role'] = [
    'organizer',
    'athlete',
    'volunteer',
    'all',
  ].includes(query?.role as string)
    ? (query?.role as NormalizedSelfSignupUsersQuery['role'])
    : 'all';

  const search = query?.search?.trim() ?? '';

  return { page, pageSize, sortBy, sortDir, role, search };
}

type RawSearchParams = Record<string, string | string[] | undefined>;

export function parseSelfSignupUsersSearchParams(
  rawSearchParams?: RawSearchParams,
): SelfSignupUsersQuery {
  const normalizeNumber = (value?: string | string[]) => {
    if (!value) return undefined;
    const raw = Array.isArray(value) ? value[0] : value;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  };

  const roleValue = rawSearchParams?.role;
  const rawRole = Array.isArray(roleValue) ? roleValue[0] : roleValue;
  const role: SelfSignupUsersQuery['role'] =
    rawRole === 'organizer' || rawRole === 'athlete' || rawRole === 'volunteer' ? rawRole : 'all';

  const sortValue = rawSearchParams?.sort;
  const rawSort = Array.isArray(sortValue) ? sortValue[0] : sortValue;
  const sortBy: SelfSignupUsersQuery['sortBy'] =
    rawSort === 'name' || rawSort === 'email' || rawSort === 'role' || rawSort === 'createdAt'
      ? rawSort
      : 'createdAt';

  const dirValue = rawSearchParams?.dir;
  const rawDir = Array.isArray(dirValue) ? dirValue[0] : dirValue;
  const sortDir: SelfSignupUsersQuery['sortDir'] =
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
