'use server';

import { and, eq, gt, isNull, or, sql } from 'drizzle-orm';
import { revalidateTag } from 'next/cache';
import { headers } from 'next/headers';
import { z } from 'zod';

import { db } from '@/db';
import {
  eventDistances,
  eventEditions,
  registrants,
  registrationAnswers,
  registrations,
  waiverAcceptances,
  waivers,
} from '@/db/schema';
import { withAuthenticatedUser } from '@/lib/auth/action-wrapper';
import { isEventsNoPaymentMode } from '@/lib/features/flags';
import type { AppLocale } from '@/i18n/routing';
import {
  eventEditionDetailTag,
  eventEditionRegistrationsTag,
} from '@/lib/events/cache-tags';
import { SIGNATURE_TYPES } from '@/lib/events/constants';
import { sendRegistrationCompletionEmail } from '@/lib/events/registration-email';
import { computeExpiresAt, isExpiredHold } from '@/lib/events/registration-holds';
import { RegistrationOwnershipError, getRegistrationForOwnerOrThrow } from '@/lib/events/registrations/ownership';
import { findMissingRequiredQuestion, getApplicableRegistrationQuestions } from '@/lib/events/questions/required';
import {
  StartRegistrationError,
  startRegistrationForUser,
} from '@/lib/events/start-registration';
import { type ActionResult, revalidatePublicEventByEditionId } from '@/lib/events/shared';

// =============================================================================
// Schemas
// =============================================================================

const startRegistrationSchema = z.object({
  distanceId: z.string().uuid(),
});

const submitRegistrantInfoSchema = z.object({
  registrationId: z.string().uuid(),
  profileSnapshot: z.object({
    firstName: z.string().min(1).max(100),
    lastName: z.string().min(1).max(100),
    email: z.string().email(),
    dateOfBirth: z.string(), // ISO date string
    gender: z.string().optional(),
    genderDescription: z.string().max(100).optional(),
    phone: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    country: z.string().optional(),
    emergencyContactName: z.string().optional(),
    emergencyContactPhone: z.string().optional(),
  }),
  division: z.string().optional(),
  genderIdentity: z.string().optional(),
});

const acceptWaiverSchema = z
  .object({
    registrationId: z.string().uuid(),
    waiverId: z.string().uuid(),
    signatureType: z.enum(SIGNATURE_TYPES),
    signatureValue: z.string().optional(),
  })
  .refine(
    data => {
      // If signatureType is 'initials' or 'signature', signatureValue must be provided
      if (data.signatureType === 'initials' || data.signatureType === 'signature') {
        return data.signatureValue && data.signatureValue.trim().length > 0;
      }
      return true;
    },
    {
      message: 'Signature value is required for initials and signature types',
      path: ['signatureValue'],
    },
  );

const finalizeRegistrationSchema = z.object({
  registrationId: z.string().uuid(),
});

// =============================================================================
// Types
// =============================================================================

type RegistrationData = {
  id: string;
  status: string;
  distanceId: string;
  editionId: string;
  basePriceCents: number | null;
  feesCents: number | null;
  taxCents: number | null;
  totalCents: number | null;
};

// =============================================================================
// Actions
// =============================================================================

/**
 * Start a new registration.
 */
export const startRegistration = withAuthenticatedUser<ActionResult<RegistrationData>>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof startRegistrationSchema>) => {
  const validated = startRegistrationSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const { distanceId } = validated.data;
  try {
    const registration = await startRegistrationForUser(authContext.user.id, distanceId, {
      emailNormalized: authContext.user.email ?? null,
    });

    revalidateTag(eventEditionDetailTag(registration.editionId), { expire: 0 });
    revalidateTag(eventEditionRegistrationsTag(registration.editionId), { expire: 0 });
    await revalidatePublicEventByEditionId(registration.editionId);

    return {
      ok: true,
      data: {
        id: registration.id,
        status: registration.status,
        distanceId: registration.distanceId,
        editionId: registration.editionId,
        basePriceCents: registration.basePriceCents,
        feesCents: registration.feesCents,
        taxCents: registration.taxCents,
        totalCents: registration.totalCents,
      },
    };
  } catch (error) {
    if (error instanceof StartRegistrationError) {
      return { ok: false, error: error.message, code: error.code };
    }

    throw error;
  }
});

/**
 * Submit registrant info.
 */
