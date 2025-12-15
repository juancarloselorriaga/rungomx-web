'use server';

import { db } from '@/db';
import { accounts, sessions, users } from '@/db/schema';
import { withAdminUser } from '@/lib/auth/action-wrapper';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';

const deleteInternalUserSchema = z.object({
  userId: z.string().min(1),
});

export type DeleteInternalUserResult =
  | { ok: true }
  | {
      ok: false;
      error: 'UNAUTHENTICATED' | 'FORBIDDEN' | 'NOT_FOUND' | 'CANNOT_DELETE_SELF' | 'SERVER_ERROR';
    };

export const deleteInternalUser = withAdminUser<DeleteInternalUserResult>({
  unauthenticated: () => ({ ok: false, error: 'UNAUTHENTICATED' }),
  forbidden: () => ({ ok: false, error: 'FORBIDDEN' }),
})(async ({ user }, input: unknown) => {
  const parsed = deleteInternalUserSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, error: 'SERVER_ERROR' };
  }

  const { userId } = parsed.data;

  if (userId === user.id) {
    return { ok: false, error: 'CANNOT_DELETE_SELF' };
  }

  try {
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, userId), isNull(users.deletedAt)));

    const target = existing[0];

    if (!target || existing[0] === undefined) {
      return { ok: false, error: 'NOT_FOUND' };
    }

    const deletedAt = new Date();

    await db.transaction(async (tx) => {
      await tx.update(users).set({ deletedAt }).where(eq(users.id, userId));

      await tx.update(accounts).set({ deletedAt }).where(eq(accounts.userId, userId));

      await tx.update(sessions).set({ deletedAt }).where(eq(sessions.userId, userId));
    });

    return { ok: true };
  } catch (error) {
    console.error('[admin-users-delete] Failed to delete internal user', error);
    return { ok: false, error: 'SERVER_ERROR' };
  }
});
