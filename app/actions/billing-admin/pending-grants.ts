'use server';

import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/db';
import { billingPendingEntitlementGrants } from '@/db/schema';
import { withStaffUser } from '@/lib/auth/action-wrapper';
import {
  createPendingEntitlementGrant,
  disablePendingEntitlementGrant,
  enablePendingEntitlementGrant,
} from '@/lib/billing/commands';
import { hashEmailAllVersions } from '@/lib/billing/hash';
import type { FormActionResult } from '@/lib/forms';
import { validateInput } from '@/lib/forms';

import {
  parseUtcDateTime,
  requireDurationOrFixedEnd,
  toBillingAdminFailureResult,
  toBillingAdminSuccessResult,
} from './shared';

const pendingGrantSchema = z
  .object({
    email: z.string().email(),
    grantDurationDays: z.number().int().min(1).optional().nullable(),
    grantFixedEndsAt: z.string().datetime({ local: true }).optional().nullable(),
    claimValidFrom: z.string().datetime({ local: true }).optional().nullable(),
    claimValidTo: z.string().datetime({ local: true }).optional().nullable(),
    isActive: z.boolean().optional(),
  })
  .superRefine(requireDurationOrFixedEnd);

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
    return toBillingAdminFailureResult(result);
  }

  return toBillingAdminSuccessResult({ pendingGrantId: result.data.pendingGrantId });
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
    return toBillingAdminFailureResult(result);
  }

  return toBillingAdminSuccessResult({ pendingGrantId: validation.data.pendingGrantId });
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
    return toBillingAdminFailureResult(result);
  }

  return toBillingAdminSuccessResult({ pendingGrantId: validation.data.pendingGrantId });
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
