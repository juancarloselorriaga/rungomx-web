'server only';

import { db } from '@/db';
import { contactSubmissions, profiles, roles, userRoles, users } from '@/db/schema';
import { getExternalRoleSourceNamesByKind, getInternalRoleSourceNames } from '@/lib/auth/roles';
import { eachDayOfInterval, format, subDays } from 'date-fns';
import { and, eq, gte, inArray, isNull, sql } from 'drizzle-orm';

export type DailyPoint = {
  date: string;
  value: number;
};

export type AdminDashboardMetrics = {
  rangeLabel: string;
  users: {
    total: number;
    daily: DailyPoint[];
  };
  profiles: {
    total: number;
    completionRate: number;
    daily: DailyPoint[];
  };
  contactSubmissions: {
    total: number;
    daily: DailyPoint[];
    topOrigins: {
      origin: string;
      count: number;
    }[];
  };
  registrationsByRole: {
    totalAssignments: number;
    byKind: {
      kind: 'organizer' | 'athlete' | 'volunteer';
      count: number;
    }[];
  };
};

type DailyRow = {
  date: string;
  value: number;
};

type UserWithCreatedAt = {
  id: string;
  createdAt: Date;
};

const INTERNAL_ROLE_NAMES = getInternalRoleSourceNames();
const EXTERNAL_ROLE_NAMES_BY_KIND = getExternalRoleSourceNamesByKind();
const FEEDBACK_ORIGIN = 'feedback-dialog';

function buildDailySeries(rows: DailyRow[], start: Date, end: Date): DailyPoint[] {
  const valueByDate = new Map<string, number>();

  for (const row of rows) {
    const key = row.date;
    const current = valueByDate.get(key) ?? 0;
    valueByDate.set(key, current + Number(row.value ?? 0));
  }

  const days = eachDayOfInterval({ start, end });

  return days.map((day) => {
    const key = format(day, 'yyyy-MM-dd');
    return {
      date: key,
      value: valueByDate.get(key) ?? 0,
    };
  });
}

