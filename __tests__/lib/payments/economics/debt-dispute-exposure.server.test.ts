import {
  projectDebtDisputeExposureMetrics,
  type DebtDisputeExposureProjectionEvent,
} from '@/lib/payments/economics/debt-dispute-exposure';

describe('debt and dispute exposure concentration projection', () => {
  const windowStart = new Date('2026-02-01T00:00:00.000Z');
  const windowEnd = new Date('2026-02-10T23:59:59.999Z');

  function buildEvent(input: {
    traceId: string;
    organizerId?: string | null;
    eventName: DebtDisputeExposureProjectionEvent['eventName'];
    occurredAt: string;
    payloadJson: Record<string, unknown>;
    entityType?: string;
    entityId?: string;
  }): DebtDisputeExposureProjectionEvent {
    return {
      traceId: input.traceId,
      organizerId: input.organizerId ?? null,
      eventName: input.eventName,
      occurredAt: new Date(input.occurredAt),
      payloadJson: input.payloadJson,
      entityType: input.entityType ?? 'dispute',
      entityId: input.entityId ?? '11111111-1111-4111-8111-111111111111',
    };
  }

  it('projects organizer and event concentration with trace-linked drilldowns', () => {
    const case1Id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const case2Id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

    const events: DebtDisputeExposureProjectionEvent[] = [
      buildEvent({
        traceId: 'trace-03-funds-released',
        organizerId: '11111111-1111-4111-8111-111111111111',
        eventName: 'dispute.funds_released',
        occurredAt: '2026-02-03T10:00:00.000Z',
        payloadJson: {
          disputeCaseId: case1Id,
          registrationId: 'r1',
          amountReleased: { amountMinor: 600, currency: 'MXN' },
        },
        entityId: case1Id,
      }),
      buildEvent({
        traceId: 'trace-01-opened',
        organizerId: '11111111-1111-4111-8111-111111111111',
        eventName: 'dispute.opened',
        occurredAt: '2026-02-01T10:00:00.000Z',
        payloadJson: {
          disputeCaseId: case1Id,
          registrationId: 'r1',
          amountAtRisk: { amountMinor: 1000, currency: 'MXN' },
        },
        entityId: case1Id,
      }),
      buildEvent({
        traceId: 'trace-02-debt-posted',
        organizerId: '11111111-1111-4111-8111-111111111111',
        eventName: 'dispute.debt_posted',
        occurredAt: '2026-02-02T10:00:00.000Z',
        payloadJson: {
          disputeCaseId: case1Id,
          registrationId: 'r1',
          debtAmount: { amountMinor: 500, currency: 'MXN' },
        },
        entityId: case1Id,
      }),
      buildEvent({
        traceId: 'trace-04-opened',
        organizerId: '22222222-2222-4222-8222-222222222222',
        eventName: 'dispute.opened',
        occurredAt: '2026-02-04T10:00:00.000Z',
        payloadJson: {
          disputeCaseId: case2Id,
          registrationId: 'r2',
          amountAtRisk: { amountMinor: 800, currency: 'MXN' },
        },
        entityId: case2Id,
      }),
      buildEvent({
        traceId: 'trace-05-pause-required',
        organizerId: '22222222-2222-4222-8222-222222222222',
        eventName: 'debt_control.pause_required',
        occurredAt: '2026-02-05T10:00:00.000Z',
        payloadJson: {
          organizerId: '22222222-2222-4222-8222-222222222222',
          affectedEditionIds: ['e2'],
        },
        entityType: 'debt_policy',
        entityId: '22222222-2222-4222-8222-222222222222',
      }),
      buildEvent({
        traceId: 'trace-06-resume-allowed',
        organizerId: '22222222-2222-4222-8222-222222222222',
        eventName: 'debt_control.resume_allowed',
        occurredAt: '2026-02-06T10:00:00.000Z',
        payloadJson: {
          organizerId: '22222222-2222-4222-8222-222222222222',
          affectedEditionIds: ['e2'],
        },
        entityType: 'debt_policy',
        entityId: '22222222-2222-4222-8222-222222222222',
      }),
    ];

    const result = projectDebtDisputeExposureMetrics({
      events,
      windowStart,
      windowEnd,
      asOf: windowEnd,
      organizerLabels: {
        '11111111-1111-4111-8111-111111111111': 'Organizer One',
        '22222222-2222-4222-8222-222222222222': 'Organizer Two',
      },
      eventLabels: {
        e1: 'Event One 2026',
        e2: 'Event Two 2026',
      },
      registrationToEditionId: {
        r1: 'e1',
        r2: 'e2',
      },
      sampleTraceLimit: 3,
      sampleCaseLimit: 3,
    });

    expect(result.totals).toEqual({
      openDisputeCaseCount: 2,
      pauseRequiredCount: 1,
      resumeAllowedCount: 1,
      headlineCurrency: 'MXN',
      headlineOpenDisputeAtRiskMinor: 1200,
      headlineDebtPostedMinor: 500,
      headlineExposureScoreMinor: 1700,
      currencies: [
        {
          currency: 'MXN',
          openDisputeAtRiskMinor: 1200,
          debtPostedMinor: 500,
          exposureScoreMinor: 1700,
        },
      ],
    });

    expect(result.organizers).toEqual([
      {
        organizerId: '11111111-1111-4111-8111-111111111111',
        organizerLabel: 'Organizer One',
        openDisputeCaseCount: 1,
        pauseRequiredCount: 0,
        resumeAllowedCount: 0,
        headlineCurrency: 'MXN',
        headlineOpenDisputeAtRiskMinor: 400,
        headlineDebtPostedMinor: 500,
        headlineExposureScoreMinor: 900,
        currencies: [
          {
            currency: 'MXN',
            openDisputeAtRiskMinor: 400,
            debtPostedMinor: 500,
            exposureScoreMinor: 900,
          },
        ],
        traceability: {
          distinctTraceCount: 3,
          distinctDisputeCaseCount: 1,
          sampleTraceIds: [
            'trace-01-opened',
            'trace-02-debt-posted',
            'trace-03-funds-released',
          ],
          sampleDisputeCaseIds: [case1Id],
        },
      },
      {
        organizerId: '22222222-2222-4222-8222-222222222222',
        organizerLabel: 'Organizer Two',
        openDisputeCaseCount: 1,
        pauseRequiredCount: 1,
        resumeAllowedCount: 1,
        headlineCurrency: 'MXN',
        headlineOpenDisputeAtRiskMinor: 800,
        headlineDebtPostedMinor: 0,
        headlineExposureScoreMinor: 800,
        currencies: [
          {
            currency: 'MXN',
            openDisputeAtRiskMinor: 800,
            debtPostedMinor: 0,
            exposureScoreMinor: 800,
          },
        ],
        traceability: {
          distinctTraceCount: 3,
          distinctDisputeCaseCount: 1,
          sampleTraceIds: [
            'trace-04-opened',
            'trace-05-pause-required',
            'trace-06-resume-allowed',
          ],
          sampleDisputeCaseIds: [case2Id],
        },
      },
    ]);

    expect(result.events).toEqual([
      {
        eventEditionId: 'e1',
        eventLabel: 'Event One 2026',
        openDisputeCaseCount: 1,
        pauseRequiredCount: 0,
        resumeAllowedCount: 0,
        headlineCurrency: 'MXN',
        headlineOpenDisputeAtRiskMinor: 400,
        headlineDebtPostedMinor: 500,
        headlineExposureScoreMinor: 900,
        currencies: [
          {
            currency: 'MXN',
            openDisputeAtRiskMinor: 400,
            debtPostedMinor: 500,
            exposureScoreMinor: 900,
          },
        ],
        traceability: {
          distinctTraceCount: 3,
          distinctDisputeCaseCount: 1,
          sampleTraceIds: [
            'trace-01-opened',
            'trace-02-debt-posted',
            'trace-03-funds-released',
          ],
          sampleDisputeCaseIds: [case1Id],
        },
      },
      {
        eventEditionId: 'e2',
        eventLabel: 'Event Two 2026',
        openDisputeCaseCount: 1,
        pauseRequiredCount: 1,
        resumeAllowedCount: 1,
        headlineCurrency: 'MXN',
        headlineOpenDisputeAtRiskMinor: 800,
        headlineDebtPostedMinor: 0,
        headlineExposureScoreMinor: 800,
        currencies: [
          {
            currency: 'MXN',
            openDisputeAtRiskMinor: 800,
            debtPostedMinor: 0,
            exposureScoreMinor: 800,
          },
        ],
        traceability: {
          distinctTraceCount: 3,
          distinctDisputeCaseCount: 1,
          sampleTraceIds: [
            'trace-04-opened',
            'trace-05-pause-required',
            'trace-06-resume-allowed',
          ],
          sampleDisputeCaseIds: [case2Id],
        },
      },
    ]);
  });

  it('stays deterministic for equivalent shuffled inputs', () => {
    const orderedEvents: DebtDisputeExposureProjectionEvent[] = [
      buildEvent({
        traceId: 'trace-a',
        organizerId: '11111111-1111-4111-8111-111111111111',
        eventName: 'dispute.opened',
        occurredAt: '2026-02-01T10:00:00.000Z',
        payloadJson: {
          disputeCaseId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          registrationId: 'r1',
          amountAtRisk: { amountMinor: 1000, currency: 'MXN' },
        },
        entityId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      }),
      buildEvent({
        traceId: 'trace-b',
        organizerId: '11111111-1111-4111-8111-111111111111',
        eventName: 'dispute.debt_posted',
        occurredAt: '2026-02-02T10:00:00.000Z',
        payloadJson: {
          disputeCaseId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          registrationId: 'r1',
          debtAmount: { amountMinor: 300, currency: 'MXN' },
        },
        entityId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      }),
      buildEvent({
        traceId: 'trace-c',
        organizerId: '11111111-1111-4111-8111-111111111111',
        eventName: 'debt_control.pause_required',
        occurredAt: '2026-02-03T10:00:00.000Z',
        payloadJson: {
          organizerId: '11111111-1111-4111-8111-111111111111',
          affectedEditionIds: ['e1'],
        },
        entityType: 'debt_policy',
        entityId: '11111111-1111-4111-8111-111111111111',
      }),
    ];

    const shuffledEvents = [orderedEvents[2]!, orderedEvents[0]!, orderedEvents[1]!];

    const first = projectDebtDisputeExposureMetrics({
      events: orderedEvents,
      windowStart,
      windowEnd,
      asOf: windowEnd,
      registrationToEditionId: {
        r1: 'e1',
      },
      eventLabels: {
        e1: 'Event One 2026',
      },
      organizerLabels: {
        '11111111-1111-4111-8111-111111111111': 'Organizer One',
      },
    });

    const second = projectDebtDisputeExposureMetrics({
      events: shuffledEvents,
      windowStart,
      windowEnd,
      asOf: windowEnd,
      registrationToEditionId: {
        r1: 'e1',
      },
      eventLabels: {
        e1: 'Event One 2026',
      },
      organizerLabels: {
        '11111111-1111-4111-8111-111111111111': 'Organizer One',
      },
    });

    expect(second).toEqual(first);
  });

  it('preserves unscoped event drilldowns when edition scope is unavailable', () => {
    const caseId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const result = projectDebtDisputeExposureMetrics({
      events: [
        buildEvent({
          traceId: 'trace-unscoped',
          organizerId: null,
          eventName: 'dispute.opened',
          occurredAt: '2026-02-03T10:00:00.000Z',
          payloadJson: {
            disputeCaseId: caseId,
            amountAtRisk: { amountMinor: 250, currency: 'MXN' },
          },
          entityId: caseId,
        }),
      ],
      windowStart,
      windowEnd,
      asOf: windowEnd,
    });

    expect(result.organizers).toEqual([
      expect.objectContaining({
        organizerId: 'unscoped',
        organizerLabel: 'Unscoped organizer',
        openDisputeCaseCount: 1,
      }),
    ]);

    expect(result.events).toEqual([
      expect.objectContaining({
        eventEditionId: null,
        eventLabel: 'Unscoped event',
        openDisputeCaseCount: 1,
        traceability: expect.objectContaining({
          sampleTraceIds: ['trace-unscoped'],
          sampleDisputeCaseIds: [caseId],
        }),
      }),
    ]);
  });
});
