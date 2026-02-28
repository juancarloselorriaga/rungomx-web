'use server';

import { z } from 'zod';
import { headers } from 'next/headers';
import { revalidateTag } from 'next/cache';

import { withStaffUser } from '@/lib/auth/action-wrapper';
import { getRequestContext } from '@/lib/audit';
import type { FormActionResult } from '@/lib/forms';
import { validateInput } from '@/lib/forms';
import { adminPaymentsCacheTags } from '@/lib/payments/economics/cache-tags';
import {
  getFxRateActionFlagsForAdmin,
  listDailyFxRatesForAdmin,
  upsertDailyFxRateForAdmin,
  type DailyFxRateRecord,
  type FxRateActionFlags,
} from '@/lib/payments/economics/fx-rate-management';

const upsertFxRateSchema = z
  .object({
    sourceCurrency: z.string().trim().length(3),
    effectiveDate: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/),
    rateToMxn: z.coerce.number().positive(),
    reason: z.string().trim().min(3).max(500),
  })
  .strict();

function parseUpsertInput(input: unknown): unknown {
  if (input instanceof FormData) {
    return {
      sourceCurrency: input.get('sourceCurrency'),
      effectiveDate: input.get('effectiveDate'),
      rateToMxn: input.get('rateToMxn'),
      reason: input.get('reason'),
    };
  }

  return input;
}

function parseUtcDateOnly(dateValue: string): Date {
  return new Date(`${dateValue}T00:00:00.000Z`);
}

export const upsertDailyFxRateAdminAction = withStaffUser<FormActionResult<{ rateId: string }>>({
  unauthenticated: () => ({ ok: false, error: 'UNAUTHENTICATED', message: 'UNAUTHENTICATED' }),
  forbidden: () => ({ ok: false, error: 'FORBIDDEN', message: 'FORBIDDEN' }),
})(async (authContext, input: unknown) => {
  const validation = validateInput(upsertFxRateSchema, parseUpsertInput(input));
  if (!validation.success) {
    return validation.error;
  }

  try {
    const requestContext = await getRequestContext(await headers());
    const record = await upsertDailyFxRateForAdmin({
      sourceCurrency: validation.data.sourceCurrency,
      effectiveDate: parseUtcDateOnly(validation.data.effectiveDate),
      rateToMxn: validation.data.rateToMxn,
      reason: validation.data.reason,
      actorUserId: authContext.user.id,
      request: requestContext,
    });
    revalidateTag(adminPaymentsCacheTags.fxRates, { expire: 0 });
    revalidateTag(adminPaymentsCacheTags.fxActionFlags, { expire: 0 });
    revalidateTag(adminPaymentsCacheTags.fxSnapshots, { expire: 0 });
    revalidateTag(adminPaymentsCacheTags.mxnReport, { expire: 0 });

    return {
      ok: true,
      data: {
        rateId: record.id,
      },
    };
  } catch (error) {
    console.error('[payments-fx] Failed to upsert daily FX rate', error);
    return { ok: false, error: 'SERVER_ERROR', message: 'SERVER_ERROR' };
  }
});

export const listDailyFxRatesAdminAction = withStaffUser<FormActionResult<DailyFxRateRecord[]>>({
  unauthenticated: () => ({ ok: false, error: 'UNAUTHENTICATED', message: 'UNAUTHENTICATED' }),
  forbidden: () => ({ ok: false, error: 'FORBIDDEN', message: 'FORBIDDEN' }),
})(async () => {
  try {
    const rows = await listDailyFxRatesForAdmin();
    return { ok: true, data: rows };
  } catch (error) {
    console.error('[payments-fx] Failed to list daily FX rates', error);
    return { ok: false, error: 'SERVER_ERROR', message: 'SERVER_ERROR' };
  }
});

export const getFxRateActionFlagsAdminAction = withStaffUser<FormActionResult<FxRateActionFlags>>({
  unauthenticated: () => ({ ok: false, error: 'UNAUTHENTICATED', message: 'UNAUTHENTICATED' }),
  forbidden: () => ({ ok: false, error: 'FORBIDDEN', message: 'FORBIDDEN' }),
})(async () => {
  try {
    const flags = await getFxRateActionFlagsForAdmin();
    return { ok: true, data: flags };
  } catch (error) {
    console.error('[payments-fx] Failed to compute FX action flags', error);
    return { ok: false, error: 'SERVER_ERROR', message: 'SERVER_ERROR' };
  }
});
