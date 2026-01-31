'use server';

import { and, eq, gte, lte, sql, type SQLWrapper } from 'drizzle-orm';
import { z } from 'zod';
import { headers } from 'next/headers';

import { db } from '@/db';
import { proFeatureConfigs, proFeatureUsageEvents } from '@/db/schema';
import { createAuditLog, getRequestContext } from '@/lib/audit';
import { withStaffUser } from '@/lib/auth/action-wrapper';
import type { FormActionResult } from '@/lib/forms';
import { validateInput } from '@/lib/forms';
import { safeRevalidateTag } from '@/lib/next-cache';
import {
  PRO_FEATURE_CATALOG,
  getAllProFeatureKeys,
  getProFeatureMeta,
  type ProFeatureAdminKey,
  type ProFeatureKey,
  type ProFeatureUpsellHref,
} from '@/lib/pro-features/catalog';
import { evaluateProFeatureDecision } from '@/lib/pro-features/evaluator';
import { proFeaturesConfigTag } from '@/lib/pro-features/cache-tags';
import type {
  ProFeatureDecision,
  ProFeatureVisibility,
  ResolvedProFeatureConfig,
} from '@/lib/pro-features/types';

const featureKeys = getAllProFeatureKeys();

export type ProFeatureAdminSummary = {
  featureKey: ProFeatureKey;
  labelKey: ProFeatureAdminKey;
  descriptionKey: ProFeatureAdminKey;
  defaultVisibility: ProFeatureVisibility;
  enforcement: ResolvedProFeatureConfig<ProFeatureKey>['enforcement'];
  upsellHref: ProFeatureUpsellHref;
  config: Pick<ResolvedProFeatureConfig<ProFeatureKey>, 'id' | 'enabled' | 'visibilityOverride' | 'notes'>;
  decisions: {
    pro: ProFeatureDecision<ProFeatureKey>;
    nonPro: ProFeatureDecision<ProFeatureKey>;
  };
};

export const listProFeatureConfigsAdminAction = withStaffUser<
  FormActionResult<ProFeatureAdminSummary[]>
>({
  unauthenticated: () => ({ ok: false, error: 'UNAUTHENTICATED', message: 'UNAUTHENTICATED' }),
  forbidden: () => ({ ok: false, error: 'FORBIDDEN', message: 'FORBIDDEN' }),
})(async () => {
  try {
    const rows = await db.query.proFeatureConfigs.findMany();
    const rowMap = new Map<string, typeof proFeatureConfigs.$inferSelect>();

    rows.forEach((row) => {
      if (!(row.featureKey in PRO_FEATURE_CATALOG)) {
        console.warn(`[pro-features] Unknown feature key found in config table: ${row.featureKey}`);
        return;
      }
      rowMap.set(row.featureKey, row);
    });

    const summaries = featureKeys.map((featureKey) => {
      const meta = getProFeatureMeta(featureKey);
      const row = rowMap.get(featureKey);

      const resolvedConfig: ResolvedProFeatureConfig<ProFeatureKey> = {
        id: row?.id,
        featureKey,
        enabled: row?.enabled ?? true,
        visibilityOverride: (row?.visibilityOverride ?? null) as ResolvedProFeatureConfig<
          ProFeatureKey
        >['visibilityOverride'],
        notes: row?.notes ?? null,
        defaultVisibility: meta.defaultVisibility,
        enforcement: meta.enforcement,
        upsellHref: meta.upsellHref,
      };

      return {
        featureKey,
        labelKey: meta.i18n.adminLabelKey,
        descriptionKey: meta.i18n.adminDescriptionKey,
        defaultVisibility: meta.defaultVisibility,
        enforcement: meta.enforcement,
        upsellHref: meta.upsellHref,
        config: {
          id: resolvedConfig.id,
          enabled: resolvedConfig.enabled,
          visibilityOverride: resolvedConfig.visibilityOverride,
          notes: resolvedConfig.notes,
        },
        decisions: {
          pro: evaluateProFeatureDecision({
            featureKey,
            config: resolvedConfig,
            isPro: true,
            isInternal: false,
          }),
          nonPro: evaluateProFeatureDecision({
            featureKey,
            config: resolvedConfig,
            isPro: false,
            isInternal: false,
          }),
        },
      } satisfies ProFeatureAdminSummary;
    });

    return { ok: true, data: summaries };
  } catch (error) {
    console.error('[pro-features] Failed to list configs', error);
    return { ok: false, error: 'SERVER_ERROR', message: 'SERVER_ERROR' };
  }
});

