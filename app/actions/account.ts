'use server';

import { db } from '@/db';
import { users } from '@/db/schema';
import { auth } from '@/lib/auth';
import { withAuthenticatedUser } from '@/lib/auth/action-wrapper';
import {
  accountNameUpdateSchema,
  passwordChangeSchema,
  type AccountNameUpdateInput,
  type PasswordChangeInput,
} from '@/lib/auth/account-schemas';
import { extractFieldErrors, type FormActionResult, validateInput } from '@/lib/forms';
import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';

type UpdateAccountNameResult = FormActionResult<{ name: string }>;
type ChangePasswordResult = FormActionResult<null>;

const GENERIC_ERROR_MESSAGE = 'SERVER_ERROR';

export const updateAccountNameAction = withAuthenticatedUser<UpdateAccountNameResult>({
  unauthenticated: () => ({ ok: false, error: 'UNAUTHENTICATED', message: 'UNAUTHENTICATED' }),
})(async ({ user }, input: AccountNameUpdateInput | unknown) => {
  const validation = validateInput(accountNameUpdateSchema, input);

  if (!validation.success) {
    return validation.error;
  }

  const { name } = validation.data;

  try {
    await db
      .update(users)
      .set({ name, updatedAt: new Date() })
      .where(eq(users.id, user.id));

    const h = await headers();
    await auth.api.getSession({
      headers: h,
      query: { disableCookieCache: true },
    });

    return {
      ok: true,
      data: { name },
    };
  } catch (error) {
    console.error('[account] Failed to update account name', error);
    return { ok: false, error: 'SERVER_ERROR', message: GENERIC_ERROR_MESSAGE };
  }
});

function extractErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  const maybeMessage = (error as { message?: unknown }).message;
  const message =
    (typeof maybeMessage === 'string' && maybeMessage) ||
    (typeof maybeMessage === 'object' && maybeMessage && 'message' in (maybeMessage as object)
      ? String((maybeMessage as { message?: unknown }).message ?? '')
      : null);

  if (message) return message;

  const cause = (error as { cause?: unknown }).cause;
  const causeMessage =
    cause && typeof cause === 'object' && 'message' in cause
      ? String((cause as { message?: unknown }).message ?? '')
      : null;

  return causeMessage || null;
}

function mapPasswordError(code: string): ChangePasswordResult | null {
  const normalized = code.toUpperCase();

  if (normalized.includes('INVALID_PASSWORD')) {
    return {
      ok: false,
      error: 'INVALID_INPUT',
      fieldErrors: { currentPassword: ['INVALID_PASSWORD'] },
      message: 'INVALID_PASSWORD',
    };
  }

  if (normalized.includes('PASSWORD_TOO_SHORT')) {
    return {
      ok: false,
      error: 'INVALID_INPUT',
      fieldErrors: { newPassword: ['PASSWORD_TOO_SHORT'] },
      message: 'PASSWORD_TOO_SHORT',
    };
  }

  if (normalized.includes('PASSWORD_TOO_LONG')) {
    return {
      ok: false,
      error: 'INVALID_INPUT',
      fieldErrors: { newPassword: ['PASSWORD_TOO_LONG'] },
      message: 'PASSWORD_TOO_LONG',
    };
  }

  if (normalized.includes('PWNED') || normalized.includes('BREACH')) {
    return {
      ok: false,
      error: 'INVALID_INPUT',
      fieldErrors: { newPassword: ['PASSWORD_PWNED'] },
      message: 'PASSWORD_PWNED',
    };
  }

  return null;
}

export const changePasswordAction = withAuthenticatedUser<ChangePasswordResult>({
  unauthenticated: () => ({ ok: false, error: 'UNAUTHENTICATED', message: 'UNAUTHENTICATED' }),
})(async (_ctx, input: PasswordChangeInput | unknown) => {
  const parsed = passwordChangeSchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      error: 'INVALID_INPUT',
      fieldErrors: extractFieldErrors(parsed.error),
      message: 'INVALID_INPUT',
    };
  }

  const { currentPassword, newPassword, revokeOtherSessions = true } = parsed.data;

  try {
    const requestHeaders = await headers();
    await auth.api.changePassword({
      headers: requestHeaders,
      body: {
        currentPassword,
        newPassword,
        revokeOtherSessions,
      },
    });

    await auth.api.getSession({
      headers: requestHeaders,
      query: { disableCookieCache: true },
    });

    return { ok: true, data: null };
  } catch (error) {
    const code = extractErrorCode(error);
    const mapped = code ? mapPasswordError(code) : null;
    if (mapped) return mapped;

    console.error('[account] Failed to change password', error);
    return { ok: false, error: 'SERVER_ERROR', message: GENERIC_ERROR_MESSAGE };
  }
});
