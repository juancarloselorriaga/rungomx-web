'use server';

import { and, desc, eq, inArray, isNull, type SQL, sql } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/db';
import {
  billingEvents,
  roles,
  userRoles,
  users,
} from '@/db/schema';
import { withStaffUser } from '@/lib/auth/action-wrapper';
import { getInternalRoleSourceNames, getUserRolesWithInternalFlag } from '@/lib/auth/roles';
import { getBillingStatusForUser } from '@/lib/billing/queries';
import type { SerializableBillingStatus } from '@/lib/billing/serialization';
import { serializeBillingStatus } from '@/lib/billing/serialization';
import type { FormActionResult } from '@/lib/forms';
import { validateInput } from '@/lib/forms';

type BillingEventSummary = {
  id: string;
  type: string;
  source: string;
  provider: string | null;
  externalEventId: string | null;
  entityType: string;
  entityId: string | null;
  payload: Record<string, unknown>;
  actor: { id: string; name: string | null; email: string } | null;
  createdAt: string;
};

type BillingUserSummary = {
  serverTimeMs: number;
  user: {
    id: string;
    name: string | null;
    email: string;
    emailVerified: boolean;
    createdAt: string;
    isInternal: boolean;
  };
  status: SerializableBillingStatus;
  events: BillingEventSummary[];
};

const lookupSchema = z.object({
  email: z.string().email(),
});

export const lookupBillingUserAction = withStaffUser<FormActionResult<BillingUserSummary>>({
  unauthenticated: () => ({ ok: false, error: 'UNAUTHENTICATED', message: 'UNAUTHENTICATED' }),
  forbidden: () => ({ ok: false, error: 'FORBIDDEN', message: 'FORBIDDEN' }),
})(async (authContext, input: unknown) => {
  const validation = validateInput(lookupSchema, input);
  if (!validation.success) {
    return validation.error;
  }

  const serverTimeMs = Date.now();

  const user = await db.query.users.findFirst({
    where: eq(users.email, validation.data.email),
  });

  if (!user) {
    return { ok: false, error: 'NOT_FOUND', message: 'NOT_FOUND' };
  }

  const roleInfo = await getUserRolesWithInternalFlag(user.id);
  if (roleInfo.isInternal && !authContext.permissions.canManageUsers) {
    return { ok: false, error: 'NOT_FOUND', message: 'NOT_FOUND' };
  }
  const status = await getBillingStatusForUser({
    userId: user.id,
    isInternal: roleInfo.isInternal,
  });

  const events = await db.query.billingEvents.findMany({
    where: eq(billingEvents.userId, user.id),
    orderBy: [desc(billingEvents.createdAt)],
    limit: 50,
  });

  const actorIds = authContext.permissions.canManageUsers
    ? Array.from(
        new Set(
          events
            .map((event) => {
              const payload = event.payloadJson ?? {};
              if (typeof payload.grantedByUserId === 'string') return payload.grantedByUserId;
              if (typeof payload.revokedByUserId === 'string') return payload.revokedByUserId;
              return null;
            })
            .filter((value): value is string => Boolean(value)),
        ),
      )
    : [];

  const actors = actorIds.length
    ? await db
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .where(inArray(users.id, actorIds))
    : [];

  const actorById = new Map(actors.map((actor) => [actor.id, actor]));

  const serializedEvents: BillingEventSummary[] = events.map((event) => ({
    actor: (() => {
      if (!authContext.permissions.canManageUsers) return null;
      const payload = event.payloadJson ?? {};
      const actorUserId =
        typeof payload.grantedByUserId === 'string'
          ? payload.grantedByUserId
          : typeof payload.revokedByUserId === 'string'
            ? payload.revokedByUserId
            : null;
      return actorUserId ? actorById.get(actorUserId) ?? null : null;
    })(),
    id: event.id,
    type: event.type,
    source: event.source,
    provider: event.provider,
    externalEventId: event.externalEventId,
    entityType: event.entityType,
    entityId: event.entityId,
    payload: event.payloadJson ?? {},
    createdAt: event.createdAt.toISOString(),
  }));

  return {
    ok: true,
    data: {
      serverTimeMs,
      user: {
        id: user.id,
        name: user.name ?? null,
        email: user.email,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt.toISOString(),
        isInternal: roleInfo.isInternal,
      },
      status: serializeBillingStatus(status),
      events: serializedEvents,
    },
  };
});

type UserEmailSearchOption = {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
};

const userEmailSearchSchema = z.object({
  query: z.string().max(200).optional().nullable(),
  limit: z.number().int().min(1).max(20).optional(),
});

export const searchUserEmailOptionsAction = withStaffUser<
  FormActionResult<{ options: UserEmailSearchOption[] }>
>({
  unauthenticated: () => ({ ok: false, error: 'UNAUTHENTICATED', message: 'UNAUTHENTICATED' }),
  forbidden: () => ({ ok: false, error: 'FORBIDDEN', message: 'FORBIDDEN' }),
})(async (authContext, input: unknown) => {
  const validation = validateInput(userEmailSearchSchema, input);
  if (!validation.success) {
    return validation.error;
  }

  const query = (validation.data.query ?? '').trim();
  const limit = validation.data.limit ?? 10;

  const filters: SQL<unknown>[] = [
    isNull(users.deletedAt),
  ];

  if (!authContext.permissions.canManageUsers) {
    const internalRoleNames = getInternalRoleSourceNames();
    const internalRoleList = sql.join(
      internalRoleNames.map((roleName) => sql`${roleName}`),
      sql`, `,
    );

    filters.push(sql`NOT EXISTS (
        SELECT 1
        FROM ${userRoles}
        INNER JOIN ${roles} ON ${roles.id} = ${userRoles.roleId}
        WHERE ${userRoles.userId} = ${users.id}
          AND ${userRoles.deletedAt} IS NULL
          AND ${roles.deletedAt} IS NULL
          AND ${roles.name} IN (${internalRoleList})
      )`);
  }

  const similarityExpr = query
    ? sql<number>`greatest(
        coalesce(word_similarity(lower(${query}), lower(${users.email})), 0),
        coalesce(word_similarity(lower(${query}), lower(${users.name})), 0),
        coalesce(similarity(lower(${query}), lower(${users.email})), 0),
        coalesce(similarity(lower(${query}), lower(${users.name})), 0)
      )`
    : null;

  if (query) {
    const likeQuery = `%${query}%`;
    filters.push(
      sql`(${similarityExpr} > 0.22 OR ${users.email} ILIKE ${likeQuery} OR ${users.name} ILIKE ${likeQuery})`,
    );
  }

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(and(...filters))
    .orderBy(...(query ? [desc(similarityExpr!), desc(users.createdAt)] : [desc(users.createdAt)]))
    .limit(limit);

  return {
    ok: true,
    data: {
      options: rows.map((user) => ({
        id: user.id,
        email: user.email,
        name: user.name ?? null,
        createdAt: user.createdAt.toISOString(),
      })),
    },
  };
});
