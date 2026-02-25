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
    expect(result!.reasonText).toContain('captured');
    expect(result!.impactedEntities).toEqual(
      expect.arrayContaining([
        {
          entityType: 'registration',
          entityId: 'registration-1',
          label: 'Primary financial entity',
        },
      ]),
    );
    expect(result!.impactedEntities).toHaveLength(1);
    expect(result!.evidenceReferences).toEqual(
      expect.arrayContaining([
        {
          kind: 'trace',
          label: 'Trace reference',
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
    expect(result!.reasonText).toContain('balance-impacting');
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
    expect(result!.reasonText).toContain('decreased');
    expect(result!.policyDisclosure).toContain('decrease-only');
    expect(result!.impactedEntities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityType: 'payout_request',
          entityId: 'payout-request-1',
        }),
      ]),
    );
  });
});
