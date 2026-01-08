'use server';

import { auth } from '@/lib/auth';
import { withAuthenticatedUser } from '@/lib/auth/action-wrapper';
import { verifyUserCredentialPassword } from '@/lib/auth/credential-password';
import { deleteUser } from '@/lib/users/delete-user';
import { sendUserDeletionNotifications } from '@/lib/users/email';
import { extractLocaleFromRequest } from '@/lib/utils/locale';
import { headers } from 'next/headers';
import { z } from 'zod';

const deleteOwnAccountSchema = z.object({
  password: z.string().min(1),
});

export type DeleteOwnAccountResult =
  | { ok: true }
  | {
      ok: false;
      error: 'UNAUTHENTICATED' | 'NO_PASSWORD' | 'INVALID_PASSWORD' | 'SERVER_ERROR';
    };

export const deleteOwnAccount = withAuthenticatedUser<DeleteOwnAccountResult>({
  unauthenticated: () => ({ ok: false, error: 'UNAUTHENTICATED' }),
})(async ({ user }, input: unknown) => {
  const parsed = deleteOwnAccountSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, error: 'SERVER_ERROR' };
  }

  const { password } = parsed.data;

  const reqHeaders = await headers();

  try {
    const passwordCheck = await verifyUserCredentialPassword(user.id, password);
    if (!passwordCheck.ok) {
      return { ok: false, error: passwordCheck.error };
    }

    // Extract locale before signing out (while session is still valid)
    const locale = extractLocaleFromRequest({ headers: reqHeaders as unknown as Headers });

    // Sign out FIRST while session is still valid - this properly clears cookies
    try {
      await auth.api.signOut({ headers: reqHeaders });
    } catch (error) {
      console.warn('[account-delete] Sign out failed', error);
      // Continue with deletion anyway - we have the user ID
    }

    // Now delete the account (user ID was captured from auth context above)
    const result = await deleteUser({ targetUserId: user.id, deletedByUserId: user.id });
    if (!result.ok && result.error !== 'NOT_FOUND') {
      return { ok: false, error: 'SERVER_ERROR' };
    }

    if (result.ok) {
      sendUserDeletionNotifications({
        deletedUser: result.deletedUser,
        deletedBy: { id: user.id, name: user.name ?? '' },
        isSelfDeletion: true,
        locale,
      }).catch((error) => {
        console.error('[account-delete] Notification failed:', error);
      });
    }

    return { ok: true };
  } catch (error) {
    console.error('[account-delete] Failed to delete own account', error);
    return { ok: false, error: 'SERVER_ERROR' };
  }
});