async function getExternalUsers(options: { since?: Date } = {}): Promise<UserWithCreatedAt[]> {
  const { since } = options;

  const userRows = await db
    .select({
      id: users.id,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(
      since ? and(isNull(users.deletedAt), gte(users.createdAt, since)) : isNull(users.deletedAt),
    );

  if (userRows.length === 0 || INTERNAL_ROLE_NAMES.length === 0) {
    return userRows;
  }

  const userIds = userRows.map((row) => row.id);

  const internalRoleRows = await db
    .select({
      userId: userRoles.userId,
      roleName: roles.name,
    })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(
      and(
        inArray(userRoles.userId, userIds),
        inArray(roles.name, INTERNAL_ROLE_NAMES),
        isNull(userRoles.deletedAt),
      ),
    );

  const internalUserIds = new Set(internalRoleRows.map((row) => row.userId));

  return userRows.filter((row) => !internalUserIds.has(row.id));
}

export async function getAdminDashboardMetrics(days = 30): Promise<AdminDashboardMetrics> {
  const now = new Date();
  const since = subDays(now, days - 1);

  const [externalUsersAll, externalUsersInRange] = await Promise.all([
    getExternalUsers(),
    getExternalUsers({ since }),
  ]);

  const [{ value: totalProfiles } = { value: 0 }] = await db
    .select({ value: sql<number>`count(*)` })
    .from(profiles)
    .where(isNull(profiles.deletedAt));

  const [{ value: totalFeedbackSubmissions } = { value: 0 }] = await db
    .select({ value: sql<number>`count(*)` })
    .from(contactSubmissions)
    .where(eq(contactSubmissions.origin, FEEDBACK_ORIGIN));

  const userDailyRows: DailyRow[] = externalUsersInRange.map((row) => ({
    date: format(row.createdAt, 'yyyy-MM-dd'),
    value: 1,
  }));

  const profileDailyRows = await db
    .select({
      date: sql<string>`date_trunc('day', ${profiles.createdAt})::date`,
      value: sql<number>`count(*)`,
    })
    .from(profiles)
    .where(and(isNull(profiles.deletedAt), gte(profiles.createdAt, since)))
    .groupBy(sql`date_trunc('day', ${profiles.createdAt})::date`)
    .orderBy(sql`date_trunc('day', ${profiles.createdAt})::date`);

  const contactDailyRows = await db
    .select({
      date: sql<string>`date_trunc('day', ${contactSubmissions.createdAt})::date`,
      value: sql<number>`count(*)`,
    })
    .from(contactSubmissions)
    .where(
      and(gte(contactSubmissions.createdAt, since), eq(contactSubmissions.origin, FEEDBACK_ORIGIN)),
    )
    .groupBy(sql`date_trunc('day', ${contactSubmissions.createdAt})::date`)
    .orderBy(sql`date_trunc('day', ${contactSubmissions.createdAt})::date`);

  const contactOriginsRows = await db
    .select({
      origin: contactSubmissions.origin,
      count: sql<number>`count(*)`,
    })
    .from(contactSubmissions)
    .where(eq(contactSubmissions.origin, FEEDBACK_ORIGIN))
    .groupBy(contactSubmissions.origin)
    .orderBy(sql`count(*) desc`)
    .limit(4);

  const externalUserIdsInRange = externalUsersInRange.map((row) => row.id);

  let registrationsByRole: AdminDashboardMetrics['registrationsByRole'] = {
    totalAssignments: 0,
    byKind: [
      { kind: 'organizer', count: 0 },
      { kind: 'athlete', count: 0 },
      { kind: 'volunteer', count: 0 },
    ],
  };

  if (externalUserIdsInRange.length > 0) {
    const roleNamesForKinds = {
      organizer: EXTERNAL_ROLE_NAMES_BY_KIND.organizer ?? [],
      athlete: EXTERNAL_ROLE_NAMES_BY_KIND.athlete ?? [],
      volunteer: EXTERNAL_ROLE_NAMES_BY_KIND.volunteer ?? [],
    };

    const allExternalRoleNames = [
      ...roleNamesForKinds.organizer,
      ...roleNamesForKinds.athlete,
      ...roleNamesForKinds.volunteer,
    ];

    if (allExternalRoleNames.length > 0) {
      const kindByRoleName = new Map<string, 'organizer' | 'athlete' | 'volunteer'>();

      (['organizer', 'athlete', 'volunteer'] as const).forEach((kind) => {
        for (const name of roleNamesForKinds[kind]) {
          kindByRoleName.set(name.toLowerCase(), kind);
        }
      });

      const roleRows = await db
        .select({
          userId: userRoles.userId,
          roleName: roles.name,
        })
        .from(userRoles)
        .innerJoin(roles, eq(roles.id, userRoles.roleId))
        .where(
          and(
            inArray(userRoles.userId, externalUserIdsInRange),
            inArray(roles.name, allExternalRoleNames),
            isNull(userRoles.deletedAt),
          ),
        );

      const counts = {
        organizer: 0,
        athlete: 0,
        volunteer: 0,
      };

      for (const row of roleRows) {
        const kind = kindByRoleName.get(row.roleName.toLowerCase());
        if (!kind) continue;
        counts[kind] += 1;
      }

      const totalAssignments = counts.organizer + counts.athlete + counts.volunteer;

      registrationsByRole = {
        totalAssignments,
        byKind: [
          { kind: 'organizer', count: counts.organizer },
          { kind: 'athlete', count: counts.athlete },
          { kind: 'volunteer', count: counts.volunteer },
        ],
      };
    }
  }

  const totalUsers = externalUsersAll.length;

  const usersDaily = buildDailySeries(userDailyRows, since, now);
  const profilesDaily = buildDailySeries(profileDailyRows, since, now);
  const contactDaily = buildDailySeries(contactDailyRows, since, now);

  const completionRate =
    totalUsers > 0 ? Math.min(1, Number(totalProfiles) / Number(totalUsers)) : 0;

  return {
    rangeLabel: `${days}d`,
    users: {
      total: totalUsers,
      daily: usersDaily,
    },
    profiles: {
      total: Number(totalProfiles ?? 0),
      completionRate,
      daily: profilesDaily,
    },
    contactSubmissions: {
      total: Number(totalFeedbackSubmissions ?? 0),
      daily: contactDaily,
      topOrigins: contactOriginsRows.map((row) => ({
        origin: row.origin,
        count: Number(row.count ?? 0),
      })),
    },
    registrationsByRole,
  };
}
