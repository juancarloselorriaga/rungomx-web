'use server';

import { and, desc, eq, inArray, isNull, type SQL, sql } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/db';
import {
  billingEvents,
  billingPendingEntitlementGrants,
  billingPromotions,
  roles,
  userRoles,
  users,
} from '@/db/schema';
import { withStaffUser } from '@/lib/auth/action-wrapper';
import { getInternalRoleSourceNames, getUserRolesWithInternalFlag } from '@/lib/auth/roles';
import {
  createPendingEntitlementGrant,
  createPromotion,
  disablePendingEntitlementGrant,
  disablePromotion,
  enablePendingEntitlementGrant,
  enablePromotion,
  extendAdminOverride,
  grantAdminOverride,
  revokeAdminOverride,
} from '@/lib/billing/commands';
import { hashEmailAllVersions } from '@/lib/billing/hash';
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

const promoSchema = z
  .object({
    name: z.string().max(255).optional().nullable(),
    description: z.string().max(1000).optional().nullable(),
    grantDurationDays: z.number().int().min(1).optional().nullable(),
    grantFixedEndsAt: z.string().datetime({ local: true }).optional().nullable(),
    validFrom: z.string().datetime({ local: true }).optional().nullable(),
    validTo: z.string().datetime({ local: true }).optional().nullable(),
    maxRedemptions: z.number().int().min(1).optional().nullable(),
    isActive: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    const hasDuration = typeof data.grantDurationDays === 'number';
    const hasFixedEnd = Boolean(data.grantFixedEndsAt);
    if (hasDuration === hasFixedEnd) {
      const message = 'Grant duration or fixed end is required';
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message,
        path: ['grantDurationDays'],
      });
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message,
        path: ['grantFixedEndsAt'],
      });
    }
  });

const parseUtcDateTime = (value?: string | null) => {
  if (!value) return null;
  if (/Z$|[+-]\d{2}:\d{2}$/.test(value)) {
    return new Date(value);
  }
  return new Date(`${value}Z`);
};

export const createPromotionAction = withStaffUser<FormActionResult<{ code: string }>>({
  unauthenticated: () => ({ ok: false, error: 'UNAUTHENTICATED', message: 'UNAUTHENTICATED' }),
  forbidden: () => ({ ok: false, error: 'FORBIDDEN', message: 'FORBIDDEN' }),
})(async (authContext, input: unknown) => {
  const validation = validateInput(promoSchema, input);
  if (!validation.success) {
    return validation.error;
  }

  const { name, description, grantDurationDays, grantFixedEndsAt, validFrom, validTo, maxRedemptions, isActive } =
    validation.data;

  const result = await createPromotion({
    createdByUserId: authContext.user.id,
    name,
    description,
    grantDurationDays: grantDurationDays ?? null,
    grantFixedEndsAt: parseUtcDateTime(grantFixedEndsAt),
    validFrom: parseUtcDateTime(validFrom),
    validTo: parseUtcDateTime(validTo),
    maxRedemptions: maxRedemptions ?? null,
    isActive: isActive ?? true,
  });

  if (!result.ok) {
    return { ok: false, error: result.code, message: result.error };
  }

  return { ok: true, data: { code: result.data.code } };
});

const disablePromoSchema = z.object({
  promotionId: z.string().uuid(),
});

export const disablePromotionAction = withStaffUser<FormActionResult<{ promotionId: string }>>({
  unauthenticated: () => ({ ok: false, error: 'UNAUTHENTICATED', message: 'UNAUTHENTICATED' }),
  forbidden: () => ({ ok: false, error: 'FORBIDDEN', message: 'FORBIDDEN' }),
})(async (authContext, input: unknown) => {
  const validation = validateInput(disablePromoSchema, input);
  if (!validation.success) {
    return validation.error;
  }

  const result = await disablePromotion({
    promotionId: validation.data.promotionId,
    disabledByUserId: authContext.user.id,
  });

  if (!result.ok) {
    return { ok: false, error: result.code, message: result.error };
  }

  return { ok: true, data: { promotionId: validation.data.promotionId } };
});

export const enablePromotionAction = withStaffUser<FormActionResult<{ promotionId: string }>>({
  unauthenticated: () => ({ ok: false, error: 'UNAUTHENTICATED', message: 'UNAUTHENTICATED' }),
  forbidden: () => ({ ok: false, error: 'FORBIDDEN', message: 'FORBIDDEN' }),
})(async (authContext, input: unknown) => {
  const validation = validateInput(disablePromoSchema, input);
  if (!validation.success) {
    return validation.error;
  }

  const result = await enablePromotion({
    promotionId: validation.data.promotionId,
    enabledByUserId: authContext.user.id,
  });

  if (!result.ok) {
    return { ok: false, error: result.code, message: result.error };
  }

  return { ok: true, data: { promotionId: validation.data.promotionId } };
});

