'use server';

import { z } from 'zod';

import { withStaffUser } from '@/lib/auth/action-wrapper';
import {
  extendAdminOverride,
  grantAdminOverride,
  revokeAdminOverride,
} from '@/lib/billing/commands';
import type { FormActionResult } from '@/lib/forms';
import { validateInput } from '@/lib/forms';

import {
  parseUtcDateTime,
  requireDurationOrFixedEnd,
  toBillingAdminFailureResult,
  toBillingAdminSuccessResult,
} from './shared';

const overrideSchema = z
  .object({
    userId: z.string().uuid(),
    reason: z.string().min(3).max(500),
    grantDurationDays: z.number().int().min(1).optional().nullable(),
    grantFixedEndsAt: z.string().datetime({ local: true }).optional().nullable(),
  })
  .superRefine(requireDurationOrFixedEnd);

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
    return toBillingAdminFailureResult(result);
  }

  return toBillingAdminSuccessResult({ overrideId: result.data.overrideId });
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
    return toBillingAdminFailureResult(result);
  }

  return toBillingAdminSuccessResult({ overrideId: result.data.overrideId });
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
    return toBillingAdminFailureResult(result);
  }

  return toBillingAdminSuccessResult({ overrideId: validation.data.overrideId });
});
