const mockTransaction = jest.fn();
const mockSelect = jest.fn();

jest.mock('@/db', () => ({
  db: {
    transaction: (...args: unknown[]) => mockTransaction(...args),
    select: (...args: unknown[]) => mockSelect(...args),
  },
}));

import { moneyCommandIngestions, moneyEvents, moneyTraces } from '@/db/schema';
import {
  getMoneyTraceForAdminContext,
  getMoneyTraceForSupportContext,
  getMoneyTraceForWalletContext,
  moneyMutationIngress,
} from '@/lib/payments/core/mutation-ingress';

const paymentCapturedEvent = {
  eventId: '11111111-1111-4111-8111-111111111111',
  traceId: 'trace-shared-1',
  occurredAt: '2026-02-23T12:00:00.000Z',
  recordedAt: '2026-02-23T12:00:00.000Z',
  eventName: 'payment.captured',
  version: 1,
  entityType: 'registration',
  entityId: 'registration-1',
  source: 'api',
  idempotencyKey: 'idem-1',
  metadata: { sourceSystem: 'tests' },
  payload: {
    organizerId: '22222222-2222-4222-8222-222222222222',
    registrationId: '33333333-3333-4333-8333-333333333333',
    orderId: '44444444-4444-4444-8444-444444444444',
    grossAmount: { amountMinor: 10000, currency: 'MXN' },
    feeAmount: { amountMinor: 500, currency: 'MXN' },
    netAmount: { amountMinor: 9500, currency: 'MXN' },
  },
} as const;

const refundExecutedEvent = {
  eventId: '55555555-5555-4555-8555-555555555555',
  traceId: 'trace-shared-1',
  occurredAt: '2026-02-23T12:10:00.000Z',
  recordedAt: '2026-02-23T12:10:00.000Z',
  eventName: 'refund.executed',
  version: 1,
  entityType: 'refund',
  entityId: 'refund-1',
  source: 'worker',
  idempotencyKey: 'idem-2',
  metadata: { sourceSystem: 'tests' },
  payload: {
    organizerId: '22222222-2222-4222-8222-222222222222',
    refundRequestId: '66666666-6666-4666-8666-666666666666',
    registrationId: '33333333-3333-4333-8333-333333333333',
    refundAmount: { amountMinor: 1000, currency: 'MXN' },
    refundableBalanceAfter: { amountMinor: 0, currency: 'MXN' },
    reasonCode: 'policy_eligible',
  },
} as const;

const financialAdjustmentSensitiveEvent = {
  eventId: '77777777-7777-4777-8777-777777777777',
  traceId: 'trace-redaction-1',
  occurredAt: '2026-02-23T12:20:00.000Z',
  recordedAt: '2026-02-23T12:20:00.000Z',
  eventName: 'financial.adjustment_posted',
  version: 1,
  entityType: 'adjustment',
  entityId: 'adjustment-1',
  source: 'worker',
  idempotencyKey: 'idem-redaction-1',
  metadata: {
    sourceSystem: 'tests',
    internalNote: 'contains sensitive review details',
    supportEmail: 'private@example.com',
  },
  payload: {
    organizerId: '22222222-2222-4222-8222-222222222222',
    adjustmentId: '88888888-8888-4888-8888-888888888888',
    adjustmentCode: 'manual_adjustment',
    amount: { amountMinor: 1200, currency: 'MXN' },
    reason: 'Customer card details shared in free text',
  },
} as const;

