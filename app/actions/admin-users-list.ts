'use server';

import { db } from '@/db';
import { roles, users, userRoles } from '@/db/schema';
import { withAdminUser } from '@/lib/auth/action-wrapper';
import {
  getUserRolesWithInternalFlag,
  type CanonicalRole,
  type PermissionSet,
} from '@/lib/auth/roles';
import { SQL, asc, and, desc, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm';

const INTERNAL_ROLE_NAMES = ['admin', 'staff'];

export type AdminUserRow = {
  userId: string;
  email: string;
  name: string;
  canonicalRoles: CanonicalRole[];
  permissions: PermissionSet;
  createdAt: Date;
  isInternal: boolean;
};

export type AdminUsersQuery = {
  page?: number;
  pageSize?: number;
  sortBy?: 'createdAt' | 'name' | 'email' | 'role';
  sortDir?: 'asc' | 'desc';
  role?: 'all' | 'admin' | 'staff';
  search?: string;
};

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

type NormalizedAdminUsersQuery = Required<
  Pick<AdminUsersQuery, 'page' | 'pageSize' | 'sortBy' | 'sortDir' | 'role' | 'search'>
>;

function normalizeQuery(query?: AdminUsersQuery): NormalizedAdminUsersQuery {
  const page = Math.max(1, Number.isFinite(query?.page) ? Math.floor(Number(query?.page)) : 1);
  const rawPageSize = Number.isFinite(query?.pageSize) ? Math.floor(Number(query?.pageSize)) : DEFAULT_PAGE_SIZE;
  const pageSize = Math.min(Math.max(1, rawPageSize), MAX_PAGE_SIZE);

  const sortBy: NormalizedAdminUsersQuery['sortBy'] = ['createdAt', 'name', 'email', 'role'].includes(
    query?.sortBy as string,
  )
    ? (query?.sortBy as NormalizedAdminUsersQuery['sortBy'])
    : 'createdAt';

  const defaultSortDir: NormalizedAdminUsersQuery['sortDir'] = sortBy === 'createdAt' ? 'desc' : 'asc';
  const sortDir: NormalizedAdminUsersQuery['sortDir'] = query?.sortDir === 'asc' || query?.sortDir === 'desc'
    ? query.sortDir
    : defaultSortDir;

  const role: NormalizedAdminUsersQuery['role'] = ['admin', 'staff', 'all'].includes(query?.role as string)
    ? (query?.role as NormalizedAdminUsersQuery['role'])
    : 'all';

  const search = query?.search?.trim() ?? '';

  return { page, pageSize, sortBy, sortDir, role, search };
}

export type ListInternalUsersResult =
  | { ok: true; users: AdminUserRow[]; page: number; pageSize: number; total: number; pageCount: number }
  | { ok: false; error: 'UNAUTHENTICATED' | 'FORBIDDEN' | 'SERVER_ERROR' };

export const listInternalUsers = withAdminUser<ListInternalUsersResult>({
  unauthenticated: () => ({ ok: false, error: 'UNAUTHENTICATED' }),
  forbidden: () => ({ ok: false, error: 'FORBIDDEN' }),
})(async (_context, query?: AdminUsersQuery) => {
  const normalized = normalizeQuery(query);

  try {
    const filters: SQL<unknown>[] = [
      inArray(roles.name, INTERNAL_ROLE_NAMES),
      isNull(users.deletedAt),
      isNull(userRoles.deletedAt),
    ];

    if (normalized.role === 'admin') {
      filters.push(eq(roles.name, 'admin'));
    } else if (normalized.role === 'staff') {
      filters.push(eq(roles.name, 'staff'));
    }

    if (normalized.search) {
      const pattern = `%${normalized.search}%`;
      filters.push(or(ilike(users.name, pattern), ilike(users.email, pattern)) as SQL<unknown>);
    }

    const whereClause = and(...filters);

    const roleSort: SQL<string> = sql`min(${roles.name})`;

    const baseQuery = db
      .select({
        userId: users.id,
        email: users.email,
        name: users.name,
        createdAt: users.createdAt,
        roleName: roleSort,
      })
      .from(users)
      .innerJoin(userRoles, eq(userRoles.userId, users.id))
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(whereClause)
      .groupBy(users.id, users.email, users.name, users.createdAt);

    const sortColumnMap: Record<NormalizedAdminUsersQuery['sortBy'], SQL<unknown>> = {
      createdAt: sql`${users.createdAt}`,
      email: sql`${users.email}`,
      name: sql`${users.name}`,
      role: roleSort,
    };

    const sortColumn = sortColumnMap[normalized.sortBy];

    const rows = await baseQuery
      .orderBy(normalized.sortDir === 'asc' ? asc(sortColumn) : desc(sortColumn))
      .limit(normalized.pageSize)
      .offset((normalized.page - 1) * normalized.pageSize);

    const totalResult = await db
      .select({ value: sql<number>`count(distinct ${users.id})` })
      .from(users)
      .innerJoin(userRoles, eq(userRoles.userId, users.id))
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(whereClause);

    const total = Number(totalResult[0]?.value ?? 0);
    const pageCount = total === 0 ? 0 : Math.ceil(total / normalized.pageSize);

    const resolved = await Promise.all(
      rows.map(async (row) => {
        const lookup = await getUserRolesWithInternalFlag(row.userId);

        if (!lookup.isInternal) {
          return null;
        }

        return {
          userId: row.userId,
          email: row.email,
          name: row.name,
          createdAt: row.createdAt,
          canonicalRoles: lookup.canonicalRoles,
          permissions: lookup.permissions,
          isInternal: lookup.isInternal,
        } satisfies AdminUserRow;
      })
    );

    const internalUsers = resolved.filter(Boolean) as AdminUserRow[];

    return { ok: true, users: internalUsers, page: normalized.page, pageSize: normalized.pageSize, total, pageCount };
  } catch (error) {
    console.error('[admin-users-list] Failed to list internal users', error);
    return { ok: false, error: 'SERVER_ERROR' };
  }
});
