import { and, eq, gt, isNull, or, sql } from 'drizzle-orm';

import { db } from '@/db';
import { eventDistances, eventEditions, registrants, registrations } from '@/db/schema';
import type { PaymentResponsibility } from '@/lib/events/constants';

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type DbClient = typeof db | DbTransaction;

export type RegistrantSnapshot = {
  firstName?: string;
  lastName?: string;
  email?: string;
  dateOfBirth?: string;
  gender?: string;
  phone?: string;
  city?: string;
  state?: string;
  country?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
};

export type ReserveHoldParams = {
  tx: DbClient;
  editionId: string;
  distanceId: string;
  capacityScope: 'shared_pool' | 'per_distance';
  editionSharedCapacity: number | null;
  distanceCapacity: number | null;
  buyerUserId: string | null;
  status: 'started' | 'submitted' | 'payment_pending' | 'confirmed';
  expiresAt: Date | null;
  paymentResponsibility: PaymentResponsibility;
  pricing: {
    basePriceCents: number | null;
    feesCents: number | null;
    taxCents: number | null;
    totalCents: number | null;
  };
  registrationGroupId?: string | null;
  groupDiscountPercentOff?: number | null;
  groupDiscountAmountCents?: number | null;
  registrantSnapshot?: RegistrantSnapshot | null;
  registrantUserId?: string | null;
  now?: Date;
};

export class ReserveHoldError extends Error {
  public readonly code: 'SOLD_OUT';

  constructor(code: 'SOLD_OUT', message: string) {
    super(message);
    this.code = code;
  }
}

export async function reserveHold({
  tx,
  editionId,
  distanceId,
  capacityScope,
  editionSharedCapacity,
  distanceCapacity,
  buyerUserId,
  status,
  expiresAt,
  paymentResponsibility,
  pricing,
  registrationGroupId,
  groupDiscountPercentOff,
  groupDiscountAmountCents,
  registrantSnapshot,
  registrantUserId,
  now = new Date(),
}: ReserveHoldParams) {
  if (capacityScope === 'shared_pool' && editionSharedCapacity !== null) {
    await tx.execute(sql`SELECT id FROM ${eventEditions} WHERE id = ${editionId} FOR UPDATE`);

    const reservedCount = await tx.query.registrations.findMany({
      where: and(
        eq(registrations.editionId, editionId),
        or(
          eq(registrations.status, 'confirmed'),
          and(
            or(
              eq(registrations.status, 'started'),
              eq(registrations.status, 'submitted'),
              eq(registrations.status, 'payment_pending'),
            ),
            gt(registrations.expiresAt, now),
          ),
        ),
        isNull(registrations.deletedAt),
      ),
    });

    if (reservedCount.length >= editionSharedCapacity) {
      throw new ReserveHoldError('SOLD_OUT', 'Distance is sold out');
    }
  } else if (distanceCapacity !== null) {
    await tx.execute(sql`SELECT id FROM ${eventDistances} WHERE id = ${distanceId} FOR UPDATE`);

    const reservedCount = await tx.query.registrations.findMany({
      where: and(
        eq(registrations.distanceId, distanceId),
        or(
          eq(registrations.status, 'confirmed'),
          and(
            or(
              eq(registrations.status, 'started'),
              eq(registrations.status, 'submitted'),
              eq(registrations.status, 'payment_pending'),
            ),
            gt(registrations.expiresAt, now),
          ),
        ),
        isNull(registrations.deletedAt),
      ),
    });

    if (reservedCount.length >= distanceCapacity) {
      throw new ReserveHoldError('SOLD_OUT', 'Distance is sold out');
    }
  }

  const [createdRegistration] = await tx
    .insert(registrations)
    .values({
      editionId,
      distanceId,
      buyerUserId,
      status,
      basePriceCents: pricing.basePriceCents,
      feesCents: pricing.feesCents,
      taxCents: pricing.taxCents,
      totalCents: pricing.totalCents,
      registrationGroupId: registrationGroupId ?? null,
      groupDiscountPercentOff: groupDiscountPercentOff ?? null,
      groupDiscountAmountCents: groupDiscountAmountCents ?? null,
      expiresAt,
      paymentResponsibility,
    })
    .returning();

  if (registrantSnapshot) {
    await tx.insert(registrants).values({
      registrationId: createdRegistration.id,
      userId: registrantUserId ?? null,
      profileSnapshot: registrantSnapshot,
    });
  }

  return createdRegistration;
}
