'use server';

import { db } from '@/db';
import {
  accounts,
  contactSubmissions,
  profiles,
  sessions,
  userRoles,
  users,
  verifications,
} from '@/db/schema';
import { and, eq, isNull } from 'drizzle-orm';

export type DeleteUserIntent = {
  targetUserId: string;
  deletedByUserId: string;
};

export type DeletedUserInfo = {
  email: string;
  name: string;
  locale: string | null;
};

export type DeleteUserResult =
  | { ok: true; deletedUser: DeletedUserInfo }
  | { ok: false; error: 'NOT_FOUND' | 'SERVER_ERROR' };

class UserNotFoundError extends Error {
  constructor() {
    super('NOT_FOUND');
  }
}

function buildDeletedEmail(userId: string): string {
  return `deleted+${userId}@example.invalid`;
}

/**
 * Performs an immediate "GDPR-style" deletion:
 * - Revokes access by deleting sessions and accounts.
 * - Soft-deletes the user row (deletedAt) and anonymizes PII fields.
 * - Keeps the profile row for consistency but wipes profile PII.
 * - Anonymizes related records (e.g. contact submissions).
 *
 * This function does not do hard purging of the user row; it preserves referential integrity
 * for future features like registrations/payments while minimizing retained personal data.
 */
export async function deleteUser(intent: DeleteUserIntent): Promise<DeleteUserResult> {
  const deletedAt = new Date();

  try {
    const deletedUser = await db.transaction(async (tx) => {
      const existing = await tx
        .select({ email: users.email, name: users.name })
        .from(users)
        .where(and(eq(users.id, intent.targetUserId), isNull(users.deletedAt)));

      const target = existing[0];
      if (!target) {
        throw new UserNotFoundError();
      }

      // Fetch profile locale before wiping (for notification emails)
      const [profile] = await tx
        .select({ locale: profiles.locale })
        .from(profiles)
        .where(eq(profiles.userId, intent.targetUserId));

      const deletedUserInfo: DeletedUserInfo = {
        email: target.email,
        name: target.name ?? '',
        locale: profile?.locale ?? null,
      };
      const previousEmail = target.email;

      await tx.delete(sessions).where(eq(sessions.userId, intent.targetUserId));
      await tx.delete(accounts).where(eq(accounts.userId, intent.targetUserId));

      await tx.update(userRoles).set({ deletedAt }).where(eq(userRoles.userId, intent.targetUserId));

      await tx
        .update(profiles)
        .set({
          deletedAt,
          bio: null,
          dateOfBirth: null,
          gender: null,
          genderDescription: null,
          phone: null,
          city: null,
          state: null,
          postalCode: null,
          country: 'MX',
          latitude: null,
          longitude: null,
          locationDisplay: null,
          emergencyContactName: null,
          emergencyContactPhone: null,
          medicalConditions: null,
          bloodType: null,
          shirtSize: null,
          weightKg: null,
          heightCm: null,
        })
        .where(eq(profiles.userId, intent.targetUserId));

      await tx
        .update(contactSubmissions)
        .set({
          userId: null,
          name: null,
          email: null,
          message: '[redacted]',
          metadata: {},
        })
        .where(eq(contactSubmissions.userId, intent.targetUserId));

      await tx.delete(verifications).where(eq(verifications.identifier, previousEmail));

      await tx
        .update(users)
        .set({
          deletedAt,
          updatedAt: deletedAt,
          deletedByUserId: intent.deletedByUserId,
          email: buildDeletedEmail(intent.targetUserId),
          name: 'Deleted user',
          image: null,
          emailVerified: false,
        })
        .where(and(eq(users.id, intent.targetUserId), isNull(users.deletedAt)));

      return deletedUserInfo;
    });

    return { ok: true, deletedUser };
  } catch (error) {
    if (error instanceof UserNotFoundError) {
      return { ok: false, error: 'NOT_FOUND' };
    }

    console.error('[delete-user] Failed to delete user', error);
    return { ok: false, error: 'SERVER_ERROR' };
  }
}
