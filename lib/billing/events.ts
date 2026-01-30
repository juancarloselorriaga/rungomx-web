import { db } from '@/db';
import { billingEvents } from '@/db/schema';
import type { BillingEventEntityType, BillingEventSource, BillingEventType } from './types';

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type DbClient = typeof db | DbTransaction;

export type AppendBillingEventInput = {
  source: BillingEventSource;
  type: BillingEventType;
  provider?: string | null;
  externalEventId?: string | null;
  userId?: string | null;
  entityType: BillingEventEntityType;
  entityId?: string | null;
  payload?: Record<string, unknown>;
  requestId?: string | null;
  idempotencyKey?: string | null;
};

export async function appendBillingEvent(
  input: AppendBillingEventInput,
  tx?: DbClient,
): Promise<void> {
  const client = tx ?? db;
  const payload = input.payload ?? {};

  const insert = client.insert(billingEvents).values({
    provider: input.provider ?? null,
    source: input.source,
    type: input.type,
    externalEventId: input.externalEventId ?? null,
    userId: input.userId ?? null,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    payloadJson: payload,
    requestId: input.requestId ?? null,
    idempotencyKey: input.idempotencyKey ?? null,
  });

  if (input.provider && input.externalEventId) {
    await insert.onConflictDoNothing({
      target: [billingEvents.provider, billingEvents.externalEventId],
    });
  } else {
    await insert;
  }
}