type PromotionSearchOption = {
  id: string;
  name: string | null;
  description: string | null;
  codePrefix: string | null;
  isActive: boolean;
  redemptionCount: number;
  createdAt: string;
};

const promotionSearchSchema = z.object({
  query: z.string().max(200).optional().nullable(),
  limit: z.number().int().min(1).max(20).optional(),
});

export const searchPromotionOptionsAction = withStaffUser<
  FormActionResult<{ options: PromotionSearchOption[] }>
>({
  unauthenticated: () => ({ ok: false, error: 'UNAUTHENTICATED', message: 'UNAUTHENTICATED' }),
  forbidden: () => ({ ok: false, error: 'FORBIDDEN', message: 'FORBIDDEN' }),
})(async (_authContext, input: unknown) => {
  const validation = validateInput(promotionSearchSchema, input);
  if (!validation.success) {
    return validation.error;
  }

  const query = (validation.data.query ?? '').trim();
  const limit = validation.data.limit ?? 10;

  const conditions: SQL<unknown>[] = [eq(billingPromotions.entitlementKey, 'pro_access')];

  const similarityExpr = query
    ? sql<number>`greatest(
        coalesce(word_similarity(lower(${query}), lower(${billingPromotions.name})), 0),
        coalesce(word_similarity(lower(${query}), lower(${billingPromotions.description})), 0),
        coalesce(word_similarity(lower(${query}), lower(${billingPromotions.codePrefix})), 0),
        coalesce(similarity(lower(${query}), lower(${billingPromotions.name})), 0),
        coalesce(similarity(lower(${query}), lower(${billingPromotions.description})), 0),
        coalesce(similarity(lower(${query}), lower(${billingPromotions.codePrefix})), 0)
      )`
    : null;

  if (query) {
    const likeQuery = `%${query}%`;
    conditions.push(
      sql`(${similarityExpr} > 0.28
        OR ${billingPromotions.name} ILIKE ${likeQuery}
        OR ${billingPromotions.description} ILIKE ${likeQuery}
        OR ${billingPromotions.codePrefix} ILIKE ${likeQuery}
        OR ${billingPromotions.id}::text ILIKE ${likeQuery})`,
    );
  }

  const whereClause = and(...conditions);

  const promotions = await db.query.billingPromotions.findMany({
    where: whereClause,
    columns: {
      id: true,
      name: true,
      description: true,
      codePrefix: true,
      isActive: true,
      redemptionCount: true,
      createdAt: true,
    },
    orderBy: query
      ? [desc(billingPromotions.isActive), desc(similarityExpr!), desc(billingPromotions.createdAt)]
      : [desc(billingPromotions.isActive), desc(billingPromotions.createdAt)],
    limit,
  });

  return {
    ok: true,
    data: {
      options: promotions.map((promotion) => ({
        id: promotion.id,
        name: promotion.name ?? null,
        description: promotion.description ?? null,
        codePrefix: promotion.codePrefix ?? null,
        isActive: promotion.isActive,
        redemptionCount: promotion.redemptionCount,
        createdAt: promotion.createdAt.toISOString(),
      })),
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

const pendingGrantSchema = z
  .object({
    email: z.string().email(),
    grantDurationDays: z.number().int().min(1).optional().nullable(),
    grantFixedEndsAt: z.string().datetime({ local: true }).optional().nullable(),
    claimValidFrom: z.string().datetime({ local: true }).optional().nullable(),
    claimValidTo: z.string().datetime({ local: true }).optional().nullable(),
    isActive: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    const hasDuration = typeof data.grantDurationDays === 'number';
    const hasFixedEnd = Boolean(data.grantFixedEndsAt);
    if (hasDuration === hasFixedEnd) {
      const message = 'Grant duration or fixed end is required';
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message,
        path: ['grantDurationDays'],
      });
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message,
        path: ['grantFixedEndsAt'],
      });
    }
  });

