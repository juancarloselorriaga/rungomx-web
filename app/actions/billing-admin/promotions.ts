'use server';

import { and, asc, desc, eq, ilike, or, type SQL, sql } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/db';
import { billingPromotions } from '@/db/schema';
import {
  normalizeAdminPromotionsQuery,
  type AdminPromotionsQuery,
  type NormalizedAdminPromotionsQuery,
} from '@/lib/admin-pro-access/promotions-query';
import { withStaffUser } from '@/lib/auth/action-wrapper';
import { createPromotion, disablePromotion, enablePromotion } from '@/lib/billing/commands';
import type { FormActionResult } from '@/lib/forms';
import { validateInput } from '@/lib/forms';

import {
  parseUtcDateTime,
  requireDurationOrFixedEnd,
  toBillingAdminFailureResult,
  toBillingAdminSuccessResult,
} from './shared';

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
  .superRefine(requireDurationOrFixedEnd);

export const createPromotionAction = withStaffUser<FormActionResult<{ code: string }>>({
  unauthenticated: () => ({ ok: false, error: 'UNAUTHENTICATED', message: 'UNAUTHENTICATED' }),
  forbidden: () => ({ ok: false, error: 'FORBIDDEN', message: 'FORBIDDEN' }),
})(async (authContext, input: unknown) => {
  const validation = validateInput(promoSchema, input);
  if (!validation.success) {
    return validation.error;
  }

  const {
    name,
    description,
    grantDurationDays,
    grantFixedEndsAt,
    validFrom,
    validTo,
    maxRedemptions,
    isActive,
  } = validation.data;

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
    return toBillingAdminFailureResult(result);
  }

  return toBillingAdminSuccessResult({ code: result.data.code });
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
    return toBillingAdminFailureResult(result);
  }

  return toBillingAdminSuccessResult({ promotionId: validation.data.promotionId });
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
    return toBillingAdminFailureResult(result);
  }

  return toBillingAdminSuccessResult({ promotionId: validation.data.promotionId });
});

export type AdminPromotionRow = {
  id: string;
  name: string | null;
  description: string | null;
  codePrefix: string | null;
  isActive: boolean;
  redemptionCount: number;
  maxRedemptions: number | null;
  validFrom: Date | null;
  validTo: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ListPromotionsResult =
  | {
      ok: true;
      promotions: AdminPromotionRow[];
      page: number;
      pageSize: number;
      total: number;
      pageCount: number;
    }
  | { ok: false; error: 'UNAUTHENTICATED' | 'FORBIDDEN' | 'SERVER_ERROR' };

export const listPromotions = withStaffUser<ListPromotionsResult>({
  unauthenticated: () => ({ ok: false, error: 'UNAUTHENTICATED' }),
  forbidden: () => ({ ok: false, error: 'FORBIDDEN' }),
})(async (_authContext, query?: AdminPromotionsQuery) => {
  const normalized = normalizeAdminPromotionsQuery(query);

  try {
    const filters: SQL<unknown>[] = [eq(billingPromotions.entitlementKey, 'pro_access')];

    if (normalized.status === 'active') {
      filters.push(eq(billingPromotions.isActive, true));
    } else if (normalized.status === 'inactive') {
      filters.push(eq(billingPromotions.isActive, false));
    }

    if (normalized.search) {
      const pattern = `%${normalized.search}%`;
      filters.push(
        or(
          ilike(billingPromotions.name, pattern),
          ilike(billingPromotions.description, pattern),
          ilike(billingPromotions.codePrefix, pattern),
          sql`${billingPromotions.id}::text ILIKE ${pattern}`,
        ) as SQL<unknown>,
      );
    }

    const whereClause = and(...filters);

    const sortColumnMap: Record<NormalizedAdminPromotionsQuery['sortBy'], SQL<unknown>> = {
      createdAt: sql`${billingPromotions.createdAt}`,
      name: sql`coalesce(${billingPromotions.name}, '')`,
      redemptions: sql`${billingPromotions.redemptionCount}`,
    };

    const sortColumn = sortColumnMap[normalized.sortBy];

    const promotions = await db
      .select({
        id: billingPromotions.id,
        name: billingPromotions.name,
        description: billingPromotions.description,
        codePrefix: billingPromotions.codePrefix,
        isActive: billingPromotions.isActive,
        redemptionCount: billingPromotions.redemptionCount,
        maxRedemptions: billingPromotions.maxRedemptions,
        validFrom: billingPromotions.validFrom,
        validTo: billingPromotions.validTo,
        createdAt: billingPromotions.createdAt,
        updatedAt: billingPromotions.updatedAt,
      })
      .from(billingPromotions)
      .where(whereClause)
      .orderBy(
        normalized.sortDir === 'asc' ? asc(sortColumn) : desc(sortColumn),
        desc(billingPromotions.createdAt),
      )
      .limit(normalized.pageSize)
      .offset((normalized.page - 1) * normalized.pageSize);

    const totalResult = await db
      .select({ value: sql<number>`count(*)` })
      .from(billingPromotions)
      .where(whereClause);

    const total = Number(totalResult[0]?.value ?? 0);
    const pageCount = total === 0 ? 0 : Math.ceil(total / normalized.pageSize);

    return {
      ok: true,
      promotions: promotions.map((promotion) => ({
        id: promotion.id,
        name: promotion.name ?? null,
        description: promotion.description ?? null,
        codePrefix: promotion.codePrefix ?? null,
        isActive: promotion.isActive,
        redemptionCount: promotion.redemptionCount,
        maxRedemptions: promotion.maxRedemptions ?? null,
        validFrom: promotion.validFrom ?? null,
        validTo: promotion.validTo ?? null,
        createdAt: promotion.createdAt,
        updatedAt: promotion.updatedAt,
      })),
      page: normalized.page,
      pageSize: normalized.pageSize,
      total,
      pageCount,
    };
  } catch (error) {
    console.error('[billing-admin] Failed to list promotions', error);
    return { ok: false, error: 'SERVER_ERROR' };
  }
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
