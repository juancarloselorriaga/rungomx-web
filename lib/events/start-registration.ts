import { and, eq, gt, isNull, or, sql } from 'drizzle-orm';

import { db } from '@/db';
import { eventDistances, eventEditions, pricingTiers, registrations } from '@/db/schema';
import { computeExpiresAt } from '@/lib/events/registration-holds';

export type StartRegistrationResult = {
  id: string;
  status: string;
  distanceId: string;
  editionId: string;
  basePriceCents: number;
  feesCents: number;
  taxCents: number;
  totalCents: number | null;
};

export type StartRegistrationErrorCode =
  | 'NOT_FOUND'
  | 'NOT_PUBLISHED'
  | 'REGISTRATION_PAUSED'
  | 'REGISTRATION_NOT_OPEN'
  | 'REGISTRATION_CLOSED'
  | 'SOLD_OUT'
  | 'ALREADY_REGISTERED';

export class StartRegistrationError extends Error {
  public readonly code: StartRegistrationErrorCode;

  constructor(code: StartRegistrationErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

type StartRegistrationDeps = {
  now?: Date;
};

/**
 * Core registration start logic (testable without importing server actions).
 */
export async function startRegistrationForUser(
  userId: string,
  distanceId: string,
  deps: StartRegistrationDeps = {},
): Promise<StartRegistrationResult> {
  const now = deps.now ?? new Date();

  const distance = await db.query.eventDistances.findFirst({
    where: and(eq(eventDistances.id, distanceId), isNull(eventDistances.deletedAt)),
    with: {
      edition: { with: { series: true } },
      pricingTiers: { where: isNull(pricingTiers.deletedAt) },
    },
  });

  if (!distance?.edition?.series) {
    throw new StartRegistrationError('NOT_FOUND', 'Distance not found');
  }

  const edition = distance.edition;

  if (edition.visibility !== 'published') {
    throw new StartRegistrationError('NOT_PUBLISHED', 'Event is not published');
  }

  if (edition.isRegistrationPaused) {
    throw new StartRegistrationError('REGISTRATION_PAUSED', 'Registration is paused');
  }

  if (edition.registrationOpensAt && now < edition.registrationOpensAt) {
    throw new StartRegistrationError('REGISTRATION_NOT_OPEN', 'Registration has not opened yet');
  }

  if (edition.registrationClosesAt && now > edition.registrationClosesAt) {
    throw new StartRegistrationError('REGISTRATION_CLOSED', 'Registration has closed');
  }

  const activeTier = distance.pricingTiers
    .filter(t => {
      if (t.startsAt && now < t.startsAt) return false;
      if (t.endsAt && now > t.endsAt) return false;
      return true;
    })
    .sort((a, b) => a.sortOrder - b.sortOrder)[0];

  const priceCents = activeTier?.priceCents ?? 0;
  const feesCents = Math.round(priceCents * 0.05);
  const totalCents = priceCents + feesCents;

  try {
    const registration = await db.transaction(async (tx) => {
      // Serialize across the whole edition to enforce "one registration per edition"
      // even when attempting different distances concurrently.
      await tx.execute(sql`SELECT id FROM ${eventEditions} WHERE id = ${edition.id} FOR UPDATE`);

      // Lock the distance row to serialize capacity checks per distance.
      await tx.execute(sql`SELECT id FROM ${eventDistances} WHERE id = ${distanceId} FOR UPDATE`);

      const existingRegistrationInEdition = await tx.query.registrations.findFirst({
        where: and(
          eq(registrations.buyerUserId, userId),
          eq(registrations.editionId, edition.id),
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

      if (existingRegistrationInEdition) {
        if (
          existingRegistrationInEdition.distanceId === distanceId &&
          (existingRegistrationInEdition.status === 'started' ||
            existingRegistrationInEdition.status === 'submitted')
        ) {
          return existingRegistrationInEdition;
        }

        throw new StartRegistrationError(
          'ALREADY_REGISTERED',
          'You are already registered for this event',
        );
      }

      // Capacity checks (shared pool or per distance)
      if (distance.capacityScope === 'shared_pool' && distance.edition.sharedCapacity) {
        const reservedCount = await tx.query.registrations.findMany({
          where: and(
            eq(registrations.editionId, edition.id),
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

        if (reservedCount.length >= distance.edition.sharedCapacity) {
          throw new StartRegistrationError('SOLD_OUT', 'Distance is sold out');
        }
      } else if (distance.capacity) {
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

        if (reservedCount.length >= distance.capacity) {
          throw new StartRegistrationError('SOLD_OUT', 'Distance is sold out');
        }
      }

      const [newReg] = await tx
        .insert(registrations)
        .values({
          editionId: edition.id,
          distanceId,
          buyerUserId: userId,
          status: 'started',
          basePriceCents: priceCents,
          feesCents,
          taxCents: 0,
          totalCents,
          expiresAt: computeExpiresAt(now, 'started'),
        })
        .returning();

      return newReg;
    });

    return {
      id: registration.id,
      status: registration.status,
      distanceId: registration.distanceId,
      editionId: registration.editionId,
      basePriceCents: registration.basePriceCents ?? priceCents,
      feesCents: registration.feesCents ?? feesCents,
      taxCents: registration.taxCents ?? 0,
      totalCents: registration.totalCents,
    };
  } catch (error) {
    if (error instanceof StartRegistrationError) {
      throw error;
    }

    throw error;
  }
}
