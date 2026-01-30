'use server';

import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/db';
import { billingEvents, users } from '@/db/schema';
import { withStaffUser } from '@/lib/auth/action-wrapper';
import { getUserRolesWithInternalFlag } from '@/lib/auth/roles';
import {
  createPendingEntitlementGrant,
  createPromotion,
  disablePendingEntitlementGrant,
  disablePromotion,
  extendAdminOverride,
  grantAdminOverride,
  revokeAdminOverride,
} from '@/lib/billing/commands';
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
  createdAt: string;
};

type BillingUserSummary = {
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
})(async (_authContext, input: unknown) => {
  const validation = validateInput(lookupSchema, input);
  if (!validation.success) {
    return validation.error;
  }

  const user = await db.query.users.findFirst({
    where: eq(users.email, validation.data.email),
  });

  if (!user) {
    return { ok: false, error: 'NOT_FOUND', message: 'NOT_FOUND' };
  }

  const roleInfo = await getUserRolesWithInternalFlag(user.id);
  const status = await getBillingStatusForUser({
    userId: user.id,
    isInternal: roleInfo.isInternal,
  });

  const events = await db.query.billingEvents.findMany({
    where: eq(billingEvents.userId, user.id),
    orderBy: [desc(billingEvents.createdAt)],
    limit: 50,
  });

  const serializedEvents: BillingEventSummary[] = events.map((event) => ({
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
  .refine(
    (data) =>
      (data.grantDurationDays && !data.grantFixedEndsAt) ||
      (!data.grantDurationDays && data.grantFixedEndsAt),
    {
      message: 'Grant duration or fixed end is required',
      path: ['grantDurationDays'],
    },
  );

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

const pendingGrantSchema = z
  .object({
    email: z.string().email(),
    grantDurationDays: z.number().int().min(1).optional().nullable(),
    grantFixedEndsAt: z.string().datetime({ local: true }).optional().nullable(),
    claimValidFrom: z.string().datetime({ local: true }).optional().nullable(),
    claimValidTo: z.string().datetime({ local: true }).optional().nullable(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (data) =>
      (data.grantDurationDays && !data.grantFixedEndsAt) ||
      (!data.grantDurationDays && data.grantFixedEndsAt),
    {
      message: 'Grant duration or fixed end is required',
      path: ['grantDurationDays'],
    },
  );

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

const overrideSchema = z
  .object({
    userId: z.string().uuid(),
    reason: z.string().min(3).max(500),
    grantDurationDays: z.number().int().min(1).optional().nullable(),
    grantFixedEndsAt: z.string().datetime({ local: true }).optional().nullable(),
  })
  .refine(
    (data) =>
      (data.grantDurationDays && !data.grantFixedEndsAt) ||
      (!data.grantDurationDays && data.grantFixedEndsAt),
    {
      message: 'Grant duration or fixed end is required',
      path: ['grantDurationDays'],
    },
  );

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
