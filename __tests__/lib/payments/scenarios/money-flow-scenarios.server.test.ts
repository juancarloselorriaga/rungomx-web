const mockSelect = jest.fn();

jest.mock('@/db', () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
  },
}));

import { parseCanonicalMoneyEventWithUpcasting } from '@/lib/payments/core/contracts/events';
import { replayCanonicalMoneyEvents } from '@/lib/payments/core/replay';
import { organizerRefundDecisionValues } from '@/lib/payments/refunds/decision-submission';
import { getOrganizerWalletBucketSnapshot } from '@/lib/payments/wallet/snapshot';

type WalletEventRow = {
  eventName: string;
  occurredAt: Date;
  payloadJson: Record<string, unknown>;
};

const ORGANIZER_ID = '11111111-1111-4111-8111-111111111111';
const PAYOUT_REQUEST_ID = '22222222-2222-4222-8222-222222222222';
const PAYOUT_QUOTE_ID = '33333333-3333-4333-8333-333333333333';
const REFUND_REQUEST_ID = '44444444-4444-4444-8444-444444444444';

function deterministicUuid(seed: number): string {
  const suffix = Math.trunc(seed).toString(16).padStart(12, '0').slice(-12);
  return `00000000-0000-4000-8000-${suffix}`;
}

function at(base: Date, offsetMinutes: number): string {
  return new Date(base.getTime() + offsetMinutes * 60_000).toISOString();
}

function paymentCapturedEvent(params: {
  sequence: number;
  occurredAt: string;
  grossAmountMinor: number;
  feeAmountMinor: number;
  netAmountMinor: number;
}) {
  const registrationId = deterministicUuid(10_000 + params.sequence);

  return parseCanonicalMoneyEventWithUpcasting({
    eventId: deterministicUuid(params.sequence),
    traceId: `trace-payment-${params.sequence}`,
    occurredAt: params.occurredAt,
    recordedAt: params.occurredAt,
    eventName: 'payment.captured',
    version: 1,
    entityType: 'registration',
    entityId: registrationId,
    source: 'api',
    idempotencyKey: `idem-payment-${params.sequence}`,
    metadata: { scenario: 'money-flow' },
    payload: {
      organizerId: ORGANIZER_ID,
      registrationId,
      orderId: deterministicUuid(20_000 + params.sequence),
      grossAmount: { amountMinor: params.grossAmountMinor, currency: 'MXN' },
      feeAmount: { amountMinor: params.feeAmountMinor, currency: 'MXN' },
      netAmount: { amountMinor: params.netAmountMinor, currency: 'MXN' },
    },
  });
}

function refundExecutedEvent(params: { sequence: number; occurredAt: string; amountMinor: number }) {
  return parseCanonicalMoneyEventWithUpcasting({
    eventId: deterministicUuid(params.sequence),
    traceId: 'trace-refund-executed',
    occurredAt: params.occurredAt,
    recordedAt: params.occurredAt,
    eventName: 'refund.executed',
    version: 1,
    entityType: 'refund',
    entityId: REFUND_REQUEST_ID,
    source: 'worker',
    idempotencyKey: 'idem-refund-executed',
    metadata: { scenario: 'money-flow' },
    payload: {
      organizerId: ORGANIZER_ID,
      refundRequestId: REFUND_REQUEST_ID,
      registrationId: deterministicUuid(10_001),
      refundAmount: { amountMinor: params.amountMinor, currency: 'MXN' },
      refundableBalanceAfter: { amountMinor: 0, currency: 'MXN' },
      reasonCode: 'approved',
    },
  });
}

