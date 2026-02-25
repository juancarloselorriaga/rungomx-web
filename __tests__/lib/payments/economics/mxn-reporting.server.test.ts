import {
  projectMxnNetRecognizedFeeReport,
  type MxnReportingFxSnapshot,
  type MxnReportingProjectionEvent,
} from '@/lib/payments/economics/mxn-reporting';

describe('deterministic MXN reporting from event-time FX snapshots', () => {
  const windowStart = new Date('2026-02-01T00:00:00.000Z');
  const windowEnd = new Date('2026-02-10T23:59:59.999Z');

  function buildEvent(input: {
    traceId: string;
    eventName: MxnReportingProjectionEvent['eventName'];
    occurredAt: string;
    payloadJson: Record<string, unknown>;
  }): MxnReportingProjectionEvent {
    return {
      traceId: input.traceId,
      eventName: input.eventName,
      occurredAt: new Date(input.occurredAt),
      payloadJson: input.payloadJson,
    };
  }

  function buildSnapshots(): MxnReportingFxSnapshot[] {
    return [
      {
        snapshotId: 'usd-2026-01-01',
        sourceCurrency: 'USD',
        rateToMxn: 17,
        effectiveAt: new Date('2026-01-01T00:00:00.000Z'),
      },
      {
        snapshotId: 'usd-2026-02-01',
        sourceCurrency: 'USD',
        rateToMxn: 18,
        effectiveAt: new Date('2026-02-01T00:00:00.000Z'),
      },
      {
        snapshotId: 'eur-2026-01-01',
        sourceCurrency: 'EUR',
        rateToMxn: 19,
        effectiveAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ];
  }

  it('converts source-currency events to MXN using event-time snapshots and flags missing snapshots', () => {
    const result = projectMxnNetRecognizedFeeReport({
      events: [
        buildEvent({
          traceId: 'trace-usd-1',
          eventName: 'payment.captured',
          occurredAt: '2026-01-15T10:00:00.000Z',
          payloadJson: {
            feeAmount: { amountMinor: 1000, currency: 'USD' },
          },
        }),
        buildEvent({
          traceId: 'trace-usd-2',
          eventName: 'financial.adjustment_posted',
          occurredAt: '2026-02-05T10:00:00.000Z',
          payloadJson: {
            amount: { amountMinor: -200, currency: 'USD' },
          },
        }),
        buildEvent({
          traceId: 'trace-eur-1',
          eventName: 'payment.captured',
          occurredAt: '2026-02-03T10:00:00.000Z',
          payloadJson: {
            feeAmount: { amountMinor: 500, currency: 'EUR' },
          },
        }),
        buildEvent({
          traceId: 'trace-brl-1',
          eventName: 'payment.captured',
          occurredAt: '2026-02-03T11:00:00.000Z',
          payloadJson: {
            feeAmount: { amountMinor: 300, currency: 'BRL' },
          },
        }),
        buildEvent({
          traceId: 'trace-mxn-1',
          eventName: 'financial.adjustment_posted',
          occurredAt: '2026-02-04T10:00:00.000Z',
          payloadJson: {
            amount: { amountMinor: 100, currency: 'MXN' },
          },
        }),
      ],
      snapshots: buildSnapshots(),
      windowStart,
      windowEnd,
      asOf: windowEnd,
    });

    expect(result.headlineMxnNetRecognizedFeeMinor).toBe(23000);
    expect(result.convertedEventCount).toBe(4);
    expect(result.missingSnapshotEventCount).toBe(1);

    expect(result.currencies).toEqual([
      {
        sourceCurrency: 'BRL',
        sourceNetRecognizedFeeMinor: 300,
        mxnNetRecognizedFeeMinor: null,
        convertedEventCount: 0,
        missingSnapshotEventCount: 1,
        appliedSnapshots: [],
        sampleMissingSnapshotTraceIds: ['trace-brl-1'],
      },
      {
        sourceCurrency: 'EUR',
        sourceNetRecognizedFeeMinor: 500,
        mxnNetRecognizedFeeMinor: 9500,
        convertedEventCount: 1,
        missingSnapshotEventCount: 0,
        appliedSnapshots: [
          {
            snapshotId: 'eur-2026-01-01',
            sourceCurrency: 'EUR',
            rateToMxn: 19,
            effectiveAt: new Date('2026-01-01T00:00:00.000Z'),
          },
        ],
        sampleMissingSnapshotTraceIds: [],
      },
      {
        sourceCurrency: 'MXN',
        sourceNetRecognizedFeeMinor: 100,
        mxnNetRecognizedFeeMinor: 100,
        convertedEventCount: 1,
        missingSnapshotEventCount: 0,
        appliedSnapshots: [
          {
            snapshotId: 'native:mxn',
            sourceCurrency: 'MXN',
            rateToMxn: 1,
            effectiveAt: new Date('2026-02-04T10:00:00.000Z'),
          },
        ],
        sampleMissingSnapshotTraceIds: [],
      },
      {
        sourceCurrency: 'USD',
        sourceNetRecognizedFeeMinor: 800,
        mxnNetRecognizedFeeMinor: 13400,
        convertedEventCount: 2,
        missingSnapshotEventCount: 0,
        appliedSnapshots: [
          {
            snapshotId: 'usd-2026-01-01',
            sourceCurrency: 'USD',
            rateToMxn: 17,
            effectiveAt: new Date('2026-01-01T00:00:00.000Z'),
          },
          {
            snapshotId: 'usd-2026-02-01',
            sourceCurrency: 'USD',
            rateToMxn: 18,
            effectiveAt: new Date('2026-02-01T00:00:00.000Z'),
          },
        ],
        sampleMissingSnapshotTraceIds: [],
      },
    ]);
  });

  it('remains deterministic for equivalent shuffled inputs', () => {
    const snapshots = buildSnapshots();
    const orderedEvents: MxnReportingProjectionEvent[] = [
      buildEvent({
        traceId: 'trace-a',
        eventName: 'payment.captured',
        occurredAt: '2026-02-01T10:00:00.000Z',
        payloadJson: {
          feeAmount: { amountMinor: 1000, currency: 'USD' },
        },
      }),
      buildEvent({
        traceId: 'trace-b',
        eventName: 'financial.adjustment_posted',
        occurredAt: '2026-02-02T10:00:00.000Z',
        payloadJson: {
          amount: { amountMinor: -100, currency: 'USD' },
        },
      }),
      buildEvent({
        traceId: 'trace-c',
        eventName: 'payment.captured',
        occurredAt: '2026-02-03T10:00:00.000Z',
        payloadJson: {
          feeAmount: { amountMinor: 500, currency: 'EUR' },
        },
      }),
    ];

    const shuffledEvents = [orderedEvents[2]!, orderedEvents[0]!, orderedEvents[1]!];

    const first = projectMxnNetRecognizedFeeReport({
      events: orderedEvents,
      snapshots,
      windowStart,
      windowEnd,
      asOf: windowEnd,
    });

    const second = projectMxnNetRecognizedFeeReport({
      events: shuffledEvents,
      snapshots,
      windowStart,
      windowEnd,
      asOf: windowEnd,
    });

    expect(second).toEqual(first);
  });
});