export const submitRegistrantInfo = withAuthenticatedUser<ActionResult<RegistrationData>>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof submitRegistrantInfoSchema>) => {
  const validated = submitRegistrantInfoSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const { registrationId, profileSnapshot, division, genderIdentity } = validated.data;

  let registration;
  try {
    registration = await getRegistrationForOwnerOrThrow({
      registrationId,
      userId: authContext.user.id,
    });
  } catch (error) {
    if (error instanceof RegistrationOwnershipError) {
      return {
        ok: false,
        error: error.code === 'NOT_FOUND' ? 'Registration not found' : 'Permission denied',
        code: error.code,
      };
    }
    throw error;
  }

  const now = new Date();
  if (isExpiredHold(registration.status, registration.expiresAt, now)) {
    return {
      ok: false,
      error: 'Registration expired. Please start again.',
      code: 'REGISTRATION_EXPIRED',
    };
  }

  if (registration.status !== 'started') {
    return { ok: false, error: 'Registration has already been submitted', code: 'ALREADY_SUBMITTED' };
  }

  try {
    const updatedRegistration = await db.transaction(async (tx) => {
      // Create or update registrant
      const existingRegistrant = await tx.query.registrants.findFirst({
        where: eq(registrants.registrationId, registrationId),
      });

      if (existingRegistrant) {
        await tx
          .update(registrants)
          .set({
            profileSnapshot,
            division,
            genderIdentity,
            userId: authContext.user.id,
          })
          .where(eq(registrants.id, existingRegistrant.id));
      } else {
        await tx.insert(registrants).values({
          registrationId,
          userId: authContext.user.id,
          profileSnapshot,
          division,
          genderIdentity,
        });
      }

      const [updated] = await tx
        .update(registrations)
        .set({
          status: 'submitted',
          expiresAt: computeExpiresAt(now, 'submitted'),
        })
        .where(
          and(
            eq(registrations.id, registrationId),
            eq(registrations.status, 'started'),
          ),
        )
        .returning();

      if (!updated) {
        throw new Error('INVALID_STATE_TRANSITION');
      }

      return updated;
    });

    revalidateTag(eventEditionDetailTag(updatedRegistration.editionId), { expire: 0 });
    revalidateTag(eventEditionRegistrationsTag(updatedRegistration.editionId), { expire: 0 });
    await revalidatePublicEventByEditionId(updatedRegistration.editionId);

    return {
      ok: true,
      data: {
        id: updatedRegistration.id,
        status: updatedRegistration.status,
        distanceId: updatedRegistration.distanceId,
        editionId: updatedRegistration.editionId,
        basePriceCents: updatedRegistration.basePriceCents,
        feesCents: updatedRegistration.feesCents,
        taxCents: updatedRegistration.taxCents,
        totalCents: updatedRegistration.totalCents,
      },
    };
  } catch (error) {
    if (error instanceof Error && error.message === 'INVALID_STATE_TRANSITION') {
      return { ok: false, error: 'Registration cannot be submitted from current state', code: 'INVALID_STATE' };
    }
    throw error;
  }
});

/**
 * Accept a waiver.
 */
export const acceptWaiver = withAuthenticatedUser<ActionResult>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof acceptWaiverSchema>) => {
  const validated = acceptWaiverSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const { registrationId, waiverId, signatureType, signatureValue } = validated.data;

  let registration;
  try {
    registration = await getRegistrationForOwnerOrThrow({
      registrationId,
      userId: authContext.user.id,
    });
  } catch (error) {
    if (error instanceof RegistrationOwnershipError) {
      return {
        ok: false,
        error: error.code === 'NOT_FOUND' ? 'Registration not found' : 'Permission denied',
        code: error.code,
      };
    }
    throw error;
  }

  const now = new Date();
  if (isExpiredHold(registration.status, registration.expiresAt, now)) {
    return {
      ok: false,
      error: 'Registration expired. Please start again.',
      code: 'REGISTRATION_EXPIRED',
    };
  }

  const waiver = await db.query.waivers.findFirst({
    where: and(
      eq(waivers.id, waiverId),
      eq(waivers.editionId, registration.editionId),
      isNull(waivers.deletedAt),
    ),
  });

  if (!waiver) {
    return { ok: false, error: 'Waiver not found', code: 'NOT_FOUND' };
  }

  if (waiver.signatureType !== signatureType) {
    return { ok: false, error: 'Signature type mismatch', code: 'VALIDATION_ERROR' };
  }

  const normalizedSignatureValue =
    signatureType === 'checkbox' ? null : signatureValue?.trim() || null;

  const existingAcceptance = await db.query.waiverAcceptances.findFirst({
    where: and(
      eq(waiverAcceptances.registrationId, registrationId),
      eq(waiverAcceptances.waiverId, waiverId),
    ),
  });

  if (existingAcceptance) {
    return { ok: true, data: undefined };
  }

  const headersList = await headers();
  const ipAddress = headersList.get('x-forwarded-for')?.split(',')[0] || headersList.get('x-real-ip') || null;
  const userAgent = headersList.get('user-agent');

  await db.insert(waiverAcceptances).values({
    registrationId,
    waiverId,
    waiverVersionHash: waiver.versionHash,
    acceptedAt: new Date(),
    ipAddress,
    userAgent,
    signatureType,
    signatureValue: normalizedSignatureValue,
  });

  revalidateTag(eventEditionRegistrationsTag(registration.editionId), { expire: 0 });

  return { ok: true, data: undefined };
});