describe('money mutation ingress', () => {
  const traceInsertValues: unknown[] = [];
  const eventInsertValues: unknown[] = [];
  const commandInsertValues: unknown[] = [];
  const commandUpdateValues: unknown[] = [];
  const commandInsertReturningQueue: Array<Array<{ traceId: string }>> = [];
  const commandLookupQueue: Array<Array<{ traceId: string }>> = [];

  beforeEach(() => {
    mockTransaction.mockReset();
    mockSelect.mockReset();
    traceInsertValues.length = 0;
    eventInsertValues.length = 0;
    commandInsertValues.length = 0;
    commandUpdateValues.length = 0;
    commandInsertReturningQueue.length = 0;
    commandLookupQueue.length = 0;

    mockTransaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        insert: (table: unknown) => ({
          values: (values: unknown) => {
            if (table === moneyCommandIngestions) {
              commandInsertValues.push(values);
              return {
                onConflictDoNothing: () => ({
                  returning: async () => commandInsertReturningQueue.shift() ?? [],
                }),
              };
            }

            if (table === moneyTraces) {
              traceInsertValues.push(values);
              return {
                onConflictDoNothing: jest.fn().mockResolvedValue(undefined),
              };
            }

            if (table === moneyEvents) {
              eventInsertValues.push(values);
              return Promise.resolve(undefined);
            }

            throw new Error('Unexpected table passed to tx.insert');
          },
        }),
        select: () => ({
          from: () => ({
            where: () => ({
              limit: async () => commandLookupQueue.shift() ?? [],
            }),
          }),
        }),
        update: () => ({
          set: (values: unknown) => {
            commandUpdateValues.push(values);
            return {
              where: async () => undefined,
            };
          },
        }),
      };

      return callback(tx);
    });
  });

  it('persists trace and canonical events atomically via a single transaction', async () => {
    commandInsertReturningQueue.push([{ traceId: 'trace-shared-1' }]);

    const result = await moneyMutationIngress({
      traceId: 'trace-shared-1',
      organizerId: '22222222-2222-4222-8222-222222222222',
      idempotencyKey: 'command-key-1',
      source: 'api',
      events: [paymentCapturedEvent, refundExecutedEvent],
    });

    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(commandInsertValues).toHaveLength(1);
    expect(traceInsertValues).toHaveLength(1);
    expect(eventInsertValues).toHaveLength(1);
    expect(commandUpdateValues).toHaveLength(1);

    expect(traceInsertValues[0]).toMatchObject({
      traceId: 'trace-shared-1',
      organizerId: '22222222-2222-4222-8222-222222222222',
      rootEntityType: 'registration',
      rootEntityId: 'registration-1',
      createdBySource: 'api',
    });

    expect(eventInsertValues[0]).toHaveLength(2);
    expect(result.traceId).toBe('trace-shared-1');
    expect(result.persistedEvents).toHaveLength(2);
    expect(result.deduplicated).toBe(false);
  });

  it('returns deterministic duplicate response and skips event writes on repeated idempotency key', async () => {
    commandInsertReturningQueue.push([]);
    commandLookupQueue.push([{ traceId: 'trace-original-1' }]);

    const result = await moneyMutationIngress({
      traceId: 'trace-shared-1',
      organizerId: '22222222-2222-4222-8222-222222222222',
      idempotencyKey: 'command-key-duplicate',
      source: 'worker',
      events: [paymentCapturedEvent],
    });

    expect(result.deduplicated).toBe(true);
    expect(result.traceId).toBe('trace-original-1');
    expect(result.duplicateOfTraceId).toBe('trace-original-1');
    expect(result.persistedEvents).toHaveLength(0);

    expect(traceInsertValues).toHaveLength(0);
    expect(eventInsertValues).toHaveLength(0);
    expect(commandUpdateValues).toHaveLength(0);
  });

  it('rejects commands when any canonical event trace id differs from command trace id', async () => {
    await expect(
      moneyMutationIngress({
        traceId: 'trace-expected',
        organizerId: '22222222-2222-4222-8222-222222222222',
        idempotencyKey: 'command-key-mismatch',
        source: 'worker',
        events: [
          {
            ...paymentCapturedEvent,
            traceId: 'trace-other',
          },
        ],
      }),
    ).rejects.toThrow('Canonical event trace mismatch: expected trace-expected, received trace-other');

    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('rejects organizer-scoped idempotency usage without organizer id', async () => {
    await expect(
      moneyMutationIngress({
        traceId: 'trace-shared-1',
        idempotencyKey: 'command-key-no-organizer',
        source: 'api',
        events: [paymentCapturedEvent],
      }),
    ).rejects.toThrow('Organizer-scoped idempotency requires organizerId.');
  });

  it('rejects commands with empty event lists before opening a transaction', async () => {
    await expect(
      moneyMutationIngress({
        traceId: 'trace-empty',
        organizerId: '22222222-2222-4222-8222-222222222222',
        source: 'api',
        events: [],
      }),
    ).rejects.toThrow('Money mutation ingress requires at least one canonical event.');

    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('rejects commands with unsupported ingress source values', async () => {
    await expect(
      moneyMutationIngress({
        traceId: 'trace-invalid-source',
        organizerId: '22222222-2222-4222-8222-222222222222',
        source: 'unexpected_source' as never,
        events: [paymentCapturedEvent],
      }),
    ).rejects.toThrow('Unsupported money mutation ingress source: unexpected_source');

    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('returns equivalent trace views for admin/support and organizer-filtered wallet view', async () => {
    const persistedRows = [
      {
        id: 'event-1',
        traceId: 'trace-shared-1',
        organizerId: '22222222-2222-4222-8222-222222222222',
        eventName: 'payment.captured',
        eventVersion: 1,
        entityType: 'registration',
        entityId: 'registration-1',
        source: 'api',
        idempotencyKey: 'idem-1',
        occurredAt: new Date('2026-02-23T12:00:00.000Z'),
        payloadJson: { test: true },
        metadataJson: {},
        createdAt: new Date('2026-02-23T12:00:01.000Z'),
      },
      {
        id: 'event-2',
        traceId: 'trace-shared-1',
        organizerId: 'other-organizer',
        eventName: 'refund.executed',
        eventVersion: 1,
        entityType: 'refund',
        entityId: 'refund-1',
        source: 'worker',
        idempotencyKey: 'idem-2',
        occurredAt: new Date('2026-02-23T12:10:00.000Z'),
        payloadJson: { test: true },
        metadataJson: {},
        createdAt: new Date('2026-02-23T12:10:01.000Z'),
      },
    ];

    const mockOrderBy = jest.fn().mockResolvedValue(persistedRows);
    const mockWhere = jest.fn().mockReturnValue({ orderBy: mockOrderBy });
    const mockFrom = jest.fn().mockReturnValue({ where: mockWhere });
    mockSelect.mockReturnValue({ from: mockFrom });

    const adminView = await getMoneyTraceForAdminContext('trace-shared-1');
    const supportView = await getMoneyTraceForSupportContext('trace-shared-1');
    const walletView = await getMoneyTraceForWalletContext({
      traceId: 'trace-shared-1',
      organizerId: '22222222-2222-4222-8222-222222222222',
    });

    expect(adminView).toEqual(persistedRows);
    expect(supportView).toEqual(persistedRows);
    expect(walletView).toEqual([persistedRows[0]]);
  });

  it('redacts restricted payload and metadata fields before persistence and includes policy evidence', async () => {
    commandInsertReturningQueue.push([{ traceId: 'trace-redaction-1' }]);

    const result = await moneyMutationIngress({
      traceId: 'trace-redaction-1',
      organizerId: '22222222-2222-4222-8222-222222222222',
      idempotencyKey: 'command-key-redaction',
      source: 'worker',
      events: [financialAdjustmentSensitiveEvent],
    });

    expect(result.deduplicated).toBe(false);
    expect(result.persistedEvents).toHaveLength(1);
    expect(result.persistedEvents[0]?.payload).toMatchObject({
      reason: '[REDACTED_FREE_TEXT]',
    });
    expect(result.persistedEvents[0]?.metadata).toMatchObject({
      internalNote: '[REDACTED_FREE_TEXT]',
      supportEmail: '[REDACTED_CONTACT]',
      payloadRedaction: {
        policyVersion: 'v1',
        redacted: true,
      },
    });

    const persistedInsert = eventInsertValues[0] as Array<{
      payloadJson: Record<string, unknown>;
      metadataJson: Record<string, unknown>;
    }>;
    expect(persistedInsert[0]?.payloadJson.reason).toBe('[REDACTED_FREE_TEXT]');
    expect(persistedInsert[0]?.metadataJson.internalNote).toBe('[REDACTED_FREE_TEXT]');
    expect(persistedInsert[0]?.metadataJson.supportEmail).toBe('[REDACTED_CONTACT]');

    const evidence = (persistedInsert[0]?.metadataJson.payloadRedaction ?? {}) as Record<
      string,
      unknown
    >;
    expect(evidence.redacted).toBe(true);
    expect(evidence.redactedFieldCount).toBe(3);
    expect(evidence.redactionClasses).toEqual(['contact', 'free_text']);
    expect(evidence.redactedPaths).toEqual([
      'metadata.internalNote',
      'metadata.supportEmail',
      'payload.reason',
    ]);
  });
});
