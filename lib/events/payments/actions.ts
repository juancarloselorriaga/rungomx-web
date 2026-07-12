'use server';

import { and, eq, isNull } from 'drizzle-orm';
import { refresh, revalidateTag } from 'next/cache';
import { z } from 'zod';

import type { AppLocale } from '@/i18n/routing';
import { withAuthenticatedUser } from '@/lib/auth/action-wrapper';
import { db } from '@/db';
import { discountRedemptions, eventEditions } from '@/db/schema';
import { eventEditionDetailTag, eventEditionRegistrationsTag } from '@/lib/events/cache-tags';
import { confirmRegistrationPaymentCaptureInTransaction } from '@/lib/events/payments/confirm-capture';
import { sendRegistrationCompletionEmail } from '@/lib/events/registration-email';
import { isExpiredHold } from '@/lib/events/registration-holds';
import {
  getRegistrationForOwnerOrThrow,
  RegistrationOwnershipError,
} from '@/lib/events/registrations/ownership';
import { revalidatePublicEventByEditionId, type ActionResult } from '@/lib/events/shared/action-helpers';
import { revalidateAdminPaymentCaptureVolumeCaches } from '@/lib/payments/volume/payment-capture-volume-rollups';

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

function toNonNegativeMinor(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(Math.trunc(value), 0);
}

function buildDemoCaptureTraceId(registrationId: string): string {
  return `payment-capture:${registrationId}`.slice(0, 128);
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
    const edition = await tx.query.eventEditions.findFirst({
      where: and(eq(eventEditions.id, registration.editionId), isNull(eventEditions.deletedAt)),
      with: { series: { columns: { organizationId: true } } },
    });

    const organizationId = edition?.series?.organizationId;
    if (!organizationId) {
      throw new Error('ORGANIZATION_NOT_FOUND');
    }

    let grossAmountMinor: number;
    if (registration.totalCents == null) {
      const discountRedemption = await tx.query.discountRedemptions.findFirst({
        where: eq(discountRedemptions.registrationId, registration.id),
        columns: { discountAmountCents: true },
      });

      grossAmountMinor = Math.max(
        toNonNegativeMinor(registration.basePriceCents) +
          toNonNegativeMinor(registration.feesCents) +
          toNonNegativeMinor(registration.taxCents) -
          toNonNegativeMinor(discountRedemption?.discountAmountCents) -
          toNonNegativeMinor(registration.groupDiscountAmountCents),
        0,
      );
    } else {
      grossAmountMinor = toNonNegativeMinor(registration.totalCents);
    }
    const feeAmountMinor = toNonNegativeMinor(registration.feesCents);
    const netAmountMinor = Math.max(grossAmountMinor - feeAmountMinor, 0);
    const traceId = buildDemoCaptureTraceId(registration.id);

    return confirmRegistrationPaymentCaptureInTransaction(tx, {
      registrationId: registration.id,
      organizerId: organizationId,
      grossAmountMinor,
      feeAmountMinor,
      netAmountMinor,
      source: 'api',
      idempotencyKey: traceId,
      traceId,
      occurredAt: now,
      auditAction: 'registration.demo_pay',
      actorUserId: authContext.user.id,
      metadata: { simulationMode: 'demo_pay' },
    });
  });

  revalidateTag(eventEditionDetailTag(registration.editionId), { expire: 0 });
  revalidateTag(eventEditionRegistrationsTag(registration.editionId), { expire: 0 });
  revalidateAdminPaymentCaptureVolumeCaches();
  await revalidatePublicEventByEditionId(registration.editionId);
  refresh();

  void sendRegistrationCompletionEmail({
    registrationId: updated.id,
    userId: authContext.user.id,
    status: 'confirmed',
    userEmail: authContext.user.email,
    userName: authContext.user.name,
    locale: authContext.profile?.locale as AppLocale | undefined,
  }).catch((error) => {
    console.error('[demo-payments] Failed to send confirmation email:', error);
  });

  return { ok: true, data: { id: updated.id, status: updated.status } };
});
