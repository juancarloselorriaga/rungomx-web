import {
  projectNetRecognizedFeeMetrics,
  type NetRecognizedFeeProjectionEvent,
} from '@/lib/payments/economics/net-recognized-fees';

describe('net recognized fee economics projection', () => {
  const windowStart = new Date('2026-02-01T00:00:00.000Z');
  const windowEnd = new Date('2026-02-10T23:59:59.999Z');

  function buildEvent(input: {
    traceId: string;
    eventName: NetRecognizedFeeProjectionEvent['eventName'];
    occurredAt: string;
    payloadJson: Record<string, unknown>;
  }): NetRecognizedFeeProjectionEvent {
    return {
      traceId: input.traceId,
      eventName: input.eventName,
      occurredAt: new Date(input.occurredAt),
      payloadJson: input.payloadJson,
    };
  }

  it('projects deterministic net recognized fee totals with adjustment context', () => {
    const events: NetRecognizedFeeProjectionEvent[] = [
      buildEvent({
        traceId: 'trace-fee-2',
        eventName: 'payment.captured',
        occurredAt: '2026-02-02T10:00:00.000Z',
        payloadJson: {
          feeAmount: { amountMinor: 200, currency: 'MXN' },
        },
      }),
      buildEvent({
        traceId: 'trace-adjustment-1',
        eventName: 'financial.adjustment_posted',
        occurredAt: '2026-02-03T10:00:00.000Z',
        payloadJson: {
          adjustmentCode: 'manual_fee_correction',
          amount: { amountMinor: -50, currency: 'MXN' },
        },
      }),
      buildEvent({
        traceId: 'trace-fee-1',
        eventName: 'payment.captured',
        occurredAt: '2026-02-01T10:00:00.000Z',
        payloadJson: {
          feeAmount: { amountMinor: 100, currency: 'MXN' },
        },
      }),
      buildEvent({
        traceId: 'trace-adjustment-2',
        eventName: 'financial.adjustment_posted',
        occurredAt: '2026-02-04T10:00:00.000Z',
        payloadJson: {
          adjustmentCode: 'promo_offset',
          amount: { amountMinor: 25, currency: 'MXN' },
        },
      }),
    ];

    const result = projectNetRecognizedFeeMetrics({
      events,
      windowStart,
      windowEnd,
      asOf: windowEnd,
    });

    expect(result.headlineCurrency).toBe('MXN');
    expect(result.headlineCapturedFeeMinor).toBe(300);
    expect(result.headlineAdjustmentsMinor).toBe(-25);
    expect(result.headlineNetRecognizedFeeMinor).toBe(275);
    expect(result.currencies).toEqual([
      {
        currency: 'MXN',
        capturedFeeMinor: 300,
        adjustmentsMinor: -25,
        netRecognizedFeeMinor: 275,
        captureEventCount: 2,
        adjustmentEventCount: 2,
      },
    ]);
    expect(result.adjustments).toEqual([
      {
        currency: 'MXN',
        adjustmentCode: 'manual_fee_correction',
        amountMinor: -50,
        eventCount: 1,
      },
      {
        currency: 'MXN',
        adjustmentCode: 'promo_offset',
        amountMinor: 25,
        eventCount: 1,
      },
    ]);
  });

  it('stays deterministic for equivalent shuffled event inputs', () => {
    const orderedEvents: NetRecognizedFeeProjectionEvent[] = [
      buildEvent({
        traceId: 'trace-1',
        eventName: 'payment.captured',
        occurredAt: '2026-02-01T10:00:00.000Z',
        payloadJson: { feeAmount: { amountMinor: 300, currency: 'MXN' } },
      }),
      buildEvent({
        traceId: 'trace-2',
        eventName: 'financial.adjustment_posted',
        occurredAt: '2026-02-02T10:00:00.000Z',
        payloadJson: {
          adjustmentCode: 'manual_fee_correction',
          amount: { amountMinor: -75, currency: 'MXN' },
        },
      }),
      buildEvent({
        traceId: 'trace-3',
        eventName: 'payment.captured',
        occurredAt: '2026-02-03T10:00:00.000Z',
        payloadJson: { feeAmount: { amountMinor: 150, currency: 'MXN' } },
      }),
    ];

    const shuffledEvents = [orderedEvents[2]!, orderedEvents[0]!, orderedEvents[1]!];

    const first = projectNetRecognizedFeeMetrics({
      events: orderedEvents,
      windowStart,
      windowEnd,
      asOf: windowEnd,
    });
    const second = projectNetRecognizedFeeMetrics({
      events: shuffledEvents,
      windowStart,
      windowEnd,
      asOf: windowEnd,
    });

    expect(second).toEqual(first);
  });

  it('includes traceable source window metadata and sampled traces', () => {
    const events: NetRecognizedFeeProjectionEvent[] = [
      buildEvent({
        traceId: 'trace-c',
        eventName: 'payment.captured',
        occurredAt: '2026-02-03T10:00:00.000Z',
        payloadJson: { feeAmount: { amountMinor: 100, currency: 'USD' } },
      }),
      buildEvent({
        traceId: 'trace-a',
        eventName: 'payment.captured',
        occurredAt: '2026-02-01T10:00:00.000Z',
        payloadJson: { feeAmount: { amountMinor: 200, currency: 'USD' } },
      }),
      buildEvent({
        traceId: 'trace-b',
        eventName: 'financial.adjustment_posted',
        occurredAt: '2026-02-02T10:00:00.000Z',
        payloadJson: {
          adjustmentCode: 'retro_adjustment',
          amount: { amountMinor: 30, currency: 'USD' },
        },
      }),
    ];

    const result = projectNetRecognizedFeeMetrics({
      events,
      windowStart,
      windowEnd,
      asOf: windowEnd,
      sampleTraceLimit: 2,
    });

    expect(result.traceability).toEqual({
      windowStart,
      windowEnd,
      eventCount: 3,
      distinctTraceCount: 3,
      firstOccurredAt: new Date('2026-02-01T10:00:00.000Z'),
      lastOccurredAt: new Date('2026-02-03T10:00:00.000Z'),
      sampleTraceIds: ['trace-a', 'trace-b'],
    });
  });
});