export const createPendingGrantAction = withStaffUser<FormActionResult<{ pendingGrantId: string }>>({
  unauthenticated: () => ({ ok: false, error: 'UNAUTHENTICATED', message: 'UNAUTHENTICATED' }),
  forbidden: () => ({ ok: false, error: 'FORBIDDEN', message: 'FORBIDDEN' }),
})(async (authContext, input: unknown) => {
  const validation = validateInput(pendingGrantSchema, input);
  if (!validation.success) {
    return validation.error;
  }

  const { email, grantDurationDays, grantFixedEndsAt, claimValidFrom, claimValidTo, isActive } =
    validation.data;

  const result = await createPendingEntitlementGrant({
    email,
    createdByUserId: authContext.user.id,
    grantDurationDays: grantDurationDays ?? null,
    grantFixedEndsAt: parseUtcDateTime(grantFixedEndsAt),
    claimValidFrom: parseUtcDateTime(claimValidFrom),
    claimValidTo: parseUtcDateTime(claimValidTo),
    isActive: isActive ?? true,
  });

  if (!result.ok) {
    return { ok: false, error: result.code, message: result.error };
  }

  return { ok: true, data: { pendingGrantId: result.data.pendingGrantId } };
});

const disablePendingGrantSchema = z.object({
  pendingGrantId: z.string().uuid(),
});

export const disablePendingGrantAction = withStaffUser<FormActionResult<{ pendingGrantId: string }>>({
  unauthenticated: () => ({ ok: false, error: 'UNAUTHENTICATED', message: 'UNAUTHENTICATED' }),
  forbidden: () => ({ ok: false, error: 'FORBIDDEN', message: 'FORBIDDEN' }),
})(async (authContext, input: unknown) => {
  const validation = validateInput(disablePendingGrantSchema, input);
  if (!validation.success) {
    return validation.error;
  }

  const result = await disablePendingEntitlementGrant({
    pendingGrantId: validation.data.pendingGrantId,
    disabledByUserId: authContext.user.id,
  });

  if (!result.ok) {
    return { ok: false, error: result.code, message: result.error };
  }

  return { ok: true, data: { pendingGrantId: validation.data.pendingGrantId } };
});

export const enablePendingGrantAction = withStaffUser<FormActionResult<{ pendingGrantId: string }>>({
  unauthenticated: () => ({ ok: false, error: 'UNAUTHENTICATED', message: 'UNAUTHENTICATED' }),
  forbidden: () => ({ ok: false, error: 'FORBIDDEN', message: 'FORBIDDEN' }),
})(async (authContext, input: unknown) => {
  const validation = validateInput(disablePendingGrantSchema, input);
  if (!validation.success) {
    return validation.error;
  }

  const result = await enablePendingEntitlementGrant({
    pendingGrantId: validation.data.pendingGrantId,
    enabledByUserId: authContext.user.id,
  });

  if (!result.ok) {
    return { ok: false, error: result.code, message: result.error };
  }

  return { ok: true, data: { pendingGrantId: validation.data.pendingGrantId } };
});

type PendingGrantSearchOption = {
  id: string;
  isActive: boolean;
  claimedAt: string | null;
  createdAt: string;
  grantDurationDays: number | null;
  grantFixedEndsAt: string | null;
};

const pendingGrantSearchSchema = z.object({
  query: z.string().max(200).optional().nullable(),
  limit: z.number().int().min(1).max(20).optional(),
});

export const searchPendingGrantOptionsAction = withStaffUser<
  FormActionResult<{ options: PendingGrantSearchOption[] }>
>({
  unauthenticated: () => ({ ok: false, error: 'UNAUTHENTICATED', message: 'UNAUTHENTICATED' }),
  forbidden: () => ({ ok: false, error: 'FORBIDDEN', message: 'FORBIDDEN' }),
})(async (_authContext, input: unknown) => {
  const validation = validateInput(pendingGrantSearchSchema, input);
  if (!validation.success) {
    return validation.error;
  }

  const query = (validation.data.query ?? '').trim();
  const limit = validation.data.limit ?? 10;

  const isEmailQuery = Boolean(query) && z.string().email().safeParse(query).success;
  const emailHashes = isEmailQuery ? hashEmailAllVersions(query).map((entry) => entry.hash) : null;

  const whereClause = (() => {
    const base = eq(billingPendingEntitlementGrants.entitlementKey, 'pro_access');
    if (!query) return base;
    if (emailHashes?.length) {
      return and(base, inArray(billingPendingEntitlementGrants.emailHash, emailHashes));
    }
    return and(base, sql`${billingPendingEntitlementGrants.id}::text ILIKE ${`%${query}%`}`);
  })();

  const rows = await db.query.billingPendingEntitlementGrants.findMany({
    where: whereClause,
    columns: {
      id: true,
      isActive: true,
      claimedAt: true,
      createdAt: true,
      grantDurationDays: true,
      grantFixedEndsAt: true,
    },
    orderBy: [
      desc(billingPendingEntitlementGrants.isActive),
      desc(sql`${billingPendingEntitlementGrants.claimedAt} IS NULL`),
      desc(billingPendingEntitlementGrants.createdAt),
    ],
    limit,
  });

  return {
    ok: true,
    data: {
      options: rows.map((grant) => ({
        id: grant.id,
        isActive: grant.isActive,
        claimedAt: grant.claimedAt ? grant.claimedAt.toISOString() : null,
        createdAt: grant.createdAt.toISOString(),
        grantDurationDays: grant.grantDurationDays ?? null,
        grantFixedEndsAt: grant.grantFixedEndsAt ? grant.grantFixedEndsAt.toISOString() : null,
      })),
    },
  };
});

