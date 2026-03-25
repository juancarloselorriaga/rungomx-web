import {
  projectPaymentCaptureVolumeDelta,
  projectPaymentCaptureVolumeMetrics,
  type PaymentCaptureVolumeProjectionEvent,
} from '@/lib/payments/volume/payment-capture-volume';

describe('payment capture volume projection', () => {
  const windowStart = new Date('2026-03-01T00:00:00.000Z');
  const windowEnd = new Date('2026-03-10T23:59:59.999Z');

  function expectVolumeRowInvariant(row: {
    grossProcessedMinor: number;
    platformFeeMinor: number;
    organizerProceedsMinor: number;
  }) {
    expect(row.grossProcessedMinor).toBe(
      row.platformFeeMinor + row.organizerProceedsMinor,
    );
  }

  function buildEvent(input: {
    traceId: string;
    organizerId?: string | null;
    occurredAt: string;
    payloadJson: Record<string, unknown>;
  }): PaymentCaptureVolumeProjectionEvent {
    return {
      traceId: input.traceId,
      organizerId: input.organizerId ?? null,
      eventName: 'payment.captured',
      occurredAt: new Date(input.occurredAt),
      payloadJson: input.payloadJson,
    };
  }

  it('derives a canonical capture delta including bucket date', () => {
    const result = projectPaymentCaptureVolumeDelta(
      buildEvent({
        traceId: 'trace-1',
        organizerId: 'org-1',
        occurredAt: '2026-03-05T14:30:00.000Z',
        payloadJson: {
          organizerId: 'org-1',
          grossAmount: { amountMinor: 10_500, currency: 'MXN' },
          feeAmount: { amountMinor: 500, currency: 'MXN' },
          netAmount: { amountMinor: 10_000, currency: 'MXN' },
        },
      }),
    );

    expect(result).toEqual({
      ok: true,
      delta: {
        traceId: 'trace-1',
        organizerId: 'org-1',
        occurredAt: new Date('2026-03-05T14:30:00.000Z'),
        bucketDate: '2026-03-05',
        sourceCurrency: 'MXN',
        grossProcessedMinor: 10_500,
        platformFeeMinor: 500,
        organizerProceedsMinor: 10_000,
      },
    });
  });

  it('derives organizer identity from the canonical payload when the row scope is absent', () => {
    const result = projectPaymentCaptureVolumeDelta(
      buildEvent({
        traceId: 'trace-derived-organizer',
        organizerId: null,
        occurredAt: '2026-03-05T14:30:00.000Z',
        payloadJson: {
          organizerId: 'org-1',
          grossAmount: { amountMinor: 10_500, currency: 'MXN' },
          feeAmount: { amountMinor: 500, currency: 'MXN' },
          netAmount: { amountMinor: 10_000, currency: 'MXN' },
        },
      }),
    );

    expect(result).toEqual({
      ok: true,
      delta: expect.objectContaining({
        organizerId: 'org-1',
      }),
    });
  });

  it('excludes captures with no organizer identity for reconciliation', () => {
    const result = projectPaymentCaptureVolumeDelta(
      buildEvent({
        traceId: 'trace-missing-organizer',
        organizerId: null,
        occurredAt: '2026-03-05T14:30:00.000Z',
        payloadJson: {
          grossAmount: { amountMinor: 10_500, currency: 'MXN' },
          feeAmount: { amountMinor: 500, currency: 'MXN' },
          netAmount: { amountMinor: 10_000, currency: 'MXN' },
        },
      }),
    );

    expect(result).toEqual({
      ok: false,
      excluded: {
        traceId: 'trace-missing-organizer',
        organizerId: null,
        occurredAt: new Date('2026-03-05T14:30:00.000Z'),
        reason: 'missing_organizer_id',
      },
    });
  });

  it('excludes malformed captures when the invariant fails', () => {
    const result = projectPaymentCaptureVolumeDelta(
      buildEvent({
        traceId: 'trace-bad',
        organizerId: 'org-1',
        occurredAt: '2026-03-05T14:30:00.000Z',
        payloadJson: {
          organizerId: 'org-1',
          grossAmount: { amountMinor: 10_500, currency: 'MXN' },
          feeAmount: { amountMinor: 500, currency: 'MXN' },
          netAmount: { amountMinor: 9_500, currency: 'MXN' },
        },
      }),
    );

    expect(result).toEqual({
      ok: false,
      excluded: {
        traceId: 'trace-bad',
        organizerId: 'org-1',
        occurredAt: new Date('2026-03-05T14:30:00.000Z'),
        reason: 'math_mismatch',
      },
    });
  });

  it('projects headline, currency, organizer, and reconciliation metrics deterministically', () => {
    const result = projectPaymentCaptureVolumeMetrics({
      events: [
        buildEvent({
          traceId: 'trace-z',
          organizerId: 'org-2',
          occurredAt: '2026-03-04T12:00:00.000Z',
          payloadJson: {
            organizerId: 'org-2',
            grossAmount: { amountMinor: 20_000, currency: 'USD' },
            feeAmount: { amountMinor: 1_200, currency: 'USD' },
            netAmount: { amountMinor: 18_800, currency: 'USD' },
          },
        }),
        buildEvent({
          traceId: 'trace-a',
          organizerId: 'org-1',
          occurredAt: '2026-03-02T08:00:00.000Z',
          payloadJson: {
            organizerId: 'org-1',
            grossAmount: { amountMinor: 10_500, currency: 'MXN' },
            feeAmount: { amountMinor: 500, currency: 'MXN' },
            netAmount: { amountMinor: 10_000, currency: 'MXN' },
          },
        }),
        buildEvent({
          traceId: 'trace-bad',
          organizerId: 'org-1',
          occurredAt: '2026-03-03T09:00:00.000Z',
          payloadJson: {
            organizerId: 'org-1',
            grossAmount: { amountMinor: 11_000, currency: 'MXN' },
            feeAmount: { amountMinor: 500, currency: 'MXN' },
            netAmount: { amountMinor: 9_000, currency: 'MXN' },
          },
        }),
      ],
      windowStart,
      windowEnd,
      organizerLabels: {
        'org-1': 'Organizer One',
        'org-2': 'Organizer Two',
      },
      organizerLimit: 10,
      sampleTraceLimit: 3,
      asOf: windowEnd,
    });

    expect(result.headlineCurrency).toBe('MXN');
    expect(result.headlineGrossProcessedMinor).toBe(10_500);
    expect(result.headlinePlatformFeeMinor).toBe(500);
    expect(result.headlineOrganizerProceedsMinor).toBe(10_000);
    expect(result.headlineCaptureCount).toBe(2);
    expect(result.currencies).toEqual([
      {
        sourceCurrency: 'MXN',
        grossProcessedMinor: 10_500,
        platformFeeMinor: 500,
        organizerProceedsMinor: 10_000,
        captureCount: 1,
      },
      {
        sourceCurrency: 'USD',
        grossProcessedMinor: 20_000,
        platformFeeMinor: 1_200,
        organizerProceedsMinor: 18_800,
        captureCount: 1,
      },
    ]);
    expect(result.organizers).toEqual([
      {
        organizerId: 'org-1',
        organizerLabel: 'Organizer One',
        headlineCurrency: 'MXN',
        headlineGrossProcessedMinor: 10_500,
        headlinePlatformFeeMinor: 500,
        headlineOrganizerProceedsMinor: 10_000,
        captureCount: 1,
        currencies: [
          {
            sourceCurrency: 'MXN',
            grossProcessedMinor: 10_500,
            platformFeeMinor: 500,
            organizerProceedsMinor: 10_000,
            captureCount: 1,
          },
        ],
        traceability: {
          distinctTraceCount: 1,
          firstOccurredAt: new Date('2026-03-02T08:00:00.000Z'),
          lastOccurredAt: new Date('2026-03-02T08:00:00.000Z'),
          sampleTraceIds: ['trace-a'],
        },
      },
      {
        organizerId: 'org-2',
        organizerLabel: 'Organizer Two',
        headlineCurrency: 'USD',
        headlineGrossProcessedMinor: 20_000,
        headlinePlatformFeeMinor: 1_200,
        headlineOrganizerProceedsMinor: 18_800,
        captureCount: 1,
        currencies: [
          {
            sourceCurrency: 'USD',
            grossProcessedMinor: 20_000,
            platformFeeMinor: 1_200,
            organizerProceedsMinor: 18_800,
            captureCount: 1,
          },
        ],
        traceability: {
          distinctTraceCount: 1,
          firstOccurredAt: new Date('2026-03-04T12:00:00.000Z'),
          lastOccurredAt: new Date('2026-03-04T12:00:00.000Z'),
          sampleTraceIds: ['trace-z'],
        },
      },
    ]);
    expect(result.organizerPagination).toEqual({
      page: 1,
      pageSize: 10,
      total: 2,
      pageCount: 1,
    });
    expect(result.excludedEvents).toEqual([
      {
        traceId: 'trace-bad',
        organizerId: 'org-1',
        occurredAt: new Date('2026-03-03T09:00:00.000Z'),
        reason: 'math_mismatch',
      },
    ]);
    expect(result.traceability).toEqual({
      windowStart,
      windowEnd,
      eventCount: 3,
      distinctTraceCount: 3,
      firstOccurredAt: new Date('2026-03-02T08:00:00.000Z'),
      lastOccurredAt: new Date('2026-03-04T12:00:00.000Z'),
      sampleTraceIds: ['trace-a', 'trace-bad', 'trace-z'],
      excludedEventCount: 1,
    });

    for (const row of result.currencies) {
      expectVolumeRowInvariant(row);
    }

    for (const organizer of result.organizers) {
      expectVolumeRowInvariant({
        grossProcessedMinor: organizer.headlineGrossProcessedMinor,
        platformFeeMinor: organizer.headlinePlatformFeeMinor,
        organizerProceedsMinor: organizer.headlineOrganizerProceedsMinor,
      });
      for (const row of organizer.currencies) {
        expectVolumeRowInvariant(row);
      }
    }
  });
});
