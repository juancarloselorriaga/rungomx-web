export type AdminPromotionsSortBy = 'createdAt' | 'name' | 'redemptions';

export type AdminPromotionsSortDir = 'asc' | 'desc';

export type AdminPromotionsStatusFilter = 'all' | 'active' | 'inactive';

export type AdminPromotionsQuery = {
  page?: number;
  pageSize?: number;
  sortBy?: AdminPromotionsSortBy;
  sortDir?: AdminPromotionsSortDir;
  status?: AdminPromotionsStatusFilter;
  search?: string;
};

export const DEFAULT_ADMIN_PROMOTIONS_PAGE_SIZE = 10;
export const MAX_ADMIN_PROMOTIONS_PAGE_SIZE = 100;

export type NormalizedAdminPromotionsQuery = Required<
  Pick<AdminPromotionsQuery, 'page' | 'pageSize' | 'sortBy' | 'sortDir' | 'status' | 'search'>
>;

export function normalizeAdminPromotionsQuery(
  query?: AdminPromotionsQuery,
): NormalizedAdminPromotionsQuery {
  const page = Math.max(1, Number.isFinite(query?.page) ? Math.floor(Number(query?.page)) : 1);

  const rawPageSize = Number.isFinite(query?.pageSize)
    ? Math.floor(Number(query?.pageSize))
    : DEFAULT_ADMIN_PROMOTIONS_PAGE_SIZE;
  const pageSize = Math.min(Math.max(1, rawPageSize), MAX_ADMIN_PROMOTIONS_PAGE_SIZE);

  const sortBy: NormalizedAdminPromotionsQuery['sortBy'] = ['createdAt', 'name', 'redemptions'].includes(
    query?.sortBy as string,
  )
    ? (query?.sortBy as NormalizedAdminPromotionsQuery['sortBy'])
    : 'createdAt';

  const defaultSortDir: NormalizedAdminPromotionsQuery['sortDir'] =
    sortBy === 'createdAt' ? 'desc' : 'asc';
  const sortDir: NormalizedAdminPromotionsQuery['sortDir'] =
    query?.sortDir === 'asc' || query?.sortDir === 'desc' ? query.sortDir : defaultSortDir;

  const status: NormalizedAdminPromotionsQuery['status'] = ['active', 'inactive', 'all'].includes(
    query?.status as string,
  )
    ? (query?.status as NormalizedAdminPromotionsQuery['status'])
    : 'all';

  const search = query?.search?.trim() ?? '';

  return { page, pageSize, sortBy, sortDir, status, search };
}

type RawSearchParams = Record<string, string | string[] | undefined>;

export function parseAdminPromotionsSearchParams(rawSearchParams?: RawSearchParams): AdminPromotionsQuery {
  const normalizeNumber = (value?: string | string[]) => {
    if (!value) return undefined;
    const raw = Array.isArray(value) ? value[0] : value;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  };

  const statusValue = rawSearchParams?.status;
  const rawStatus = Array.isArray(statusValue) ? statusValue[0] : statusValue;
  const status: AdminPromotionsQuery['status'] =
    rawStatus === 'active' || rawStatus === 'inactive' ? rawStatus : 'all';

  const sortValue = rawSearchParams?.sort;
  const rawSort = Array.isArray(sortValue) ? sortValue[0] : sortValue;
  const sortBy: AdminPromotionsQuery['sortBy'] =
    rawSort === 'name' || rawSort === 'redemptions' || rawSort === 'createdAt' ? rawSort : 'createdAt';

  const dirValue = rawSearchParams?.dir;
  const rawDir = Array.isArray(dirValue) ? dirValue[0] : dirValue;
  const sortDir: AdminPromotionsQuery['sortDir'] =
    rawDir === 'asc' || rawDir === 'desc' ? rawDir : sortBy === 'createdAt' ? 'desc' : 'asc';

  const searchValue = rawSearchParams?.search;
  const search = Array.isArray(searchValue) ? searchValue[0] : (searchValue ?? '');

  return {
    page: Math.max(1, normalizeNumber(rawSearchParams?.page) ?? 1),
    pageSize: normalizeNumber(rawSearchParams?.pageSize),
    status,
    search: search.trim(),
    sortBy,
    sortDir,
  };
}

