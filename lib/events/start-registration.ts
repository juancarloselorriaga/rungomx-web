import { and, eq, gt, isNull, or, sql } from 'drizzle-orm';

import { db } from '@/db';
import { eventDistances, eventEditions, pricingTiers, registrations, users } from '@/db/schema';
import { normalizeEmail } from '@/lib/events/shared/identity';
import { getCurrentInviteForEmail } from '@/lib/events/invite-claim/queries';
import { computeExpiresAt } from '@/lib/events/registration-holds';
import { reserveHold, ReserveHoldError } from '@/lib/events/registrations/reserve-hold';

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
  | 'ALREADY_REGISTERED'
  | 'HAS_ACTIVE_INVITE';

export class StartRegistrationError extends Error {
  public readonly code: StartRegistrationErrorCode;

  constructor(code: StartRegistrationErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

type StartRegistrationDeps = {
  now?: Date;
  emailNormalized?: string | null;
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
  let emailNormalized = deps.emailNormalized ?? null;

  if (!emailNormalized) {
    const user = await db.query.users.findFirst({
      where: and(eq(users.id, userId), isNull(users.deletedAt)),
      columns: { email: true },
    });
    if (!user?.email) {
      throw new StartRegistrationError('NOT_FOUND', 'User not found');
    }
    emailNormalized = normalizeEmail(user.email);
  } else {
    emailNormalized = normalizeEmail(emailNormalized);
  }

  try {
    const registration = await db.transaction(async (tx) => {
      // Serialize across the whole edition to enforce "one registration per edition"
      // even when attempting different distances concurrently.
      await tx.execute(sql`SELECT id FROM ${eventEditions} WHERE id = ${edition.id} FOR UPDATE`);

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

      const activeInvite = await getCurrentInviteForEmail({
        editionId: edition.id,
        emailNormalized,
        now,
        tx,
      });

      if (activeInvite) {
        throw new StartRegistrationError(
          'HAS_ACTIVE_INVITE',
          'You already have a reserved spot via an invite',
        );
      }

      try {
        return await reserveHold({
          tx,
          editionId: edition.id,
          distanceId,
          capacityScope: distance.capacityScope as 'shared_pool' | 'per_distance',
          editionSharedCapacity: edition.sharedCapacity ?? null,
          distanceCapacity: distance.capacity ?? null,
          buyerUserId: userId,
          status: 'started',
          expiresAt: computeExpiresAt(now, 'started'),
          paymentResponsibility: 'self_pay',
          pricing: {
            basePriceCents: priceCents,
            feesCents,
            taxCents: 0,
            totalCents,
          },
          now,
        });
      } catch (error) {
        if (error instanceof ReserveHoldError) {
          throw new StartRegistrationError('SOLD_OUT', error.message);
        }
        throw error;
      }
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
