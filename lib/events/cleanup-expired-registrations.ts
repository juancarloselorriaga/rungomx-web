import { and, inArray, isNotNull, isNull, lte } from 'drizzle-orm';

import { db } from '@/db';
import { registrationInvites, registrations } from '@/db/schema';

export async function cleanupExpiredRegistrations(): Promise<number> {
  const now = new Date();
  const expiredRegistrations = await db
    .select({ id: registrations.id })
    .from(registrations)
    .where(
      and(
        isNull(registrations.deletedAt),
        inArray(registrations.status, ['started', 'submitted', 'payment_pending']),
        isNotNull(registrations.expiresAt),
        lte(registrations.expiresAt, now),
      ),
    );

  if (expiredRegistrations.length === 0) {
    return 0;
  }

  const expiredIds = expiredRegistrations.map((row) => row.id);

  await db.transaction(async (tx) => {
    await tx
      .update(registrations)
      .set({
        status: 'cancelled',
        expiresAt: null,
      })
      .where(inArray(registrations.id, expiredIds));

    await tx
      .update(registrationInvites)
      // Marking isCurrent=false keeps "current" scoped to actionable invites and avoids
      // active-invite guards blocking new reservations for expired holds.
      .set({ status: 'expired', isCurrent: false })
      .where(
        and(
          inArray(registrationInvites.registrationId, expiredIds),
          inArray(registrationInvites.status, ['draft', 'sent']),
          isNotNull(registrationInvites.expiresAt),
        ),
      );
  });

  return expiredIds.length;
}
