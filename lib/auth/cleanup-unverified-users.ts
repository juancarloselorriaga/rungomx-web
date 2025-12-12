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
import { and, eq, inArray, lt } from 'drizzle-orm';

export type CleanupUnverifiedUsersResult = {
  cutoff: Date;
  candidates: number;
  deleted: number;
};

export async function cleanupExpiredUnverifiedUsers(cutoff: Date): Promise<CleanupUnverifiedUsersResult> {
  const candidates = await db
    .select({
      id: users.id,
      email: users.email,
    })
    .from(users)
    .where(and(eq(users.emailVerified, false), lt(users.createdAt, cutoff)));

  if (candidates.length === 0) {
    return {
      cutoff,
      candidates: 0,
      deleted: 0,
    };
  }

  const userIds = candidates.map((user) => user.id);
  const emails = candidates.map((user) => user.email);

  const deleted = await db.transaction(async (tx) => {
    await tx
      .update(contactSubmissions)
      .set({ userId: null })
      .where(inArray(contactSubmissions.userId, userIds));

    await tx.delete(sessions).where(inArray(sessions.userId, userIds));
    await tx.delete(accounts).where(inArray(accounts.userId, userIds));
    await tx.delete(userRoles).where(inArray(userRoles.userId, userIds));
    await tx.delete(profiles).where(inArray(profiles.userId, userIds));
    await tx.delete(verifications).where(inArray(verifications.identifier, emails));

    const result = await tx.delete(users).where(inArray(users.id, userIds));
    return result.rowCount ?? userIds.length;
  });

  return {
    cutoff,
    candidates: candidates.length,
    deleted,
  };
}

