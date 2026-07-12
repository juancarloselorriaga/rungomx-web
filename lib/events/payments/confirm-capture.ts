import { randomUUID } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { headers } from 'next/headers';

import { db } from '@/db';
import { registrations } from '@/db/schema';
import { createAuditLog, getRequestContext, type AuditAction } from '@/lib/audit';
import { ingestMoneyMutationFromServerActionInTransaction } from '@/lib/payments/core/mutation-ingress-paths';

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

const DEFAULT_CAPTURE_CURRENCY = 'MXN';

/**
 * Canonical event sources this registration payment-capture core is reachable
 * from today. Narrower than the full canonical envelope source enum because
 * this module only serves user/API-triggered registration capture flows.
 */
export type ConfirmRegistrationPaymentCaptureSource = 'api' | 'server_action';

export type ConfirmRegistrationPaymentCaptureParams = {
  registrationId: string;
  organizerId: string;
  grossAmountMinor: number;
  feeAmountMinor: number;
  netAmountMinor: number;
  currency?: string;
  source: ConfirmRegistrationPaymentCaptureSource;
  idempotencyKey: string;
  traceId?: string;
  occurredAt: Date;
  auditAction: AuditAction;
  actorUserId?: string;
  metadata?: Record<string, unknown>;
};

export type ConfirmRegistrationPaymentCaptureResult = {
  id: string;
  status: string;
};

function buildPaymentCapturedEvent(params: {
  registrationId: string;
  organizerId: string;
  occurredAt: Date;
  grossAmountMinor: number;
  feeAmountMinor: number;
  netAmountMinor: number;
  currency: string;
  source: ConfirmRegistrationPaymentCaptureSource;
  idempotencyKey: string;
  traceId: string;
  metadata: Record<string, unknown>;
}) {
  const occurredAtIso = params.occurredAt.toISOString();

  return {
    eventId: randomUUID(),
    traceId: params.traceId,
    occurredAt: occurredAtIso,
    recordedAt: occurredAtIso,
    eventName: 'payment.captured' as const,
    version: 1 as const,
    entityType: 'registration' as const,
    entityId: params.registrationId,
    source: params.source,
    idempotencyKey: params.idempotencyKey,
    metadata: params.metadata,
    payload: {
      organizerId: params.organizerId,
      registrationId: params.registrationId,
      grossAmount: { amountMinor: params.grossAmountMinor, currency: params.currency },
      feeAmount: { amountMinor: params.feeAmountMinor, currency: params.currency },
      netAmount: { amountMinor: params.netAmountMinor, currency: params.currency },
    },
  };
}

/**
 * Confirm-on-capture core: CASes a registration from `payment_pending` to
 * `confirmed`, ingests the canonical `payment.captured` event, and writes the
 * audit trail — all inside the transaction supplied by the caller.
 *
 * Callers that already own an open transaction (e.g. because they need to
 * resolve `organizerId` from within the same transaction first) should call
 * this directly with their `tx`. Callers that don't yet have one should use
 * `confirmRegistrationPaymentCapture` instead.
 */
export async function confirmRegistrationPaymentCaptureInTransaction(
  tx: DbTransaction,
  params: ConfirmRegistrationPaymentCaptureParams,
): Promise<ConfirmRegistrationPaymentCaptureResult> {
  const currency = params.currency ?? DEFAULT_CAPTURE_CURRENCY;
  const traceId = params.traceId ?? params.idempotencyKey;

  const [updatedRegistration] = await tx
    .update(registrations)
    .set({ status: 'confirmed', expiresAt: null })
    .where(
      and(
        eq(registrations.id, params.registrationId),
        eq(registrations.status, 'payment_pending'),
        isNull(registrations.deletedAt),
      ),
    )
    .returning({ id: registrations.id, status: registrations.status });

  if (!updatedRegistration) {
    throw new Error('INVALID_STATE_TRANSITION');
  }

  await ingestMoneyMutationFromServerActionInTransaction(tx, {
    traceId,
    organizerId: params.organizerId,
    idempotencyKey: params.idempotencyKey,
    events: [
      buildPaymentCapturedEvent({
        registrationId: params.registrationId,
        organizerId: params.organizerId,
        occurredAt: params.occurredAt,
        grossAmountMinor: params.grossAmountMinor,
        feeAmountMinor: params.feeAmountMinor,
        netAmountMinor: params.netAmountMinor,
        currency,
        source: params.source,
        idempotencyKey: params.idempotencyKey,
        traceId,
        metadata: params.metadata ?? {},
      }),
    ],
  });

  if (params.actorUserId) {
    try {
      const requestContext = await getRequestContext(await headers());
      await createAuditLog(
        {
          organizationId: params.organizerId,
          actorUserId: params.actorUserId,
          action: params.auditAction,
          entityType: 'registration',
          entityId: params.registrationId,
          after: { fromStatus: 'payment_pending', toStatus: 'confirmed' },
          request: requestContext,
        },
        tx,
      );
    } catch (error) {
      console.warn('[payments] Failed to write audit log for payment capture confirmation:', error);
    }
  }

  return updatedRegistration;
}

/**
 * Convenience entrypoint for callers that don't already have an open
 * transaction. Opens one and delegates to
 * `confirmRegistrationPaymentCaptureInTransaction`.
 */
export async function confirmRegistrationPaymentCapture(
  params: ConfirmRegistrationPaymentCaptureParams,
): Promise<ConfirmRegistrationPaymentCaptureResult> {
  return db.transaction((tx) => confirmRegistrationPaymentCaptureInTransaction(tx, params));
}