const updateSchema = z
  .object({
    featureKey: z.enum(featureKeys as [ProFeatureKey, ...ProFeatureKey[]]),
    patch: z
      .object({
        enabled: z.boolean().optional(),
        visibilityOverride: z.enum(['locked', 'hidden']).nullable().optional(),
        notes: z.string().max(2000).nullable().optional(),
      })
      .refine((value) => Object.keys(value).length > 0, { message: 'Patch is required' }),
    reason: z.string().min(3).max(500),
  })
  .strict();

export const updateProFeatureConfigAdminAction = withStaffUser<
  FormActionResult<{ featureKey: ProFeatureKey }>
>({
  unauthenticated: () => ({ ok: false, error: 'UNAUTHENTICATED', message: 'UNAUTHENTICATED' }),
  forbidden: () => ({ ok: false, error: 'FORBIDDEN', message: 'FORBIDDEN' }),
})(async (authContext, input: unknown) => {
  const validation = validateInput(updateSchema, input);
  if (!validation.success) {
    return validation.error;
  }

  const { featureKey, patch, reason } = validation.data;

  if (!(featureKey in PRO_FEATURE_CATALOG)) {
    return { ok: false, error: 'INVALID_INPUT', message: 'Unknown feature key' };
  }

  try {
    const result = await db.transaction(async (tx) => {
      const existing = await tx.query.proFeatureConfigs.findFirst({
        where: eq(proFeatureConfigs.featureKey, featureKey),
      });

      const updateValues: Partial<typeof proFeatureConfigs.$inferInsert> = {
        updatedAt: new Date(),
      };

      if (patch.enabled !== undefined) updateValues.enabled = patch.enabled;
      if (patch.visibilityOverride !== undefined) {
        updateValues.visibilityOverride =
          patch.visibilityOverride as ResolvedProFeatureConfig<ProFeatureKey>['visibilityOverride'];
      }
      if (patch.notes !== undefined) updateValues.notes = patch.notes;

      const [updated] = existing
        ? await tx
            .update(proFeatureConfigs)
            .set(updateValues)
            .where(eq(proFeatureConfigs.featureKey, featureKey))
            .returning()
        : await tx
            .insert(proFeatureConfigs)
            .values({
              featureKey,
              enabled: patch.enabled ?? true,
              visibilityOverride:
                (patch.visibilityOverride ?? null) as ResolvedProFeatureConfig<ProFeatureKey>['visibilityOverride'],
              notes: patch.notes ?? null,
            })
            .returning();

      const requestContext = await getRequestContext(await headers());
      const auditResult = await createAuditLog(
        {
          organizationId: null,
          actorUserId: authContext.user.id,
          action: 'pro_feature_config.update',
          entityType: 'pro_feature_config',
          entityId: updated.id,
          before: existing
            ? {
                enabled: existing.enabled,
                visibilityOverride: existing.visibilityOverride,
                notes: existing.notes,
              }
            : undefined,
          after: {
            enabled: updated.enabled,
            visibilityOverride: updated.visibilityOverride,
            notes: updated.notes,
            reason,
          },
          request: requestContext,
        },
        tx,
      );

      if (!auditResult.ok) {
        throw new Error(auditResult.error ?? 'Failed to create audit log');
      }

      return { ok: true as const, featureKey };
    });

    if (!result.ok) {
      return { ok: false, error: result.error, message: result.message };
    }

    safeRevalidateTag(proFeaturesConfigTag());
    return { ok: true, data: { featureKey: result.featureKey } };
  } catch (error) {
    console.error('[pro-features] Failed to update config', error);
    return { ok: false, error: 'SERVER_ERROR', message: 'SERVER_ERROR' };
  }
});

