import { and, inArray, isNotNull, isNull, lte } from 'drizzle-orm';

import { db } from '@/db';
import { registrations } from '@/db/schema';

export async function cleanupExpiredRegistrations(): Promise<number> {
  const now = new Date();

  const result = await db
    .update(registrations)
    .set({
      status: 'cancelled',
      expiresAt: null,
    })
    .where(
      and(
        isNull(registrations.deletedAt),
        inArray(registrations.status, ['started', 'submitted', 'payment_pending']),
        isNotNull(registrations.expiresAt),
        lte(registrations.expiresAt, now),
      ),
    );

  return result.rowCount ?? 0;
}
