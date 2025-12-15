'use server';

import { db } from '@/db';
import { roles, userRoles, users } from '@/db/schema';
import {
  type AdminUsersQuery,
  normalizeAdminUsersQuery,
  type NormalizedAdminUsersQuery,
} from '@/lib/admin-users/query';
import { withAdminUser } from '@/lib/auth/action-wrapper';
import {
  type CanonicalRole,
  getInternalRoleSourceNames,
  getUserRolesWithInternalFlag,
  type PermissionSet,
} from '@/lib/auth/roles';
import { and, asc, desc, eq, ilike, inArray, isNull, or, SQL, sql } from 'drizzle-orm';

const INTERNAL_ROLE_NAMES = getInternalRoleSourceNames();
const INTERNAL_ROLE_NAMES_BY_KIND = {
  admin: getInternalRoleSourceNames('admin'),
  staff: getInternalRoleSourceNames('staff'),
};

export type AdminUserRow = {
  userId: string;
  email: string;
  name: string;
  canonicalRoles: CanonicalRole[];
  permissions: PermissionSet;
  createdAt: Date;
  isInternal: boolean;
};

export type ListInternalUsersResult =
  | {
      ok: true;
      users: AdminUserRow[];
      page: number;
      pageSize: number;
      total: number;
      pageCount: number;
    }
  | { ok: false; error: 'UNAUTHENTICATED' | 'FORBIDDEN' | 'SERVER_ERROR' };

export const listInternalUsers = withAdminUser<ListInternalUsersResult>({
  unauthenticated: () => ({ ok: false, error: 'UNAUTHENTICATED' }),
  forbidden: () => ({ ok: false, error: 'FORBIDDEN' }),
})(async (_context, query?: AdminUsersQuery) => {
  const normalized = normalizeAdminUsersQuery(query);

  try {
    const filters: SQL<unknown>[] = [
      inArray(roles.name, INTERNAL_ROLE_NAMES),
      isNull(users.deletedAt),
      isNull(userRoles.deletedAt),
    ];

    if (normalized.role === 'admin' && INTERNAL_ROLE_NAMES_BY_KIND.admin.length > 0) {
      filters.push(inArray(roles.name, INTERNAL_ROLE_NAMES_BY_KIND.admin));
    } else if (normalized.role === 'staff' && INTERNAL_ROLE_NAMES_BY_KIND.staff.length > 0) {
      filters.push(inArray(roles.name, INTERNAL_ROLE_NAMES_BY_KIND.staff));
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
      }),
    );

    const internalUsers = resolved.filter(Boolean) as AdminUserRow[];

    return {
      ok: true,
      users: internalUsers,
      page: normalized.page,
      pageSize: normalized.pageSize,
      total,
      pageCount,
    };
  } catch (error) {
    console.error('[admin-users-list] Failed to list internal users', error);
    return { ok: false, error: 'SERVER_ERROR' };
  }
});
