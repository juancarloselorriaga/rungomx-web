'use server';

import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/db';
import { organizations } from '@/db/schema';
import { withAuthenticatedUser } from '@/lib/auth/action-wrapper';
import type { FormActionResult } from '@/lib/forms';
import { validateInput } from '@/lib/forms';
import { safeRevalidateTag } from '@/lib/next-cache';
import { getOrgMembership, requireOrgPermission } from '@/lib/organizations/permissions';
import {
  organizerPayoutCountTag,
  organizerPayoutsTag,
} from '@/lib/payments/organizer/cache-tags';
import {
  createPayoutQuoteAndContract,
  PayoutQuoteContractError,
} from '@/lib/payments/payouts/quote-contract';
import {
  createQueuedPayoutIntent,
  PayoutQueueIntentError,
} from '@/lib/payments/payouts/queue-intents';

type PayoutRequestSuccess = {
  payoutQuoteId: string;
  payoutRequestId: string;
  payoutContractId: string;
  maxWithdrawableAmountMinor: number;
  requestedAmountMinor: number;
};

type QueueIntentSuccess = {
  payoutQueuedIntentId: string;
  requestedAmountMinor: number;
  blockedReasonCode: string;
};

const payoutRequestSchema = z
  .object({
    organizationId: z.string().uuid(),
    requestedAmountMinor: z
      .preprocess(
        (value) => {
          if (value == null || value === '') return undefined;
          if (typeof value === 'number') return value;
          if (typeof value === 'string') return Number.parseInt(value, 10);
          return value;
        },
        z.number().int().positive().optional(),
      )
      .optional(),
  })
  .strict();

const queuePayoutSchema = z
  .object({
    organizationId: z.string().uuid(),
    requestedAmountMinor: z.preprocess(
      (value) => {
        if (typeof value === 'number') return value;
        if (typeof value === 'string') return Number.parseInt(value, 10);
        return value;
      },
      z.number().int().positive(),
    ),
  })
  .strict();

function parseInput<T extends Record<string, unknown>>(input: unknown, fields: Array<keyof T>): unknown {
  if (!(input instanceof FormData)) {
    return input;
  }

  const parsed: Record<string, FormDataEntryValue | null> = {};
  for (const field of fields) {
    parsed[field as string] = input.get(field as string);
  }
  return parsed;
}

function createIdempotencyKey(prefix: string): string {
  return `${prefix}:${crypto.randomUUID()}`;
}

async function ensureOrganizerWriteAccess(
  userId: string,
  canManageEvents: boolean,
  organizationId: string,
): Promise<FormActionResult<never> | null> {
  if (canManageEvents) return null;

  const membership = await getOrgMembership(userId, organizationId);
  try {
    requireOrgPermission(membership, 'canEditRegistrationSettings');
  } catch {
    return { ok: false, error: 'FORBIDDEN', message: 'FORBIDDEN' };
  }

  return null;
}

async function ensureActiveOrganization(organizationId: string): Promise<boolean> {
  const organization = await db.query.organizations.findFirst({
    where: and(eq(organizations.id, organizationId), isNull(organizations.deletedAt)),
    columns: { id: true },
  });

  return Boolean(organization);
}

export const requestOrganizerPayoutAction = withAuthenticatedUser<
  FormActionResult<PayoutRequestSuccess>