function payoutRequestedEvent(params: { sequence: number; occurredAt: string; amountMinor: number }) {
  return parseCanonicalMoneyEventWithUpcasting({
    eventId: deterministicUuid(params.sequence),
    traceId: 'trace-payout-requested',
    occurredAt: params.occurredAt,
    recordedAt: params.occurredAt,
    eventName: 'payout.requested',
    version: 1,
    entityType: 'payout',
    entityId: PAYOUT_REQUEST_ID,
    source: 'api',
    idempotencyKey: 'idem-payout-requested',
    metadata: { scenario: 'money-flow' },
    payload: {
      organizerId: ORGANIZER_ID,
      payoutRequestId: PAYOUT_REQUEST_ID,
      payoutQuoteId: PAYOUT_QUOTE_ID,
      requestedAmount: { amountMinor: params.amountMinor, currency: 'MXN' },
    },
  });
}

function payoutAdjustedEvent(params: {
  sequence: number;
  occurredAt: string;
  previousRequestedAmountMinor: number;
  adjustedRequestedAmountMinor: number;
}) {
  return parseCanonicalMoneyEventWithUpcasting({
    eventId: deterministicUuid(params.sequence),
    traceId: 'trace-payout-adjusted',
    occurredAt: params.occurredAt,
    recordedAt: params.occurredAt,
    eventName: 'payout.adjusted',
    version: 1,
    entityType: 'payout',
    entityId: PAYOUT_REQUEST_ID,
    source: 'worker',
    idempotencyKey: 'idem-payout-adjusted',
    metadata: { scenario: 'money-flow' },
    payload: {
      organizerId: ORGANIZER_ID,
      payoutRequestId: PAYOUT_REQUEST_ID,
      payoutQuoteId: PAYOUT_QUOTE_ID,
      previousRequestedAmount: { amountMinor: params.previousRequestedAmountMinor, currency: 'MXN' },
      adjustedRequestedAmount: { amountMinor: params.adjustedRequestedAmountMinor, currency: 'MXN' },
      reasonCode: 'refund_compensation',
    },
  });
}

function payoutProcessingEvent(params: { sequence: number; occurredAt: string; amountMinor: number }) {
  return parseCanonicalMoneyEventWithUpcasting({
    eventId: deterministicUuid(params.sequence),
    traceId: 'trace-payout-processing',
    occurredAt: params.occurredAt,
    recordedAt: params.occurredAt,
    eventName: 'payout.processing',
    version: 1,
    entityType: 'payout',
    entityId: PAYOUT_REQUEST_ID,
    source: 'worker',
    idempotencyKey: 'idem-payout-processing',
    metadata: { scenario: 'money-flow' },
    payload: {
      organizerId: ORGANIZER_ID,
      payoutRequestId: PAYOUT_REQUEST_ID,
      payoutQuoteId: PAYOUT_QUOTE_ID,
      currentRequestedAmount: { amountMinor: params.amountMinor, currency: 'MXN' },
    },
  });
}

function payoutCompletedEvent(params: { sequence: number; occurredAt: string; settledAmountMinor: number }) {
  return parseCanonicalMoneyEventWithUpcasting({
    eventId: deterministicUuid(params.sequence),
    traceId: 'trace-payout-completed',
    occurredAt: params.occurredAt,
    recordedAt: params.occurredAt,
    eventName: 'payout.completed',
    version: 1,
    entityType: 'payout',
    entityId: PAYOUT_REQUEST_ID,
    source: 'worker',
    idempotencyKey: 'idem-payout-completed',
    metadata: { scenario: 'money-flow' },
    payload: {
      organizerId: ORGANIZER_ID,
      payoutRequestId: PAYOUT_REQUEST_ID,
      payoutQuoteId: PAYOUT_QUOTE_ID,
      settledAmount: { amountMinor: params.settledAmountMinor, currency: 'MXN' },
    },
  });
}

function walletRowsFromCanonicalEvents(events: Array<{ eventName: string; occurredAt: string; payload: unknown }>) {
  return events.map((event) => ({
    eventName: event.eventName,
    occurredAt: new Date(event.occurredAt),
    payloadJson: event.payload as Record<string, unknown>,
  }));
}