const reportSchema = z
  .object({
    from: z
      .string()
      .refine((value) => !Number.isNaN(Date.parse(value)), { message: 'Invalid date' })
      .optional()
      .nullable(),
    to: z
      .string()
      .refine((value) => !Number.isNaN(Date.parse(value)), { message: 'Invalid date' })
      .optional()
      .nullable(),
  })
  .strict();

const hasTimeZone = (value: string) => /Z$|[+-]\d{2}:\d{2}$/.test(value);
const hasTime = (value: string) => value.includes('T');

const parseUtcDateTimeStart = (value?: string | null) => {
  if (!value) return null;
  if (hasTimeZone(value)) return new Date(value);
  if (hasTime(value)) return new Date(`${value}Z`);
  return new Date(`${value}T00:00:00.000Z`);
};

const parseUtcDateTimeEnd = (value?: string | null) => {
  if (!value) return null;
  if (hasTimeZone(value)) return new Date(value);
  if (hasTime(value)) return new Date(`${value}Z`);
  return new Date(`${value}T23:59:59.999Z`);
};

export type ProFeatureUsageSummary = {
  featureKey: ProFeatureKey;
  count: number;
};

export type ProFeatureUsageReport = {
  from: string | null;
  to: string | null;
  blocked: ProFeatureUsageSummary[];
  used: ProFeatureUsageSummary[];
};

const MAX_REPORT_ROWS = 5;

export const getProFeatureUsageReportAdminAction = withStaffUser<
  FormActionResult<ProFeatureUsageReport>
>({
  unauthenticated: () => ({ ok: false, error: 'UNAUTHENTICATED', message: 'UNAUTHENTICATED' }),
  forbidden: () => ({ ok: false, error: 'FORBIDDEN', message: 'FORBIDDEN' }),
})(async (_authContext, input: unknown) => {
  const validation = validateInput(reportSchema, input);
  if (!validation.success) {
    return validation.error;
  }

  const from = parseUtcDateTimeStart(validation.data.from);
  const to = parseUtcDateTimeEnd(validation.data.to);

  try {
    const whereClauses = [
      from ? gte(proFeatureUsageEvents.createdAt, from) : undefined,
      to ? lte(proFeatureUsageEvents.createdAt, to) : undefined,
    ].filter(Boolean) as SQLWrapper[];

    const rows = await db
      .select({
        featureKey: proFeatureUsageEvents.featureKey,
        eventType: proFeatureUsageEvents.eventType,
        count: sql<number>`count(*)::int`,
      })
      .from(proFeatureUsageEvents)
      .where(whereClauses.length ? and(...whereClauses) : undefined)
      .groupBy(proFeatureUsageEvents.featureKey, proFeatureUsageEvents.eventType);

    const blocked = rows
      .filter((row) => row.eventType === 'blocked')
      .map((row) => ({
        featureKey: row.featureKey as ProFeatureKey,
        count: row.count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, MAX_REPORT_ROWS);

    const used = rows
      .filter((row) => row.eventType === 'used')
      .map((row) => ({
        featureKey: row.featureKey as ProFeatureKey,
        count: row.count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, MAX_REPORT_ROWS);

    return {
      ok: true,
      data: {
        from: from ? from.toISOString() : null,
        to: to ? to.toISOString() : null,
        blocked,
        used,
      },
    };
  } catch (error) {
    console.error('[pro-features] Failed to load report', error);
    return { ok: false, error: 'SERVER_ERROR', message: 'SERVER_ERROR' };
  }
});
