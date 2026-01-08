'use server';

import { routing } from '@/i18n/routing';
import { withAdminUser } from '@/lib/auth/action-wrapper';
import { verifyUserCredentialPassword } from '@/lib/auth/credential-password';
import { deleteUser } from '@/lib/users/delete-user';
import { sendUserDeletionNotifications } from '@/lib/users/email';
import { z } from 'zod';

const deleteInternalUserSchema = z.object({
  userId: z.string().min(1),
  adminPassword: z.string().min(1),
});

export type DeleteInternalUserResult =
  | { ok: true }
  | {
      ok: false;
      error:
        | 'UNAUTHENTICATED'
        | 'FORBIDDEN'
        | 'INVALID_PASSWORD'
        | 'NO_PASSWORD'
        | 'NOT_FOUND'
        | 'CANNOT_DELETE_SELF'
        | 'SERVER_ERROR';
    };

export const deleteInternalUser = withAdminUser<DeleteInternalUserResult>({
  unauthenticated: () => ({ ok: false, error: 'UNAUTHENTICATED' }),
  forbidden: () => ({ ok: false, error: 'FORBIDDEN' }),
})(async ({ user }, input: unknown) => {
  const parsed = deleteInternalUserSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, error: 'SERVER_ERROR' };
  }

  const { userId, adminPassword } = parsed.data;

  if (userId === user.id) {
    return { ok: false, error: 'CANNOT_DELETE_SELF' };
  }

  try {
    const passwordCheck = await verifyUserCredentialPassword(user.id, adminPassword);
    if (!passwordCheck.ok) {
      return { ok: false, error: passwordCheck.error };
    }

    const result = await deleteUser({ targetUserId: userId, deletedByUserId: user.id });
    if (!result.ok) {
      return { ok: false, error: result.error };
    }

    sendUserDeletionNotifications({
      deletedUser: result.deletedUser,
      deletedBy: { id: user.id, name: user.name ?? '' },
      isSelfDeletion: false,
      locale: routing.defaultLocale,
    }).catch((error) => {
      console.error('[admin-users-delete] Notification failed:', error);
    });

    return { ok: true };
  } catch (error) {
    console.error('[admin-users-delete] Failed to delete internal user', error);
    return { ok: false, error: 'SERVER_ERROR' };
  }
});
