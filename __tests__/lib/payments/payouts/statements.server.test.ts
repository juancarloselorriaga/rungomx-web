const mockFindFirstPayoutRequest = jest.fn();
const mockFindFirstPayoutQuote = jest.fn();
const mockFindFirstPayoutContract = jest.fn();
const mockSelect = jest.fn();

const selectQueue: Array<Array<Record<string, unknown>>> = [];

jest.mock('@/db', () => ({
  db: {
    query: {
      payoutRequests: {
        findFirst: (...args: unknown[]) => mockFindFirstPayoutRequest(...args),
      },
      payoutQuotes: {
        findFirst: (...args: unknown[]) => mockFindFirstPayoutQuote(...args),
      },
      payoutContracts: {
        findFirst: (...args: unknown[]) => mockFindFirstPayoutContract(...args),
      },
    },
    select: (...args: unknown[]) => mockSelect(...args),
  },
}));

import {
  generatePayoutStatementArtifact,
} from '@/lib/payments/payouts/statements';

describe('payout statement artifact generation', () => {
  const now = new Date('2026-02-25T23:15:00.000Z');
  const organizerId = '11111111-1111-4111-8111-111111111111';
  const payoutRequestId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  beforeEach(() => {
    selectQueue.length = 0;

    mockFindFirstPayoutRequest.mockReset();
    mockFindFirstPayoutQuote.mockReset();
    mockFindFirstPayoutContract.mockReset();
    mockSelect.mockReset();

    mockFindFirstPayoutRequest.mockResolvedValue({
      id: payoutRequestId,
      organizerId,
      payoutQuoteId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      status: 'completed',
      traceId: 'payout-request:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      lifecycleContextJson: {
        currentRequestedAmountMinor: 8000,
      },
    });

    mockFindFirstPayoutQuote.mockResolvedValue({
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      quoteFingerprint: 'f'.repeat(64),
      requestedAt: new Date('2026-02-25T20:00:00.000Z'),
      includedAmountMinor: 12000,
      deductionAmountMinor: 2000,
      maxWithdrawableAmountMinor: 10000,
      requestedAmountMinor: 10000,
      componentBreakdownJson: {
        version: 'payout-quote-components-v1',
        items: [
          { label: 'available_balance', amountMinor: 12000 },
          { label: 'debt_holdback', amountMinor: -2000 },
        ],
      },
    });

    mockFindFirstPayoutContract.mockResolvedValue({
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    });

    mockSelect.mockImplementation(() => ({
      from: () => ({
        where: () => ({
          orderBy: async () => selectQueue.shift() ?? [],
        }),
      }),
    }));
  });

  it('builds statement with quote reference, component breakdown, and adjustment lines', async () => {
    selectQueue.push([
      {
        id: 'event-adjust-1',
        traceId: 'payout-lifecycle:trace-1',
        eventName: 'payout.adjusted',
        occurredAt: new Date('2026-02-25T21:00:00.000Z'),
        payloadJson: {
          previousRequestedAmount: { amountMinor: 10000, currency: 'MXN' },
          adjustedRequestedAmount: { amountMinor: 8000, currency: 'MXN' },
          reasonCode: 'high_risk_dispute_signal',
        },
      },
      {
        id: 'event-complete-1',
        traceId: 'payout-lifecycle:trace-2',
        eventName: 'payout.completed',
        occurredAt: new Date('2026-02-25T21:10:00.000Z'),
        payloadJson: {
          settledAmount: { amountMinor: 8000, currency: 'MXN' },
        },
      },
    ]);

    const result = await generatePayoutStatementArtifact({
      organizerId,
      payoutRequestId,
      now,
    });

    expect(result.payoutStatus).toBe('completed');
    expect(result.quoteReference.quoteFingerprint).toBe('f'.repeat(64));
    expect(result.quoteReference.requestedAmountMinor).toBe(10000);
    expect(result.componentBreakdown).toMatchObject({
      version: 'payout-quote-components-v1',
    });
    expect(result.adjustmentLines).toEqual([
      {
        eventId: 'event-adjust-1',
        traceId: 'payout-lifecycle:trace-1',
        occurredAt: new Date('2026-02-25T21:00:00.000Z'),
        reasonCode: 'high_risk_dispute_signal',
        previousRequestedAmountMinor: 10000,
        adjustedRequestedAmountMinor: 8000,
        deltaMinor: 2000,
      },
    ]);
    expect(result.adjustmentTotalMinor).toBe(2000);
    expect(result.originalRequestedAmountMinor).toBe(10000);
    expect(result.currentRequestedAmountMinor).toBe(8000);
    expect(result.terminalAmountMinor).toBe(8000);
    expect(result.accessReference.traceId).toBe('payout-request:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    expect(result.accessReference.href).toContain(`/api/payments/payouts/${payoutRequestId}/statement`);
    expect(result.deliveryReference.traceId).toContain('payout-statement-delivery:payout-request:');
    expect(result.payoutStatementId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(result.statementFingerprint).toHaveLength(64);
  });

  it('supports failed terminal payouts when terminal amount is sourced from payout.failed events', async () => {
    mockFindFirstPayoutRequest.mockResolvedValueOnce({
      id: payoutRequestId,
      organizerId,
      payoutQuoteId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      status: 'failed',
      traceId: 'payout-request:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      lifecycleContextJson: {},
    });

    selectQueue.push([
      {
        id: 'event-failed-1',
        traceId: 'payout-lifecycle:trace-failed',
        eventName: 'payout.failed',
        occurredAt: new Date('2026-02-25T21:15:00.000Z'),
        payloadJson: {
          failedAmount: { amountMinor: 9000, currency: 'MXN' },
          reasonCode: 'bank_rejection',
        },
      },
    ]);

    const result = await generatePayoutStatementArtifact({
      organizerId,
      payoutRequestId,
      now,
    });

    expect(result.payoutStatus).toBe('failed');
    expect(result.currentRequestedAmountMinor).toBe(10000);
    expect(result.terminalAmountMinor).toBe(9000);
    expect(result.adjustmentLines).toEqual([]);
  });

  it('rejects statement generation when payout status is not terminal', async () => {
    mockFindFirstPayoutRequest.mockResolvedValueOnce({
      id: payoutRequestId,
      organizerId,
      payoutQuoteId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      status: 'processing',
      traceId: 'payout-request:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      lifecycleContextJson: {},
    });

    await expect(
      generatePayoutStatementArtifact({
        organizerId,
        payoutRequestId,
        now,
      }),
    ).rejects.toMatchObject({
      code: 'PAYOUT_STATEMENT_STATUS_NOT_TERMINAL',
    });

    expect(mockFindFirstPayoutQuote).not.toHaveBeenCalled();
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it('rejects when payout request is missing for organizer scope', async () => {
    mockFindFirstPayoutRequest.mockResolvedValueOnce(null);

    await expect(
      generatePayoutStatementArtifact({
        organizerId,
        payoutRequestId,
        now,
      }),
    ).rejects.toMatchObject({
      code: 'PAYOUT_STATEMENT_NOT_FOUND',
    });
  });

  it('rejects when quote/contract baseline is incomplete', async () => {
    mockFindFirstPayoutContract.mockResolvedValueOnce(null);
    selectQueue.push([]);

    await expect(
      generatePayoutStatementArtifact({
        organizerId,
        payoutRequestId,
        now,
      }),
    ).rejects.toMatchObject({
      code: 'PAYOUT_STATEMENT_BASELINE_INCOMPLETE',
    });
  });
});
