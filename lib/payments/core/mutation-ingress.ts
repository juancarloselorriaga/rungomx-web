import { and, asc, eq } from 'drizzle-orm';

import { db } from '@/db';
import {
  moneyCommandIngestions,
  moneyEvents,
  moneyMutationSourceEnum,
  moneyTraces,
} from '@/db/schema';
import {
  parseCanonicalMoneyEventWithUpcasting,
  type CanonicalMoneyEventV1,
} from '@/lib/payments/core/contracts/events';

export const moneyMutationIngressSources = [
  'api',
  'server_action',
  'worker',
  'scheduler',
] as const satisfies ReadonlyArray<(typeof moneyMutationSourceEnum.enumValues)[number]>;

export type MoneyMutationIngressSource = (typeof moneyMutationIngressSources)[number];

export type MoneyMutationIngressCommand = {
  traceId: string;
  organizerId?: string | null;
  idempotencyKey?: string | null;
  source: MoneyMutationIngressSource;
  events: unknown[];
};

export type PersistedMoneyEvent = {
  id: string;
  traceId: string;
  organizerId: string | null;
  eventName: string;
  eventVersion: number;
  entityType: string;
  entityId: string;
  source: MoneyMutationIngressSource;
  idempotencyKey: string | null;
  occurredAt: Date;
  payloadJson: Record<string, unknown>;
  metadataJson: Record<string, unknown>;
  createdAt: Date;
};

function normalizeCanonicalEvents(command: MoneyMutationIngressCommand): CanonicalMoneyEventV1[] {
  if (!moneyMutationIngressSources.includes(command.source)) {
    throw new Error(`Unsupported money mutation ingress source: ${String(command.source)}`);
  }

  if (command.events.length === 0) {
    throw new Error('Money mutation ingress requires at least one canonical event.');
  }

  const parsedEvents = command.events.map((event) => parseCanonicalMoneyEventWithUpcasting(event));
  for (const parsedEvent of parsedEvents) {
    if (parsedEvent.traceId !== command.traceId) {
      throw new Error(
        `Canonical event trace mismatch: expected ${command.traceId}, received ${parsedEvent.traceId}`,
      );
    }
  }

  return parsedEvents;
}

export async function moneyMutationIngress(command: MoneyMutationIngressCommand): Promise<{
  traceId: string;
  persistedEvents: CanonicalMoneyEventV1[];
  deduplicated: boolean;
  duplicateOfTraceId?: string;
}> {
  const parsedEvents = normalizeCanonicalEvents(command);
  const rootEvent = parsedEvents[0];

  const result = await db.transaction(async (tx) => {
    if (command.idempotencyKey) {
      if (!command.organizerId) {
        throw new Error('Organizer-scoped idempotency requires organizerId.');
      }

      const ingestionInsert = await tx
        .insert(moneyCommandIngestions)
        .values({
          organizerId: command.organizerId,
          idempotencyKey: command.idempotencyKey,
          traceId: command.traceId,
          status: 'processing',
          eventCount: parsedEvents.length,
          responseSummaryJson: {
            stage: 'accepted',
          },
        })
        .onConflictDoNothing()
        .returning({
          traceId: moneyCommandIngestions.traceId,
        });

      if (ingestionInsert.length === 0) {
        const [existingIngestion] = await tx
          .select({
            traceId: moneyCommandIngestions.traceId,
          })
          .from(moneyCommandIngestions)
          .where(
            and(
              eq(moneyCommandIngestions.organizerId, command.organizerId),
              eq(moneyCommandIngestions.idempotencyKey, command.idempotencyKey),
            ),
          )
          .limit(1);

        const duplicateTraceId = existingIngestion?.traceId ?? command.traceId;
        return {
          traceId: duplicateTraceId,
          persistedEvents: [] as CanonicalMoneyEventV1[],
          deduplicated: true,
          duplicateOfTraceId: duplicateTraceId,
        };
      }
    }

    await tx
      .insert(moneyTraces)
      .values({
        traceId: command.traceId,
        organizerId: command.organizerId ?? null,
        rootEntityType: rootEvent.entityType,
        rootEntityId: rootEvent.entityId,
        createdBySource: command.source,
        metadataJson: {
          eventCount: parsedEvents.length,
          initialEventName: rootEvent.eventName,
          initialEventVersion: rootEvent.version,
        },
      })
      .onConflictDoNothing();

    await tx.insert(moneyEvents).values(
      parsedEvents.map((event) => ({
        traceId: event.traceId,
        organizerId: command.organizerId ?? null,
        eventName: event.eventName,
        eventVersion: event.version,
        entityType: event.entityType,
        entityId: event.entityId,
        source: command.source,
        idempotencyKey: event.idempotencyKey ?? null,
        occurredAt: new Date(event.occurredAt),
        payloadJson: event.payload as Record<string, unknown>,
        metadataJson: event.metadata,
        })),
    );

    if (command.idempotencyKey && command.organizerId) {
      await tx
        .update(moneyCommandIngestions)
        .set({
          status: 'completed',
          eventCount: parsedEvents.length,
          responseSummaryJson: {
            stage: 'completed',
            traceId: command.traceId,
            eventCount: parsedEvents.length,
          },
          lastSeenAt: new Date(),
        })
        .where(
          and(
            eq(moneyCommandIngestions.organizerId, command.organizerId),
            eq(moneyCommandIngestions.idempotencyKey, command.idempotencyKey),
          ),
        );
    }

    return {
      traceId: command.traceId,
      persistedEvents: parsedEvents,
      deduplicated: false,
    };
  });

  return result;
}

async function getMoneyTraceEvents(traceId: string): Promise<PersistedMoneyEvent[]> {
  return db
    .select({
      id: moneyEvents.id,
      traceId: moneyEvents.traceId,
      organizerId: moneyEvents.organizerId,
      eventName: moneyEvents.eventName,
      eventVersion: moneyEvents.eventVersion,
      entityType: moneyEvents.entityType,
      entityId: moneyEvents.entityId,
      source: moneyEvents.source,
      idempotencyKey: moneyEvents.idempotencyKey,
      occurredAt: moneyEvents.occurredAt,
      payloadJson: moneyEvents.payloadJson,
      metadataJson: moneyEvents.metadataJson,
      createdAt: moneyEvents.createdAt,
    })
    .from(moneyEvents)
    .where(eq(moneyEvents.traceId, traceId))
    .orderBy(asc(moneyEvents.occurredAt), asc(moneyEvents.createdAt));
}

export async function getMoneyTraceForWalletContext(params: {
  traceId: string;
  organizerId: string;
}): Promise<PersistedMoneyEvent[]> {
  const events = await getMoneyTraceEvents(params.traceId);
  return events.filter((event) => event.organizerId === params.organizerId);
}

export async function getMoneyTraceForAdminContext(traceId: string): Promise<PersistedMoneyEvent[]> {
  return getMoneyTraceEvents(traceId);
}

export async function getMoneyTraceForSupportContext(
  traceId: string,
): Promise<PersistedMoneyEvent[]> {
  return getMoneyTraceEvents(traceId);
}
