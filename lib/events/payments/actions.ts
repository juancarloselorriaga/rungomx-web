'use server';

import { and, eq, isNull } from 'drizzle-orm';
import { revalidateTag } from 'next/cache';
import { headers } from 'next/headers';
import { z } from 'zod';

import type { AppLocale } from '@/i18n/routing';
import { createAuditLog, getRequestContext } from '@/lib/audit';
import { withAuthenticatedUser } from '@/lib/auth/action-wrapper';
import { db } from '@/db';
import { eventEditions, registrations } from '@/db/schema';
import { eventEditionDetailTag, eventEditionRegistrationsTag } from '@/lib/events/cache-tags';
import { sendRegistrationCompletionEmail } from '@/lib/events/registration-email';
import { isExpiredHold } from '@/lib/events/registration-holds';
import {
  getRegistrationForOwnerOrThrow,
  RegistrationOwnershipError,
} from '@/lib/events/registrations/ownership';
import { revalidatePublicEventByEditionId, type ActionResult } from '@/lib/events/shared/action-helpers';

const demoPayRegistrationSchema = z.object({
  registrationId: z.string().uuid(),
});

type DemoPayRegistrationData = {
  id: string;
  status: string;
};

function isDemoPaymentsEnabled(): boolean {
  const demoPaymentsEnabled = process.env.NEXT_PUBLIC_FEATURE_EVENTS_DEMO_PAYMENTS === 'true';
  if (!demoPaymentsEnabled) return false;

  const allowInProduction = process.env.EVENTS_DEMO_PAYMENTS_ALLOW_PRODUCTION === 'true';
  const vercelEnv = process.env.VERCEL_ENV;
  const isVercelProduction = vercelEnv ? vercelEnv === 'production' : false;
  const isNonVercelProduction = !vercelEnv && process.env.NODE_ENV === 'production';
  const isProduction = isVercelProduction || isNonVercelProduction;

  if (isProduction && !allowInProduction) return false;

  return true;
}

/**
 * Demo-only payment completion.
 *
 * For non-production demos/tests, this allows a user to confirm a `payment_pending`
 * registration without a real payment processor.
 */
export const demoPayRegistration = withAuthenticatedUser<ActionResult<DemoPayRegistrationData>>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof demoPayRegistrationSchema>) => {
  const validated = demoPayRegistrationSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0]?.message ?? 'Invalid input', code: 'VALIDATION_ERROR' };
  }

  if (!isDemoPaymentsEnabled()) {
    return {
      ok: false,
      error: 'Demo payments are disabled',
      code: 'DEMO_PAYMENTS_DISABLED',
    };
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

  if (registration.status === 'confirmed') {
    return { ok: true, data: { id: registration.id, status: registration.status } };
  }

  if (registration.status !== 'payment_pending') {
    return {
      ok: false,
      error: 'Registration is not awaiting payment',
      code: 'INVALID_STATE',
    };
  }

  const now = new Date();
  if (isExpiredHold(registration.status, registration.expiresAt, now)) {
    return {
      ok: false,
      error: 'Registration expired. Please start again.',
      code: 'REGISTRATION_EXPIRED',
    };
  }

  const updated = await db.transaction(async (tx) => {
    const [updatedRegistration] = await tx
      .update(registrations)
      .set({ status: 'confirmed', expiresAt: null })
      .where(
        and(
          eq(registrations.id, registration.id),
          eq(registrations.status, 'payment_pending'),
          isNull(registrations.deletedAt),
        ),
      )
      .returning({ id: registrations.id, status: registrations.status });

    if (!updatedRegistration) {
      throw new Error('INVALID_STATE_TRANSITION');
    }

    try {
      const edition = await tx.query.eventEditions.findFirst({
        where: and(eq(eventEditions.id, registration.editionId), isNull(eventEditions.deletedAt)),
        with: { series: { columns: { organizationId: true } } },
      });

      const organizationId = edition?.series?.organizationId;
      if (organizationId) {
        const requestContext = await getRequestContext(await headers());
        await createAuditLog(
          {
            organizationId,
            actorUserId: authContext.user.id,
            action: 'registration.demo_pay',
            entityType: 'registration',
            entityId: registration.id,
            after: { mode: 'demo', fromStatus: 'payment_pending', toStatus: 'confirmed' },
            request: requestContext,
          },
          tx,
        );
      }
    } catch (error) {
      console.warn('[demo-payments] Failed to write audit log:', error);
    }

    return updatedRegistration;
  });

  revalidateTag(eventEditionDetailTag(registration.editionId), { expire: 0 });
  revalidateTag(eventEditionRegistrationsTag(registration.editionId), { expire: 0 });
  await revalidatePublicEventByEditionId(registration.editionId);

  try {
    await sendRegistrationCompletionEmail({
      registrationId: updated.id,
      userId: authContext.user.id,
      status: 'confirmed',
      userEmail: authContext.user.email,
      userName: authContext.user.name,
      locale: authContext.profile?.locale as AppLocale | undefined,
    });
  } catch (error) {
    console.error('[demo-payments] Failed to send confirmation email:', error);
  }

  return { ok: true, data: { id: updated.id, status: updated.status } };
});