const overrideSchema = z
  .object({
    userId: z.string().uuid(),
    reason: z.string().min(3).max(500),
    grantDurationDays: z.number().int().min(1).optional().nullable(),
    grantFixedEndsAt: z.string().datetime({ local: true }).optional().nullable(),
  })
  .superRefine((data, ctx) => {
    const hasDuration = typeof data.grantDurationDays === 'number';
    const hasFixedEnd = Boolean(data.grantFixedEndsAt);
    if (hasDuration === hasFixedEnd) {
      const message = 'Grant duration or fixed end is required';
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message,
        path: ['grantDurationDays'],
      });
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message,
        path: ['grantFixedEndsAt'],
      });
    }
  });

export const grantOverrideAction = withStaffUser<FormActionResult<{ overrideId?: string }>>({
  unauthenticated: () => ({ ok: false, error: 'UNAUTHENTICATED', message: 'UNAUTHENTICATED' }),
  forbidden: () => ({ ok: false, error: 'FORBIDDEN', message: 'FORBIDDEN' }),
})(async (authContext, input: unknown) => {
  const validation = validateInput(overrideSchema, input);
  if (!validation.success) {
    return validation.error;
  }

  const result = await grantAdminOverride({
    userId: validation.data.userId,
    grantedByUserId: authContext.user.id,
    reason: validation.data.reason,
    grantDurationDays: validation.data.grantDurationDays ?? null,
    grantFixedEndsAt: parseUtcDateTime(validation.data.grantFixedEndsAt),
  });

  if (!result.ok) {
    return { ok: false, error: result.code, message: result.error };
  }

  return { ok: true, data: { overrideId: result.data.overrideId } };
});

export const extendOverrideAction = withStaffUser<FormActionResult<{ overrideId?: string }>>({
  unauthenticated: () => ({ ok: false, error: 'UNAUTHENTICATED', message: 'UNAUTHENTICATED' }),
  forbidden: () => ({ ok: false, error: 'FORBIDDEN', message: 'FORBIDDEN' }),
})(async (authContext, input: unknown) => {
  const validation = validateInput(overrideSchema, input);
  if (!validation.success) {
    return validation.error;
  }

  const result = await extendAdminOverride({
    userId: validation.data.userId,
    grantedByUserId: authContext.user.id,
    reason: validation.data.reason,
    grantDurationDays: validation.data.grantDurationDays ?? null,
    grantFixedEndsAt: parseUtcDateTime(validation.data.grantFixedEndsAt),
  });

  if (!result.ok) {
    return { ok: false, error: result.code, message: result.error };
  }

  return { ok: true, data: { overrideId: result.data.overrideId } };
});

const revokeOverrideSchema = z.object({
  overrideId: z.string().uuid(),
});

export const revokeOverrideAction = withStaffUser<FormActionResult<{ overrideId: string }>>({
  unauthenticated: () => ({ ok: false, error: 'UNAUTHENTICATED', message: 'UNAUTHENTICATED' }),
  forbidden: () => ({ ok: false, error: 'FORBIDDEN', message: 'FORBIDDEN' }),
})(async (authContext, input: unknown) => {
  const validation = validateInput(revokeOverrideSchema, input);
  if (!validation.success) {
    return validation.error;
  }

  const result = await revokeAdminOverride({
    overrideId: validation.data.overrideId,
    revokedByUserId: authContext.user.id,
  });

  if (!result.ok) {
    return { ok: false, error: result.code, message: result.error };
  }

  return { ok: true, data: { overrideId: validation.data.overrideId } };
});
