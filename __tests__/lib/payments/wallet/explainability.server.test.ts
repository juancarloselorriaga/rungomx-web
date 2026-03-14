const mockSelect = jest.fn();

jest.mock('@/db', () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
  },
}));

import { getOrganizerWalletExplainability } from '@/lib/payments/wallet/explainability';

describe('payments wallet explainability', () => {
  const queue: Array<Array<Record<string, unknown>>> = [];

  beforeEach(() => {
    queue.length = 0;
    mockSelect.mockReset();
    mockSelect.mockImplementation(() => ({
      from: () => ({
        where: async () => queue.shift() ?? [],
      }),
    }));
  });

  it('returns plain-language reason text and evidence references for payment capture events', async () => {
    queue.push([
      {
        id: '11111111-1111-4111-8111-111111111111',
        organizerId: '22222222-2222-4222-8222-222222222222',
        traceId: 'trace-pay-1',
        eventName: 'payment.captured',
        entityType: 'registration',
        entityId: 'registration-1',
        payloadJson: {
          registrationId: 'registration-1',
          netAmount: { amountMinor: 9500, currency: 'MXN' },
        },
      },
    ]);

    const result = await getOrganizerWalletExplainability({
      organizerId: '22222222-2222-4222-8222-222222222222',
      eventId: '11111111-1111-4111-8111-111111111111',
    });

    expect(result).not.toBeNull();
    expect(result!.eventName).toBe('payment.captured');
    expect(result!.reasonText).toContain('cleared');
    expect(result!.impactedEntities).toEqual(
      expect.arrayContaining([
        {
          entityType: 'registration',
          entityId: 'registration-1',
          label: 'Primary record',
        },
      ]),
    );
    expect(result!.impactedEntities).toHaveLength(1);
    expect(result!.evidenceReferences).toEqual(
      expect.arrayContaining([
        {
          kind: 'trace',
          label: 'Trace',
          value: 'trace-pay-1',
        },
      ]),
    );
  });

  it('falls back to deterministic unknown event naming when event type is not registered', async () => {
    queue.push([
      {
        id: '33333333-3333-4333-8333-333333333333',
        organizerId: '22222222-2222-4222-8222-222222222222',
        traceId: 'trace-unknown-1',
        eventName: 'custom.future_event',
        entityType: 'adjustment',
        entityId: 'adjustment-1',
        payloadJson: {},
      },
    ]);

    const result = await getOrganizerWalletExplainability({
      organizerId: '22222222-2222-4222-8222-222222222222',
      eventId: '33333333-3333-4333-8333-333333333333',
    });

    expect(result).not.toBeNull();
    expect(result!.eventName).toBe('financial.unknown');
    expect(result!.reasonText).toContain('balance-affecting');
  });

  it('describes positive financial adjustments as balance-increasing corrections', async () => {
    queue.push([
      {
        id: '66666666-6666-4666-8666-666666666666',
        organizerId: '22222222-2222-4222-8222-222222222222',
        traceId: 'trace-adjustment-positive-1',
        eventName: 'financial.adjustment_posted',
        entityType: 'adjustment',
        entityId: 'adjustment-positive-1',
        payloadJson: {
          amount: { amountMinor: 250, currency: 'MXN' },
        },
      },
    ]);

    const result = await getOrganizerWalletExplainability({
      organizerId: '22222222-2222-4222-8222-222222222222',
      eventId: '66666666-6666-4666-8666-666666666666',
    });

    expect(result).not.toBeNull();
    expect(result!.reasonText).toContain('positive balance adjustment');
    expect(result!.policyDisclosure).toContain('Manual balance adjustments');
  });

  it('describes negative financial adjustments as debt-increasing corrections', async () => {
    queue.push([
      {
        id: '77777777-7777-4777-8777-777777777777',
        organizerId: '22222222-2222-4222-8222-222222222222',
        traceId: 'trace-adjustment-negative-1',
        eventName: 'financial.adjustment_posted',
        entityType: 'adjustment',
        entityId: 'adjustment-negative-1',
        payloadJson: {
          amount: { amountMinor: -250, currency: 'MXN' },
        },
      },
    ]);

    const result = await getOrganizerWalletExplainability({
      organizerId: '22222222-2222-4222-8222-222222222222',
      eventId: '77777777-7777-4777-8777-777777777777',
    });

    expect(result).not.toBeNull();
    expect(result!.reasonText).toContain('negative balance adjustment');
  });

  it('returns null when event is not found for organizer scope', async () => {
    queue.push([]);

    const result = await getOrganizerWalletExplainability({
      organizerId: '22222222-2222-4222-8222-222222222222',
      eventId: '44444444-4444-4444-8444-444444444444',
    });

    expect(result).toBeNull();
  });

  it('describes payout adjustment events with decrease-only policy wording', async () => {
    queue.push([
      {
        id: '55555555-5555-4555-8555-555555555555',
        organizerId: '22222222-2222-4222-8222-222222222222',
        traceId: 'trace-payout-adjusted-1',
        eventName: 'payout.adjusted',
        entityType: 'payout',
        entityId: 'payout-1',
        payloadJson: {
          organizerId: '22222222-2222-4222-8222-222222222222',
          payoutRequestId: 'payout-request-1',
          previousRequestedAmount: { amountMinor: 12000, currency: 'MXN' },
          adjustedRequestedAmount: { amountMinor: 10000, currency: 'MXN' },
          reasonCode: 'high_risk_dispute_signal',
        },
      },
    ]);

    const result = await getOrganizerWalletExplainability({
      organizerId: '22222222-2222-4222-8222-222222222222',
      eventId: '55555555-5555-4555-8555-555555555555',
    });

    expect(result).not.toBeNull();
    expect(result!.eventName).toBe('payout.adjusted');
    expect(result!.reasonText).toContain('reduced during review');
    expect(result!.policyDisclosure).toContain('only reduce');
    expect(result!.impactedEntities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityType: 'payout_request',
          entityId: 'payout-request-1',
        }),
      ]),
    );
  });

  it('derives and de-duplicates impacted entities from payload references', async () => {
    queue.push([
      {
        id: '88888888-8888-4888-8888-888888888888',
        organizerId: '22222222-2222-4222-8222-222222222222',
        traceId: 'trace-entity-dedupe-1',
        eventName: 'refund.executed',
        entityType: 'payout_request',
        entityId: 'payout-request-1',
        payloadJson: {
          registrationId: 'registration-1',
          refundRequestId: 'refund-request-1',
          payoutRequestId: 'payout-request-1',
          payoutQueuedIntentId: 'queued-intent-1',
          disputeCaseId: 'dispute-case-1',
        },
      },
    ]);

    const result = await getOrganizerWalletExplainability({
      organizerId: '22222222-2222-4222-8222-222222222222',
      eventId: '88888888-8888-4888-8888-888888888888',
    });

    expect(result).not.toBeNull();
    expect(result!.impactedEntities).toEqual(
      expect.arrayContaining([
        {
          entityType: 'payout_request',
          entityId: 'payout-request-1',
          label: 'Primary record',
        },
        {
          entityType: 'registration',
          entityId: 'registration-1',
          label: 'Registration',
        },
        {
          entityType: 'refund_request',
          entityId: 'refund-request-1',
          label: 'Refund request',
        },
        {
          entityType: 'payout_queued_intent',
          entityId: 'queued-intent-1',
          label: 'Queued payout',
        },
        {
          entityType: 'dispute_case',
          entityId: 'dispute-case-1',
          label: 'Dispute case',
        },
      ]),
    );
    expect(
      result!.impactedEntities.filter(
        (entity) => entity.entityType === 'payout_request' && entity.entityId === 'payout-request-1',
      ),
    ).toHaveLength(1);
  });
});
