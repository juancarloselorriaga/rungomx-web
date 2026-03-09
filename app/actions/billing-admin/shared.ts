import { z } from 'zod';

type DurationOrFixedEndInput = {
  grantDurationDays?: number | null;
  grantFixedEndsAt?: string | null;
};

const DURATION_OR_FIXED_END_REQUIRED_MESSAGE = 'Grant duration or fixed end is required';

export function requireDurationOrFixedEnd(
  data: DurationOrFixedEndInput,
  ctx: z.RefinementCtx,
) {
  const hasDuration = typeof data.grantDurationDays === 'number';
  const hasFixedEnd = Boolean(data.grantFixedEndsAt);

  if (hasDuration === hasFixedEnd) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: DURATION_OR_FIXED_END_REQUIRED_MESSAGE,
      path: ['grantDurationDays'],
    });
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: DURATION_OR_FIXED_END_REQUIRED_MESSAGE,
      path: ['grantFixedEndsAt'],
    });
  }
}

export function parseUtcDateTime(value?: string | null) {
  if (!value) return null;
  if (/Z$|[+-]\d{2}:\d{2}$/.test(value)) {
    return new Date(value);
  }
  return new Date(`${value}Z`);
}

export function toBillingAdminFailureResult<TCode extends string>(result: {
  ok: false;
  code: TCode;
  error: string;
}) {
  return { ok: false, error: result.code, message: result.error } as const;
}

export function toBillingAdminSuccessResult<TData>(data: TData) {
  return { ok: true, data } as const;
}