describe('payments money-flow scenarios aligned to current capabilities', () => {
  const queue: WalletEventRow[][] = [];

  beforeEach(() => {
    queue.length = 0;
    mockSelect.mockReset();
    mockSelect.mockImplementation(() => ({
      from: () => ({
        where: () => ({
          orderBy: async () => queue.shift() ?? [],
        }),
      }),
    }));
  });

  it('exposes only approve/deny organizer decision actions (no partial decision action)', () => {
    expect(organizerRefundDecisionValues).toEqual(['approve', 'deny']);
  });

  it('supports many captures, partial refund execution amount, payout adjustment, and fee invariance', async () => {
    const baseTime = new Date('2026-03-01T10:00:00.000Z');
    const paymentCount = 40;
    const grossAmountMinor = 10_000;
    const feeAmountMinor = 800;
    const netAmountMinor = 9_200;
    const refundAmountMinor = 4_600;
    const requestedPayoutMinor = 300_000;
    const adjustedPayoutMinor = requestedPayoutMinor - refundAmountMinor;

    const paymentEvents = Array.from({ length: paymentCount }, (_, index) =>
      paymentCapturedEvent({
        sequence: index + 1,
        occurredAt: at(baseTime, index),
        grossAmountMinor,
        feeAmountMinor,
        netAmountMinor,
      }),
    );

    const simulationEvents = [
      ...paymentEvents,
      refundExecutedEvent({
        sequence: 401,
        occurredAt: at(baseTime, 60),
        amountMinor: refundAmountMinor,
      }),
      payoutRequestedEvent({
        sequence: 402,
        occurredAt: at(baseTime, 61),
        amountMinor: requestedPayoutMinor,
      }),
      payoutAdjustedEvent({
        sequence: 403,
        occurredAt: at(baseTime, 62),
        previousRequestedAmountMinor: requestedPayoutMinor,
        adjustedRequestedAmountMinor: adjustedPayoutMinor,
      }),
      payoutCompletedEvent({
        sequence: 404,
        occurredAt: at(baseTime, 63),
        settledAmountMinor: adjustedPayoutMinor,
      }),
    ];

    queue.push(walletRowsFromCanonicalEvents(simulationEvents));
    const wallet = await getOrganizerWalletBucketSnapshot({
      organizerId: ORGANIZER_ID,
      now: new Date('2026-03-01T12:00:00.000Z'),
    });

    expect(wallet.buckets).toEqual({
      availableMinor: 68_000,
      processingMinor: 0,
      frozenMinor: 0,
      debtMinor: 0,
    });

    const replayWithFullFlow = replayCanonicalMoneyEvents({
      events: simulationEvents,
      mode: 'in_process',
      nodeEnv: 'test',
      runtime: 'web',
    });
    const replayWithCaptureOnly = replayCanonicalMoneyEvents({
      events: paymentEvents,
      mode: 'in_process',
      nodeEnv: 'test',
      runtime: 'web',
    });

    expect(replayWithFullFlow.projection.walletNetMinor).toBe(68_000);
    expect(replayWithCaptureOnly.projection.economicsNetFeeMinor).toBe(32_000);
    expect(replayWithFullFlow.projection.economicsNetFeeMinor).toBe(32_000);
  });

  it('keeps payout baseline when reimbursement is denied (no refund execution event)', async () => {
    const baseTime = new Date('2026-03-02T10:00:00.000Z');
    const paymentEvents = Array.from({ length: 15 }, (_, index) =>
      paymentCapturedEvent({
        sequence: 500 + index,
        occurredAt: at(baseTime, index),
        grossAmountMinor: 10_000,
        feeAmountMinor: 800,
        netAmountMinor: 9_200,
      }),
    );
    const payoutEvents = [
      payoutRequestedEvent({
        sequence: 700,
        occurredAt: at(baseTime, 40),
        amountMinor: 100_000,
      }),
      payoutCompletedEvent({
        sequence: 701,
        occurredAt: at(baseTime, 41),
        settledAmountMinor: 100_000,
      }),
    ];
    const simulationEvents = [...paymentEvents, ...payoutEvents];

    queue.push(walletRowsFromCanonicalEvents(simulationEvents));
    const wallet = await getOrganizerWalletBucketSnapshot({
      organizerId: ORGANIZER_ID,
      now: new Date('2026-03-02T12:00:00.000Z'),
    });

    expect(wallet.buckets).toEqual({
      availableMinor: 38_000,
      processingMinor: 0,
      frozenMinor: 0,
      debtMinor: 0,
    });

    const replayWithFullFlow = replayCanonicalMoneyEvents({
      events: simulationEvents,
      mode: 'in_process',
      nodeEnv: 'test',
      runtime: 'web',
    });
    const replayWithCaptureOnly = replayCanonicalMoneyEvents({
      events: paymentEvents,
      mode: 'in_process',
      nodeEnv: 'test',
      runtime: 'web',
    });

    expect(replayWithFullFlow.projection.walletNetMinor).toBe(38_000);
    expect(replayWithFullFlow.projection.economicsNetFeeMinor).toBe(12_000);
    expect(replayWithCaptureOnly.projection.economicsNetFeeMinor).toBe(12_000);
  });

  it('handles refund during payout processing with adjustment and later debt repayment', async () => {
    const baseTime = new Date('2026-03-03T10:00:00.000Z');
    const firstBatchPayments = Array.from({ length: 20 }, (_, index) =>
      paymentCapturedEvent({
        sequence: 800 + index,
        occurredAt: at(baseTime, index),
        grossAmountMinor: 10_000,
        feeAmountMinor: 800,
        netAmountMinor: 9_200,
      }),
    );

    const simulationEvents = [
      ...firstBatchPayments,
      payoutRequestedEvent({
        sequence: 900,
        occurredAt: at(baseTime, 30),
        amountMinor: 140_000,
      }),
      payoutProcessingEvent({
        sequence: 901,
        occurredAt: at(baseTime, 31),
        amountMinor: 140_000,
      }),
      refundExecutedEvent({
        sequence: 902,
        occurredAt: at(baseTime, 32),
        amountMinor: 50_000,
      }),
      payoutAdjustedEvent({
        sequence: 903,
        occurredAt: at(baseTime, 33),
        previousRequestedAmountMinor: 140_000,
        adjustedRequestedAmountMinor: 90_000,
      }),
      payoutCompletedEvent({
        sequence: 904,
        occurredAt: at(baseTime, 34),
        settledAmountMinor: 90_000,
      }),
      paymentCapturedEvent({
        sequence: 905,
        occurredAt: at(baseTime, 35),
        grossAmountMinor: 21_000,
        feeAmountMinor: 800,
        netAmountMinor: 20_200,
      }),
    ];

    queue.push(walletRowsFromCanonicalEvents(simulationEvents));
    const wallet = await getOrganizerWalletBucketSnapshot({
      organizerId: ORGANIZER_ID,
      now: new Date('2026-03-03T12:00:00.000Z'),
    });

    expect(wallet.buckets).toEqual({
      availableMinor: 64_200,
      processingMinor: 0,
      frozenMinor: 0,
      debtMinor: 0,
    });
    expect(wallet.debt.categoryBalancesMinor).toEqual({
      disputes: 0,
      refunds: 0,
      fees: 0,
    });
    expect(wallet.debt.repaymentAppliedMinor).toBe(6_000);

    const replayWithFullFlow = replayCanonicalMoneyEvents({
      events: simulationEvents,
      mode: 'in_process',
      nodeEnv: 'test',
      runtime: 'web',
    });
    const replayWithCaptureOnly = replayCanonicalMoneyEvents({
      events: [...firstBatchPayments, simulationEvents[simulationEvents.length - 1]!],
      mode: 'in_process',
      nodeEnv: 'test',
      runtime: 'web',
    });

    expect(replayWithFullFlow.projection.walletNetMinor).toBe(64_200);
    expect(replayWithFullFlow.projection.economicsNetFeeMinor).toBe(16_800);
    expect(replayWithCaptureOnly.projection.economicsNetFeeMinor).toBe(16_800);
  });
});