>({
  unauthenticated: () => ({ ok: false, error: 'UNAUTHENTICATED', message: 'UNAUTHENTICATED' }),
})(async (authContext, input: unknown) => {
  const validation = validateInput(
    payoutRequestSchema,
    parseInput<{ organizationId: string; requestedAmountMinor?: string }>(input, [
      'organizationId',
      'requestedAmountMinor',
    ]),
  );
  if (!validation.success) {
    return validation.error;
  }

  const { organizationId, requestedAmountMinor } = validation.data;

  const permissionError = await ensureOrganizerWriteAccess(
    authContext.user.id,
    authContext.permissions.canManageEvents,
    organizationId,
  );
  if (permissionError) {
    return permissionError;
  }

  const hasOrganization = await ensureActiveOrganization(organizationId);
  if (!hasOrganization) {
    return { ok: false, error: 'NOT_FOUND', message: 'NOT_FOUND' };
  }

  try {
    const created = await createPayoutQuoteAndContract({
      organizerId: organizationId,
      requestedByUserId: authContext.user.id,
      requestedAmountMinor: requestedAmountMinor ?? null,
      idempotencyKey: createIdempotencyKey('organizer-request'),
      activeConflictPolicy: 'queue',
    });

    safeRevalidateTag(organizerPayoutsTag(organizationId), { expire: 0 });
    safeRevalidateTag(organizerPayoutCountTag(organizationId), { expire: 0 });

    return {
      ok: true,
      data: {
        payoutQuoteId: created.payoutQuoteId,
        payoutRequestId: created.payoutRequestId,
        payoutContractId: created.payoutContractId,
        maxWithdrawableAmountMinor: created.maxWithdrawableAmountMinor,
        requestedAmountMinor: created.requestedAmountMinor,
      },
    };
  } catch (error) {
    if (error instanceof PayoutQuoteContractError) {
      if (
        error.code === 'PAYOUT_REQUEST_ACTIVE_CONFLICT_QUEUE_REQUIRED' ||
        error.code === 'PAYOUT_REQUEST_ACTIVE_CONFLICT_REJECTED'
      ) {
        return {
          ok: false,
          error: 'PAYOUT_REQUEST_ACTIVE_CONFLICT_QUEUE_REQUIRED',
          message: error.message,
        };
      }

      if (
        error.code === 'PAYOUT_NOT_ELIGIBLE' ||
        error.code === 'PAYOUT_REQUEST_EXCEEDS_MAX_WITHDRAWABLE'
      ) {
        return { ok: false, error: error.code, message: error.message };
      }
    }

    console.error('[payments-actions] Failed to request organizer payout', {
      organizationId,
      actorUserId: authContext.user.id,
      error,
    });

    return { ok: false, error: 'SERVER_ERROR', message: 'SERVER_ERROR' };
  }
});

export const queueOrganizerPayoutIntentAction = withAuthenticatedUser<
  FormActionResult<QueueIntentSuccess>
>({
  unauthenticated: () => ({ ok: false, error: 'UNAUTHENTICATED', message: 'UNAUTHENTICATED' }),
})(async (authContext, input: unknown) => {
  const validation = validateInput(
    queuePayoutSchema,
    parseInput<{ organizationId: string; requestedAmountMinor: string }>(input, [
      'organizationId',
      'requestedAmountMinor',
    ]),
  );
  if (!validation.success) {
    return validation.error;
  }

  const { organizationId, requestedAmountMinor } = validation.data;

  const permissionError = await ensureOrganizerWriteAccess(
    authContext.user.id,
    authContext.permissions.canManageEvents,
    organizationId,
  );
  if (permissionError) {
    return permissionError;
  }

  const hasOrganization = await ensureActiveOrganization(organizationId);
  if (!hasOrganization) {
    return { ok: false, error: 'NOT_FOUND', message: 'NOT_FOUND' };
  }

  try {
    const queuedIntent = await createQueuedPayoutIntent({
      organizerId: organizationId,
      createdByUserId: authContext.user.id,
      requestedAmountMinor,
      idempotencyKey: createIdempotencyKey('organizer-queue'),
    });

    safeRevalidateTag(organizerPayoutsTag(organizationId), { expire: 0 });
    safeRevalidateTag(organizerPayoutCountTag(organizationId), { expire: 0 });

    return {
      ok: true,
      data: {
        payoutQueuedIntentId: queuedIntent.payoutQueuedIntentId,
        requestedAmountMinor: queuedIntent.requestedAmountMinor,
        blockedReasonCode: queuedIntent.blockedReasonCode,
      },
    };
  } catch (error) {
    if (error instanceof PayoutQueueIntentError) {
      if (
        error.code === 'PAYOUT_QUEUE_ELIGIBLE_FOR_IMMEDIATE' ||
        error.code === 'PAYOUT_QUEUE_ALREADY_ACTIVE'
      ) {
        return { ok: false, error: error.code, message: error.message };
      }
    }

    console.error('[payments-actions] Failed to queue organizer payout intent', {
      organizationId,
      actorUserId: authContext.user.id,
      error,
    });

    return { ok: false, error: 'SERVER_ERROR', message: 'SERVER_ERROR' };
  }
});
