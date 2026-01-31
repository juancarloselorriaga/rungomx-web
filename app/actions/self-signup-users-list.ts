'use server';

import { db } from '@/db';
import { roles, userRoles, users } from '@/db/schema';
import { withStaffUser } from '@/lib/auth/action-wrapper';
import { getExternalRoleSourceNamesByKind, getUserRolesWithInternalFlag } from '@/lib/auth/roles';
import { getBillingStatusForUser } from '@/lib/billing/queries';
import {
  type NormalizedSelfSignupUsersQuery,
  normalizeSelfSignupUsersQuery,
  type SelfSignupUsersQuery,
} from '@/lib/self-signup-users/query';
import type { ListSelfSignupUsersResult, SelfSignupUserRow } from '@/lib/self-signup-users/types';
import { and, asc, desc, eq, ilike, inArray, isNull, or, SQL, sql } from 'drizzle-orm';

const EXTERNAL_ROLE_NAMES_BY_KIND = getExternalRoleSourceNamesByKind();
const EXTERNAL_ROLE_NAMES = Array.from(new Set(Object.values(EXTERNAL_ROLE_NAMES_BY_KIND).flat()));

export const listSelfSignupUsers = withStaffUser<ListSelfSignupUsersResult>({
  unauthenticated: () => ({ ok: false, error: 'UNAUTHENTICATED' }),
  forbidden: () => ({ ok: false, error: 'FORBIDDEN' }),
})(async (_context, query?: SelfSignupUsersQuery) => {
  const normalized = normalizeSelfSignupUsersQuery(query);

  try {
    const filters: SQL<unknown>[] = [
      inArray(roles.name, EXTERNAL_ROLE_NAMES),
      isNull(users.deletedAt),
      isNull(userRoles.deletedAt),
    ];

    if (normalized.role !== 'all') {
      const roleNames = EXTERNAL_ROLE_NAMES_BY_KIND[normalized.role];
      filters.push(inArray(roles.name, roleNames));
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

    const sortColumnMap: Record<NormalizedSelfSignupUsersQuery['sortBy'], SQL<unknown>> = {
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

        if (lookup.isInternal) {
          return null;
        }

        const externalRoles = lookup.canonicalRoles.filter((role) => role.startsWith('external.'));
        const billingStatus = await getBillingStatusForUser({ userId: row.userId, isInternal: false });

        return {
          userId: row.userId,
          email: row.email,
          name: row.name,
          createdAt: row.createdAt,
          canonicalRoles: externalRoles,
          isInternal: false as const,
          proAccess: {
            isPro: billingStatus.isPro,
            proUntil: billingStatus.proUntil,
          },
        } satisfies SelfSignupUserRow;
      }),
    );

    const usersList = resolved.filter(Boolean) as SelfSignupUserRow[];

    return {
      ok: true,
      users: usersList,
      page: normalized.page,
      pageSize: normalized.pageSize,
      total,
      pageCount,
    };
  } catch (error) {
    console.error('[self-signup-users-list] Failed to list self-signup users', error);
    return { ok: false, error: 'SERVER_ERROR' };
  }
});
