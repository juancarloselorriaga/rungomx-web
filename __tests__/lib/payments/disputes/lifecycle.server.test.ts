const mockFindFirstRegistration = jest.fn();
const mockFindFirstDisputeCase = jest.fn();
const mockInsert = jest.fn();
const mockValues = jest.fn();
const mockInsertReturning = jest.fn();
const mockUpdate = jest.fn();
const mockSet = jest.fn();
const mockWhere = jest.fn();
const mockUpdateReturning = jest.fn();

const mockIngestMoneyMutationFromApi = jest.fn();
const mockIngestMoneyMutationFromWorker = jest.fn();

jest.mock('@/db', () => ({
  db: {
    query: {
      registrations: {
        findFirst: (...args: unknown[]) => mockFindFirstRegistration(...args),
      },
      disputeCases: {
        findFirst: (...args: unknown[]) => mockFindFirstDisputeCase(...args),
      },
    },
    insert: (...args: unknown[]) => mockInsert(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
  },
}));

jest.mock('@/lib/payments/core/mutation-ingress-paths', () => ({
  ingestMoneyMutationFromApi: (...args: unknown[]) => mockIngestMoneyMutationFromApi(...args),
  ingestMoneyMutationFromWorker: (...args: unknown[]) =>
    mockIngestMoneyMutationFromWorker(...args),
}));

import {
  DisputeLifecycleError,
  getDisputeEvidenceWindow,
  openDisputeCase,
  submitDisputeEvidence,
  transitionDisputeCase,
} from '@/lib/payments/disputes/lifecycle';

describe('dispute lifecycle domain service', () => {
  const now = new Date('2026-02-23T23:30:00.000Z');

  beforeEach(() => {
    mockFindFirstRegistration.mockReset();
    mockFindFirstDisputeCase.mockReset();
    mockInsert.mockReset();
    mockValues.mockReset();
    mockInsertReturning.mockReset();
    mockUpdate.mockReset();
    mockSet.mockReset();
    mockWhere.mockReset();
    mockUpdateReturning.mockReset();
    mockIngestMoneyMutationFromApi.mockReset();
    mockIngestMoneyMutationFromWorker.mockReset();

    mockInsert.mockImplementation(() => ({
      values: (...valueArgs: unknown[]) => {
        mockValues(...valueArgs);
        return {
          returning: (...returningArgs: unknown[]) => mockInsertReturning(...returningArgs),
        };
      },
    }));

    mockUpdate.mockImplementation(() => ({
      set: (...setArgs: unknown[]) => {
        mockSet(...setArgs);
        return {
          where: (...whereArgs: unknown[]) => {
            mockWhere(...whereArgs);
            return {
              returning: (...returningArgs: unknown[]) => mockUpdateReturning(...returningArgs),
            };
          },
        };
      },
    }));
  });

  it('creates dispute intake in canonical opened state and appends dispute.opened via ingress', async () => {
    mockFindFirstRegistration.mockResolvedValue({
      id: '33333333-3333-4333-8333-333333333333',
      buyerUserId: '44444444-4444-4444-8444-444444444444',
      edition: {
        id: '55555555-5555-4555-8555-555555555555',
        series: {
          organizationId: '11111111-1111-4111-8111-111111111111',
        },
      },
    });
    mockIngestMoneyMutationFromApi.mockResolvedValue({
      traceId: 'dispute-intake:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      deduplicated: false,
      persistedEvents: [],
    });
    mockInsertReturning.mockResolvedValue([
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        organizerId: '11111111-1111-4111-8111-111111111111',
        registrationId: '33333333-3333-4333-8333-333333333333',
        orderId: null,
        attendeeUserId: '44444444-4444-4444-8444-444444444444',
        status: 'opened',
        reasonCode: 'fraud_reported',
        reasonNote: 'Chargeback opened by provider',
        amountAtRiskMinor: 1800,
        currency: 'MXN',
        evidenceDeadlineAt: new Date('2026-02-26T23:30:00.000Z'),
        openedAt: now,
        lastTransitionAt: now,
        metadataJson: {
          createdBy: {
            userId: '66666666-6666-4666-8666-666666666666',
            source: 'api',
          },
        },
      },
    ]);

    const result = await openDisputeCase({
      organizerId: '11111111-1111-4111-8111-111111111111',
      openedByUserId: '66666666-6666-4666-8666-666666666666',
      registrationId: '33333333-3333-4333-8333-333333333333',
      reasonCode: 'fraud_reported',
      reasonNote: 'Chargeback opened by provider',
      amountAtRiskMinor: 1800,
      now,
    });

    expect(result).toMatchObject({
      disputeCaseId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      status: 'opened',
      reasonCode: 'fraud_reported',
      amountAtRiskMinor: 1800,
      currency: 'MXN',
      ingressDeduplicated: false,
    });
    expect(result.traceId).toMatch(/^dispute-intake:/);

    expect(mockIngestMoneyMutationFromApi).toHaveBeenCalledTimes(1);
    expect(mockIngestMoneyMutationFromApi.mock.calls[0]![0]).toMatchObject({
      organizerId: '11111111-1111-4111-8111-111111111111',
      traceId: result.traceId,
      idempotencyKey: result.traceId,
    });

    const ingressEvent = mockIngestMoneyMutationFromApi.mock.calls[0]![0].events[0];
    expect(ingressEvent.eventName).toBe('dispute.opened');
    expect(ingressEvent.payload.registrationId).toBe('33333333-3333-4333-8333-333333333333');
    expect(ingressEvent.payload.orderId).toBeUndefined();
  });

  it('rejects intake when scope identifiers are missing', async () => {
    await expect(
      openDisputeCase({
        organizerId: '11111111-1111-4111-8111-111111111111',
        openedByUserId: '66666666-6666-4666-8666-666666666666',
        reasonCode: 'fraud_reported',
        amountAtRiskMinor: 1000,
        now,
      }),
    ).rejects.toMatchObject({
      code: 'DISPUTE_INTAKE_SCOPE_REQUIRED',
    });

    expect(mockIngestMoneyMutationFromApi).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('rejects intake when evidence deadline is not after opened time', async () => {
    mockFindFirstRegistration.mockResolvedValue({
      id: '33333333-3333-4333-8333-333333333333',
      buyerUserId: '44444444-4444-4444-8444-444444444444',
      edition: {
        id: '55555555-5555-4555-8555-555555555555',
        series: {
          organizationId: '11111111-1111-4111-8111-111111111111',
        },
      },
    });

    await expect(
      openDisputeCase({
        organizerId: '11111111-1111-4111-8111-111111111111',
        openedByUserId: '66666666-6666-4666-8666-666666666666',
        registrationId: '33333333-3333-4333-8333-333333333333',
        reasonCode: 'fraud_reported',
        amountAtRiskMinor: 1000,
        evidenceDeadlineAt: new Date('2026-02-23T23:30:00.000Z'),
        now,
      }),
    ).rejects.toMatchObject({
      code: 'DISPUTE_INTAKE_EVIDENCE_DEADLINE_INVALID',
    });

    expect(mockIngestMoneyMutationFromApi).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('rejects intake when registration scope belongs to another organizer', async () => {
    mockFindFirstRegistration.mockResolvedValue({
      id: '33333333-3333-4333-8333-333333333333',
      buyerUserId: '44444444-4444-4444-8444-444444444444',
      edition: {
        id: '55555555-5555-4555-8555-555555555555',
        series: {
          organizationId: '99999999-9999-4999-8999-999999999999',
        },
      },
    });

    await expect(
      openDisputeCase({
        organizerId: '11111111-1111-4111-8111-111111111111',
        openedByUserId: '66666666-6666-4666-8666-666666666666',
        registrationId: '33333333-3333-4333-8333-333333333333',
        reasonCode: 'fraud_reported',
        amountAtRiskMinor: 1000,
        now,
      }),
    ).rejects.toMatchObject({
      code: 'DISPUTE_INTAKE_REGISTRATION_ORGANIZER_MISMATCH',
    });

    expect(mockIngestMoneyMutationFromApi).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('allows valid lifecycle transitions and records transition metadata', async () => {
    mockFindFirstDisputeCase.mockResolvedValue({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      organizerId: '11111111-1111-4111-8111-111111111111',
      status: 'opened',
      metadataJson: {},
    });
    mockUpdateReturning.mockResolvedValue([
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        organizerId: '11111111-1111-4111-8111-111111111111',
        status: 'evidence_required',
        closedAt: null,
        lastTransitionAt: now,
        latestTransitionByUserId: '66666666-6666-4666-8666-666666666666',
        metadataJson: {
          lastTransition: {
            fromStatus: 'opened',
            toStatus: 'evidence_required',
          },
        },
      },
    ]);

    const result = await transitionDisputeCase({
      disputeCaseId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      organizerId: '11111111-1111-4111-8111-111111111111',
      actorUserId: '66666666-6666-4666-8666-666666666666',
      toStatus: 'evidence_required',
      reasonCode: 'awaiting_evidence',
      now,
    });

    expect(result).toMatchObject({
      disputeCaseId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      fromStatus: 'opened',
      toStatus: 'evidence_required',
      reasonCode: 'awaiting_evidence',
      latestTransitionByUserId: '66666666-6666-4666-8666-666666666666',
    });

    const updatePayload = mockSet.mock.calls[0]![0] as Record<string, unknown>;
    expect(updatePayload.status).toBe('evidence_required');
    expect(updatePayload.lastTransitionAt).toBe(now);
    const metadata = (updatePayload.metadataJson ?? {}) as Record<string, unknown>;
    expect((metadata.lastTransition as Record<string, unknown>).fromStatus).toBe('opened');
    expect((metadata.lastTransition as Record<string, unknown>).toStatus).toBe('evidence_required');
  });

  it('settles won outcomes with deterministic freeze-release posting via ingress', async () => {
    mockFindFirstDisputeCase.mockResolvedValue({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      organizerId: '11111111-1111-4111-8111-111111111111',
      registrationId: '33333333-3333-4333-8333-333333333333',
      orderId: null,
      status: 'under_review',
      amountAtRiskMinor: 1800,
      currency: 'MXN',
      metadataJson: {
        freezeLadder: {
          profile: 'full_at_risk_v1',
          currentStage: 'opened_full_hold',
        },
      },
    });
    mockIngestMoneyMutationFromApi.mockResolvedValue({
      traceId: 'dispute-settlement:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      deduplicated: false,
      persistedEvents: [],
    });
    mockUpdateReturning.mockResolvedValue([
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        organizerId: '11111111-1111-4111-8111-111111111111',
        status: 'won',
        closedAt: now,
        lastTransitionAt: now,
        latestTransitionByUserId: '66666666-6666-4666-8666-666666666666',
        metadataJson: {
          settlement: {
            traceId: 'dispute-settlement:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          },
        },
      },
    ]);

    const result = await transitionDisputeCase({
      disputeCaseId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      organizerId: '11111111-1111-4111-8111-111111111111',
      actorUserId: '66666666-6666-4666-8666-666666666666',
      toStatus: 'won',
      runtime: 'web',
      executionMode: 'in_process',
      nodeEnv: 'test',
      now,
    });

    expect(result).toMatchObject({
      fromStatus: 'under_review',
      toStatus: 'won',
      settlement: {
        traceId: 'dispute-settlement:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        ingressDeduplicated: false,
        runtime: 'web',
        executionMode: 'in_process',
        freezeLadder: {
          stage: 'won_release_full_hold',
        },
      },
    });
    expect(result.settlement?.postings).toEqual([
      {
        postingType: 'freeze_release',
        amountMinor: 1800,
        currency: 'MXN',
      },
    ]);

    expect(mockIngestMoneyMutationFromApi).toHaveBeenCalledTimes(1);
    const ingressCall = mockIngestMoneyMutationFromApi.mock.calls[0]![0];
    expect(ingressCall.traceId).toBe('dispute-settlement:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    expect(ingressCall.events).toHaveLength(1);
    expect(ingressCall.events[0].eventName).toBe('dispute.funds_released');
  });

  it('settles lost outcomes with deterministic release + debt postings through worker ingress', async () => {
    mockFindFirstDisputeCase.mockResolvedValue({
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      organizerId: '11111111-1111-4111-8111-111111111111',
      registrationId: null,
      orderId: '44444444-4444-4444-8444-444444444444',
      status: 'under_review',
      amountAtRiskMinor: 2400,
      currency: 'MXN',
      metadataJson: {},
    });
    mockIngestMoneyMutationFromWorker.mockResolvedValue({
      traceId: 'dispute-settlement:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      deduplicated: false,
      persistedEvents: [],
    });
    mockUpdateReturning.mockResolvedValue([
      {
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        organizerId: '11111111-1111-4111-8111-111111111111',
        status: 'lost',
        closedAt: now,
        lastTransitionAt: now,
        latestTransitionByUserId: '66666666-6666-4666-8666-666666666666',
        metadataJson: {},
      },
    ]);

    const result = await transitionDisputeCase({
      disputeCaseId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      organizerId: '11111111-1111-4111-8111-111111111111',
      actorUserId: '66666666-6666-4666-8666-666666666666',
      toStatus: 'lost',
      runtime: 'worker',
      executionMode: 'queued_worker',
      nodeEnv: 'production',
      now,
    });

    expect(result).toMatchObject({
      fromStatus: 'under_review',
      toStatus: 'lost',
      settlement: {
        runtime: 'worker',
        executionMode: 'queued_worker',
        freezeLadder: {
          stage: 'lost_convert_full_hold_to_debt',
        },
      },
    });
    expect(result.settlement?.postings).toEqual([
      {
        postingType: 'freeze_release',
        amountMinor: 2400,
        currency: 'MXN',
      },
      {
        postingType: 'debt_impact',
        amountMinor: 2400,
        currency: 'MXN',
      },
    ]);

    expect(mockIngestMoneyMutationFromWorker).toHaveBeenCalledTimes(1);
    const ingressCall = mockIngestMoneyMutationFromWorker.mock.calls[0]![0];
    expect(ingressCall.events).toHaveLength(2);
    expect(ingressCall.events[0].eventName).toBe('dispute.funds_released');
    expect(ingressCall.events[1].eventName).toBe('dispute.debt_posted');
  });

  it('blocks in_process dispute settlement mode in production', async () => {
    mockFindFirstDisputeCase.mockResolvedValue({
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      organizerId: '11111111-1111-4111-8111-111111111111',
      registrationId: null,
      orderId: '44444444-4444-4444-8444-444444444444',
      status: 'under_review',
      amountAtRiskMinor: 900,
      currency: 'MXN',
      metadataJson: {},
    });

    await expect(
      transitionDisputeCase({
        disputeCaseId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        organizerId: '11111111-1111-4111-8111-111111111111',
        actorUserId: '66666666-6666-4666-8666-666666666666',
        toStatus: 'lost',
        runtime: 'worker',
        executionMode: 'in_process',
        nodeEnv: 'production',
        now,
      }),
    ).rejects.toMatchObject({
      code: 'DISPUTE_SETTLEMENT_MODE_BLOCKED',
    });

    expect(mockIngestMoneyMutationFromApi).not.toHaveBeenCalled();
    expect(mockIngestMoneyMutationFromWorker).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('requires worker runtime for dispute settlement processors in production', async () => {
    mockFindFirstDisputeCase.mockResolvedValue({
      id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      organizerId: '11111111-1111-4111-8111-111111111111',
      registrationId: null,
      orderId: '44444444-4444-4444-8444-444444444444',
      status: 'under_review',
      amountAtRiskMinor: 900,
      currency: 'MXN',
      metadataJson: {},
    });

    await expect(
      transitionDisputeCase({
        disputeCaseId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        organizerId: '11111111-1111-4111-8111-111111111111',
        actorUserId: '66666666-6666-4666-8666-666666666666',
        toStatus: 'won',
        runtime: 'web',
        executionMode: 'queued_worker',
        nodeEnv: 'production',
        now,
      }),
    ).rejects.toMatchObject({
      code: 'DISPUTE_SETTLEMENT_RUNTIME_BLOCKED',
    });

    expect(mockIngestMoneyMutationFromApi).not.toHaveBeenCalled();
    expect(mockIngestMoneyMutationFromWorker).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('rejects invalid lifecycle transitions outside configured state machine', async () => {
    mockFindFirstDisputeCase.mockResolvedValue({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      organizerId: '11111111-1111-4111-8111-111111111111',
      status: 'opened',
      metadataJson: {},
    });

    await expect(
      transitionDisputeCase({
        disputeCaseId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        organizerId: '11111111-1111-4111-8111-111111111111',
        actorUserId: '66666666-6666-4666-8666-666666666666',
        toStatus: 'won',
        now,
      }),
    ).rejects.toMatchObject({
      code: 'DISPUTE_TRANSITION_NOT_ALLOWED',
    });

    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('returns deterministic not-found error for unknown dispute case transitions', async () => {
    mockFindFirstDisputeCase.mockResolvedValue(null);

    let caught: unknown;
    try {
      await transitionDisputeCase({
        disputeCaseId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        organizerId: '11111111-1111-4111-8111-111111111111',
        actorUserId: '66666666-6666-4666-8666-666666666666',
        toStatus: 'under_review',
        now,
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(DisputeLifecycleError);
    expect((caught as DisputeLifecycleError).code).toBe('DISPUTE_CASE_NOT_FOUND');
  });

  it('returns deterministic evidence deadline countdown from persisted dispute deadline', async () => {
    mockFindFirstDisputeCase.mockResolvedValue({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      organizerId: '11111111-1111-4111-8111-111111111111',
      status: 'evidence_required',
      evidenceDeadlineAt: new Date('2026-02-24T00:30:05.000Z'),
    });

    const result = await getDisputeEvidenceWindow({
      disputeCaseId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      organizerId: '11111111-1111-4111-8111-111111111111',
      asOf: now,
    });

    expect(result).toMatchObject({
      disputeCaseId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      organizerId: '11111111-1111-4111-8111-111111111111',
      status: 'evidence_required',
      remainingSeconds: 3605,
      deadlineState: 'open',
    });
  });

  it('blocks late evidence submissions and routes to escalation action', async () => {
    mockFindFirstDisputeCase.mockResolvedValue({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      organizerId: '11111111-1111-4111-8111-111111111111',
      status: 'evidence_required',
      evidenceDeadlineAt: new Date('2026-02-23T23:29:59.000Z'),
      metadataJson: {},
    });
    mockUpdateReturning.mockResolvedValue([
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        organizerId: '11111111-1111-4111-8111-111111111111',
        status: 'evidence_required',
        evidenceDeadlineAt: new Date('2026-02-23T23:29:59.000Z'),
        metadataJson: {
          escalation: {
            nextAction: 'escalate_dispute_review',
          },
        },
      },
    ]);

    const result = await submitDisputeEvidence({
      disputeCaseId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      organizerId: '11111111-1111-4111-8111-111111111111',
      actorUserId: '66666666-6666-4666-8666-666666666666',
      evidenceNote: 'Proof after deadline',
      evidenceReferences: [
        {
          referenceId: 'doc-1',
          referenceType: 'document',
          referenceUrl: 'https://example.test/evidence/doc-1',
        },
      ],
      now,
    });

    expect(result).toMatchObject({
      accepted: false,
      nextAction: 'escalate_dispute_review',
      deadlineState: 'expired',
      remainingSeconds: 0,
      status: 'evidence_required',
    });

    const updatePayload = mockSet.mock.calls[0]![0] as Record<string, unknown>;
    expect(updatePayload.status).toBeUndefined();
    const metadata = (updatePayload.metadataJson ?? {}) as Record<string, unknown>;
    expect((metadata.escalation as Record<string, unknown>).nextAction).toBe(
      'escalate_dispute_review',
    );
  });

  it('accepts evidence before deadline and transitions dispute to under_review', async () => {
    mockFindFirstDisputeCase.mockResolvedValue({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      organizerId: '11111111-1111-4111-8111-111111111111',
      status: 'evidence_required',
      evidenceDeadlineAt: new Date('2026-02-24T00:30:05.000Z'),
      metadataJson: {},
    });
    mockUpdateReturning.mockResolvedValue([
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        organizerId: '11111111-1111-4111-8111-111111111111',
        status: 'under_review',
        evidenceDeadlineAt: new Date('2026-02-24T00:30:05.000Z'),
        metadataJson: {
          lastEvidenceSubmission: {
            outcome: 'accepted',
          },
        },
      },
    ]);

    const result = await submitDisputeEvidence({
      disputeCaseId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      organizerId: '11111111-1111-4111-8111-111111111111',
      actorUserId: '66666666-6666-4666-8666-666666666666',
      evidenceNote: 'Organizer evidence package',
      evidenceReferences: [
        {
          referenceId: 'doc-2',
          referenceType: 'document',
          referenceUrl: 'https://example.test/evidence/doc-2',
          note: 'Chargeback proof',
        },
      ],
      now,
    });

    expect(result).toMatchObject({
      accepted: true,
      nextAction: 'continue_review',
      status: 'under_review',
      deadlineState: 'open',
      remainingSeconds: 3605,
    });

    const updatePayload = mockSet.mock.calls[0]![0] as Record<string, unknown>;
    expect(updatePayload.status).toBe('under_review');
    const metadata = (updatePayload.metadataJson ?? {}) as Record<string, unknown>;
    expect((metadata.lastTransition as Record<string, unknown>).toStatus).toBe('under_review');
  });

  it('rejects evidence submission when lifecycle status is not evidence-collecting', async () => {
    mockFindFirstDisputeCase.mockResolvedValue({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      organizerId: '11111111-1111-4111-8111-111111111111',
      status: 'won',
      evidenceDeadlineAt: new Date('2026-02-24T00:30:05.000Z'),
      metadataJson: {},
    });

    await expect(
      submitDisputeEvidence({
        disputeCaseId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        organizerId: '11111111-1111-4111-8111-111111111111',
        actorUserId: '66666666-6666-4666-8666-666666666666',
        evidenceNote: 'Too late status',
        now,
      }),
    ).rejects.toMatchObject({
      code: 'DISPUTE_EVIDENCE_STATUS_INVALID',
    });

    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('rejects evidence submission when note and references are both missing', async () => {
    await expect(
      submitDisputeEvidence({
        disputeCaseId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        organizerId: '11111111-1111-4111-8111-111111111111',
        actorUserId: '66666666-6666-4666-8666-666666666666',
        now,
      }),
    ).rejects.toMatchObject({
      code: 'DISPUTE_EVIDENCE_CONTENT_REQUIRED',
    });

    expect(mockFindFirstDisputeCase).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