/**
 * Finalize registration (moves to payment_pending or confirmed in no-payment mode).
 */
export const finalizeRegistration = withAuthenticatedUser<ActionResult<RegistrationData>>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof finalizeRegistrationSchema>) => {
  const validated = finalizeRegistrationSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const { registrationId } = validated.data;

  let registration;
  try {
    registration = await getRegistrationForOwnerOrThrow({
      registrationId,
      userId: authContext.user.id,
    });
  } catch (error) {
    if (error instanceof RegistrationOwnershipError) {
      return {
        ok: false,
        error: error.code === 'NOT_FOUND' ? 'Registration not found' : 'Permission denied',
        code: error.code,
      };
    }
    throw error;
  }

  const now = new Date();
  if (isExpiredHold(registration.status, registration.expiresAt, now)) {
    return {
      ok: false,
      error: 'Registration expired. Please start again.',
      code: 'REGISTRATION_EXPIRED',
    };
  }

  if (registration.status === 'confirmed') {
    return {
      ok: true,
      data: {
        id: registration.id,
        status: registration.status,
        distanceId: registration.distanceId,
        editionId: registration.editionId,
        basePriceCents: registration.basePriceCents,
        feesCents: registration.feesCents,
        taxCents: registration.taxCents,
        totalCents: registration.totalCents,
      },
    };
  }

  const [registrationRegistrants, registrationWaivers, editionWaivers, registrationAnswersList] = await Promise.all([
    db.query.registrants.findMany({
      where: eq(registrants.registrationId, registrationId),
    }),
    db.query.waiverAcceptances.findMany({
      where: eq(waiverAcceptances.registrationId, registrationId),
    }),
    db.query.waivers.findMany({
      where: and(
        eq(waivers.editionId, registration.editionId),
        isNull(waivers.deletedAt),
      ),
    }),
    db.query.registrationAnswers.findMany({
      where: eq(registrationAnswers.registrationId, registrationId),
    }),
  ]);

  const distance = await db.query.eventDistances.findFirst({
    where: eq(eventDistances.id, registration.distanceId),
  });

  if (!distance) {
    return { ok: false, error: 'Distance not found', code: 'NOT_FOUND' };
  }

  // Validate registrant info exists
  if (!registrationRegistrants.length) {
    return { ok: false, error: 'Registrant info is required', code: 'MISSING_REGISTRANT' };
  }

  // Validate all waivers accepted
  const requiredWaivers = editionWaivers.map(w => w.id);
  const acceptedWaivers = registrationWaivers.map(a => a.waiverId);
  const missingWaivers = requiredWaivers.filter(w => !acceptedWaivers.includes(w));

  if (missingWaivers.length > 0) {
    return { ok: false, error: 'All waivers must be accepted', code: 'MISSING_WAIVER' };
  }

  const applicableQuestions = await getApplicableRegistrationQuestions({
    editionId: registration.editionId,
    distanceId: registration.distanceId,
  });

  const answerMap = new Map(
    registrationAnswersList.map((answer) => [answer.questionId, answer.value]),
  );
  const missingQuestion = findMissingRequiredQuestion(applicableQuestions, answerMap);

  if (missingQuestion) {
    return {
      ok: false,
      error: `Please answer the required question: ${missingQuestion.prompt}`,
      code: 'MISSING_REQUIRED_ANSWER',
    };
  }

  // Re-validate event state and capacity before confirming
  try {
    const updated = await db.transaction(async (tx) => {
      const now = new Date();

      // Re-fetch current edition and distance state inside transaction for freshness
      const currentEdition = await tx.query.eventEditions.findFirst({
        where: eq(eventEditions.id, registration.editionId),
      });

      const currentDistance = await tx.query.eventDistances.findFirst({
        where: eq(eventDistances.id, registration.distanceId),
      });

      if (!currentEdition || !currentDistance) {
        throw new Error('EVENT_NOT_FOUND');
      }

      // Re-check event visibility and registration availability using fresh data
      if (currentEdition.visibility !== 'published') {
        throw new Error('EVENT_NOT_PUBLISHED');
      }

      if (currentEdition.isRegistrationPaused) {
        throw new Error('REGISTRATION_PAUSED');
      }

      if (currentEdition.registrationOpensAt && now < currentEdition.registrationOpensAt) {
        throw new Error('REGISTRATION_NOT_OPEN');
      }

      if (currentEdition.registrationClosesAt && now > currentEdition.registrationClosesAt) {
        throw new Error('REGISTRATION_CLOSED');
      }

      // Lock rows and re-check capacity transactionally
      if (currentDistance.capacityScope === 'shared_pool' && currentEdition.sharedCapacity) {
        await tx.execute(sql`SELECT id FROM ${eventEditions} WHERE id = ${registration.editionId} FOR UPDATE`);

        const reservedCount = await tx.query.registrations.findMany({
          where: and(
            eq(registrations.editionId, registration.editionId),
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
            // Exclude the current registration from count
            sql`${registrations.id} != ${registrationId}`,
          ),
        });
        if (reservedCount.length >= currentEdition.sharedCapacity) {
          throw new Error('SOLD_OUT');
        }
      } else if (currentDistance.capacity) {
        // SELECT FOR UPDATE to serialize capacity checks per distance
        await tx.execute(sql`SELECT id FROM ${eventDistances} WHERE id = ${registration.distanceId} FOR UPDATE`);

        // Count with consistent reserved statuses (matching startRegistration)
        const reservedCount = await tx.query.registrations.findMany({
          where: and(
            eq(registrations.distanceId, registration.distanceId),
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
            // Exclude the current registration from count
            sql`${registrations.id} != ${registrationId}`,
          ),
        });
        if (reservedCount.length >= currentDistance.capacity) {
          throw new Error('SOLD_OUT');
        }
      }

      const nextStatus =
        isEventsNoPaymentMode() || registration.paymentResponsibility === 'central_pay'
          ? 'confirmed'
          : 'payment_pending';
      const nextExpiresAt =
        nextStatus === 'confirmed' ? null : computeExpiresAt(now, 'payment_pending');

      // Move registration forward with guarded transition
      const [updatedReg] = await tx
        .update(registrations)
        .set({ status: nextStatus, expiresAt: nextExpiresAt })
        .where(
          and(
            eq(registrations.id, registrationId),
            // Only confirm if in expected prior state
            or(eq(registrations.status, 'started'), eq(registrations.status, 'submitted')),
          ),
        )
        .returning();

      if (!updatedReg) {
        throw new Error('INVALID_STATE_TRANSITION');
      }

      return updatedReg;
    });

    revalidateTag(eventEditionDetailTag(updated.editionId), { expire: 0 });
    revalidateTag(eventEditionRegistrationsTag(updated.editionId), { expire: 0 });
    await revalidatePublicEventByEditionId(updated.editionId);

    try {
      if (updated.status === 'confirmed' || updated.status === 'payment_pending') {
        await sendRegistrationCompletionEmail({
          registrationId: updated.id,
          userId: authContext.user!.id,
          status: updated.status,
          userEmail: authContext.user!.email,
          userName: authContext.user!.name,
          locale: authContext.profile?.locale as AppLocale | undefined,
        });
      }
    } catch (error) {
      console.error('[registration-email] Failed to send registration email:', error);
    }

    return {
      ok: true,
      data: {
        id: updated.id,
        status: updated.status,
        distanceId: updated.distanceId,
        editionId: updated.editionId,
        basePriceCents: updated.basePriceCents,
        feesCents: updated.feesCents,
        taxCents: updated.taxCents,
        totalCents: updated.totalCents,
      },
    };
  } catch (error) {
    if (error instanceof Error) {
      switch (error.message) {
        case 'EVENT_NOT_FOUND':
          return { ok: false, error: 'Event or distance not found', code: 'NOT_FOUND' };
        case 'EVENT_NOT_PUBLISHED':
          return { ok: false, error: 'Event is not published', code: 'NOT_PUBLISHED' };
        case 'REGISTRATION_PAUSED':
          return { ok: false, error: 'Registration is paused', code: 'REGISTRATION_PAUSED' };
        case 'REGISTRATION_NOT_OPEN':
          return { ok: false, error: 'Registration has not opened yet', code: 'REGISTRATION_NOT_OPEN' };
        case 'REGISTRATION_CLOSED':
          return { ok: false, error: 'Registration has closed', code: 'REGISTRATION_CLOSED' };
        case 'SOLD_OUT':
          return { ok: false, error: 'Distance is sold out', code: 'SOLD_OUT' };
        case 'INVALID_STATE_TRANSITION':
          return { ok: false, error: 'Registration cannot be finalized from current state', code: 'INVALID_STATE' };
      }
    }
    throw error;
  }
});
