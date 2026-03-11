const mockSafeRevalidateTag = jest.fn();

jest.mock('@/db', () => ({
  db: {
    transaction: jest.fn(),
  },
}));

jest.mock('@/lib/next-cache', () => ({
  safeRevalidateTag: (...args: unknown[]) => mockSafeRevalidateTag(...args),
}));

import {
  paymentCaptureVolumeDaily,
  paymentCaptureVolumeOrganizerDaily,
  paymentCaptureVolumeReconciliationDaily,
} from '@/db/schema';
import {
  buildPaymentCaptureVolumeRollupsFromCanonicalEvents,
  revalidateAdminPaymentCaptureVolumeCaches,
  upsertPaymentCaptureVolumeRollupsInTransaction,
} from '@/lib/payments/volume/payment-capture-volume-rollups';

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
    grossAmount: { amountMinor: 10000, currency: 'MXN' },
    feeAmount: { amountMinor: 500, currency: 'MXN' },
    netAmount: { amountMinor: 9500, currency: 'MXN' },
  },
} as const;

const malformedPaymentCapturedEvent = {
  ...paymentCapturedEvent,
  traceId: 'trace-malformed-1',
  eventId: '99999999-9999-4999-8999-999999999999',
  idempotencyKey: 'idem-malformed-1',
  payload: {
    ...paymentCapturedEvent.payload,
    netAmount: { amountMinor: 9000, currency: 'MXN' },
  },
} as const;

const missingOrganizerPaymentCapturedEvent = {
  ...paymentCapturedEvent,
  traceId: 'trace-missing-organizer-1',
  eventId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  idempotencyKey: 'idem-missing-organizer-1',
  payload: {
    ...paymentCapturedEvent.payload,
    organizerId: '   ',
  },
} as const;

const legacyVersionPaymentCapturedEvent = {
  ...paymentCapturedEvent,
  traceId: 'trace-v2-ignored',
  eventId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  idempotencyKey: 'idem-v2-ignored',
  version: 2,
} as unknown as Parameters<typeof buildPaymentCaptureVolumeRollupsFromCanonicalEvents>[0][number];

describe('payment capture volume rollups', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('builds accepted and reconciliation daily rollups from canonical capture events', () => {
    const result = buildPaymentCaptureVolumeRollupsFromCanonicalEvents([
      paymentCapturedEvent,
      malformedPaymentCapturedEvent,
      missingOrganizerPaymentCapturedEvent,
      legacyVersionPaymentCapturedEvent,
    ]);

    expect(result.daily).toEqual([
      expect.objectContaining({
        sourceCurrency: 'MXN',
        grossProcessedMinor: 10000,
        platformFeeMinor: 500,
        organizerProceedsMinor: 9500,
        captureCount: 1,
        sampleTraceIds: ['trace-shared-1'],
      }),
    ]);
    expect(result.organizerDaily).toEqual([
      expect.objectContaining({
        organizerId: '22222222-2222-4222-8222-222222222222',
        sourceCurrency: 'MXN',
        grossProcessedMinor: 10000,
        platformFeeMinor: 500,
        organizerProceedsMinor: 9500,
        captureCount: 1,
        sampleTraceIds: ['trace-shared-1'],
      }),
    ]);
    expect(result.reconciliationDaily).toEqual([
      expect.objectContaining({
        captureEventCount: 3,
        excludedEventCount: 2,
        sampleTraceIds: ['trace-malformed-1', 'trace-missing-organizer-1', 'trace-shared-1'],
        excludedEventSamplesJson: [
          {
            traceId: 'trace-malformed-1',
            organizerId: '22222222-2222-4222-8222-222222222222',
            occurredAt: '2026-02-23T12:00:00.000Z',
            reason: 'math_mismatch',
          },
          {
            traceId: 'trace-missing-organizer-1',
            organizerId: null,
            occurredAt: '2026-02-23T12:00:00.000Z',
            reason: 'missing_organizer_id',
          },
        ],
      }),
    ]);
  });

  it('upserts accepted and reconciliation rollup tables in the same transaction client', async () => {
    const insertCalls: Array<{ table: unknown; values: unknown; config: unknown }> = [];
    const tx = {
      insert: (table: unknown) => ({
        values: (values: unknown) => ({
          onConflictDoUpdate: async (config: unknown) => {
            insertCalls.push({ table, values, config });
            return undefined;
          },
        }),
      }),
    };

    const result = await upsertPaymentCaptureVolumeRollupsInTransaction(
      tx as never,
      [
        paymentCapturedEvent,
        malformedPaymentCapturedEvent,
        missingOrganizerPaymentCapturedEvent,
        legacyVersionPaymentCapturedEvent,
      ],
    );

    expect(result).toEqual({ wroteRollups: true });
    expect(insertCalls).toHaveLength(3);
    expect(insertCalls[0]?.table).toBe(paymentCaptureVolumeDaily);
    expect(insertCalls[0]?.values).toEqual(
      expect.objectContaining({
        sourceCurrency: 'MXN',
        grossProcessedMinor: 10000,
        captureCount: 1,
      }),
    );
    expect(insertCalls[1]?.table).toBe(paymentCaptureVolumeOrganizerDaily);
    expect(insertCalls[1]?.values).toEqual(
      expect.objectContaining({
        organizerId: '22222222-2222-4222-8222-222222222222',
        sourceCurrency: 'MXN',
        grossProcessedMinor: 10000,
        captureCount: 1,
      }),
    );
    expect(insertCalls[2]?.table).toBe(paymentCaptureVolumeReconciliationDaily);
    expect(insertCalls[2]?.values).toEqual(
      expect.objectContaining({
        captureEventCount: 3,
        excludedEventCount: 2,
        sampleTraceIds: ['trace-malformed-1', 'trace-missing-organizer-1', 'trace-shared-1'],
      }),
    );
  });

  it('revalidates the base and windowed volume cache tags', () => {
    revalidateAdminPaymentCaptureVolumeCaches();

    expect(mockSafeRevalidateTag).toHaveBeenCalledWith('admin-payments-volume', { expire: 0 });
    expect(mockSafeRevalidateTag).toHaveBeenCalledWith(
      'admin-payments-volume-organizers',
      { expire: 0 },
    );
    expect(mockSafeRevalidateTag).toHaveBeenCalledTimes(2);
  });

  it('optionally revalidates explicit window tags when requested', () => {
    revalidateAdminPaymentCaptureVolumeCaches([7, 30]);

    expect(mockSafeRevalidateTag).toHaveBeenCalledWith('admin-payments-volume-7d', {
      expire: 0,
    });
    expect(mockSafeRevalidateTag).toHaveBeenCalledWith('admin-payments-volume-30d', {
      expire: 0,
    });
    expect(mockSafeRevalidateTag).toHaveBeenCalledWith(
      'admin-payments-volume-organizers-7d',
      { expire: 0 },
    );
    expect(mockSafeRevalidateTag).toHaveBeenCalledWith(
      'admin-payments-volume-organizers-30d',
      { expire: 0 },
    );
  });
});
