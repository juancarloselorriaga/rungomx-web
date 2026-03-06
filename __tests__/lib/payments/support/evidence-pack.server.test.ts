const mockSelect = jest.fn();
const mockFindFirstMoneyTrace = jest.fn();
const mockFindFirstPayoutRequest = jest.fn();
const mockFindFirstRefundRequest = jest.fn();
const mockFindFirstDisputeCase = jest.fn();

const selectResultQueue: Array<unknown[]> = [];
const selectLimitCalls: number[] = [];

jest.mock('@/db', () => ({
  db: {
    query: {
      moneyTraces: {
        findFirst: (...args: unknown[]) => mockFindFirstMoneyTrace(...args),
      },
      payoutRequests: {
        findFirst: (...args: unknown[]) => mockFindFirstPayoutRequest(...args),
      },
      refundRequests: {
        findFirst: (...args: unknown[]) => mockFindFirstRefundRequest(...args),
      },
      disputeCases: {
        findFirst: (...args: unknown[]) => mockFindFirstDisputeCase(...args),
      },
    },
    select: (...args: unknown[]) => mockSelect(...args),
  },
}));

import {
  buildFinancialEvidencePack,
  projectFinancialEvidencePack,
  type EvidencePackProjectionInput,
} from '@/lib/payments/support/evidence-pack';

function enqueueSelectResult(rows: unknown[]): void {
  selectResultQueue.push(rows);
}

function enqueueBuildFinancialEvidenceRows(overrides?: {
  eventRows?: Array<Record<string, unknown>>;
  artifactVersionRows?: Array<Record<string, unknown>>;
  artifactDeliveryRows?: Array<Record<string, unknown>>;
}): void {
  enqueueSelectResult(
    overrides?.eventRows ?? [
      {
        id: 'event-db-1',
        eventName: 'payout.requested',
        entityType: 'payout',
        entityId: 'payout-1',
        occurredAt: new Date('2026-02-10T10:30:00.000Z'),
        payloadJson: {
          amountMinor: 1000,
        },
        metadataJson: {
          source: 'worker',
        },
      },
    ],
  );
  enqueueSelectResult(
    overrides?.artifactVersionRows ?? [
      {
        id: 'version-db-1',
        traceId: 'trace-evidence-1',
        artifactType: 'payout_statement',
        artifactVersion: 1,
        fingerprint: 'fp-db-1',
        rebuiltFromVersionId: null,
        reasonCode: 'initial',
        requestedByUserId: 'user-db-1',
        createdAt: new Date('2026-02-10T10:35:00.000Z'),
      },
    ],
  );
  enqueueSelectResult(
    overrides?.artifactDeliveryRows ?? [
      {
        id: 'delivery-db-1',
        traceId: 'trace-evidence-1',
        artifactVersionId: 'version-db-1',
        artifactType: 'payout_statement',
        channel: 'api_pull',
        recipientReference: '/statement/db-1',
        reasonCode: 'initial',
        requestedByUserId: 'user-db-1',
        createdAt: new Date('2026-02-10T10:40:00.000Z'),
      },
    ],
  );
}

function buildInput(overrides?: Partial<EvidencePackProjectionInput>): EvidencePackProjectionInput {
  return {
    traceId: 'trace-evidence-1',
    rootEntityType: 'payout_request',
    rootEntityId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    organizerId: '11111111-1111-4111-8111-111111111111',
    traceCreatedAt: new Date('2026-02-10T10:00:00.000Z'),
    lifecycleEvents: [
      {
        id: 'event-2',
        eventName: 'payout.processing_started',
        entityType: 'payout',
        entityId: 'payout-1',
        occurredAt: new Date('2026-02-10T11:00:00.000Z'),
        payloadJson: {
          amountMinor: 1000,
          adminRiskNotes: 'manual internal triage',
        },
        metadataJson: {
          source: 'worker',
        },
      },
      {
        id: 'event-1',
        eventName: 'payout.requested',
        entityType: 'payout',
        entityId: 'payout-1',
        occurredAt: new Date('2026-02-10T10:30:00.000Z'),
        payloadJson: {
          amountMinor: 1000,
        },
        metadataJson: {
          internalNote: 'hidden for attendee/organizer',
        },
      },
    ],
    artifactVersions: [
      {
        id: 'version-2',
        artifactType: 'payout_statement',
        artifactVersion: 2,
        fingerprint: 'fp-2',
        rebuiltFromVersionId: 'version-1',
        reasonCode: 'ops_fix',
        requestedByUserId: 'user-2',
        createdAt: new Date('2026-02-10T11:05:00.000Z'),
      },
      {
        id: 'version-1',
        artifactType: 'payout_statement',
        artifactVersion: 1,
        fingerprint: 'fp-1',
        rebuiltFromVersionId: null,
        reasonCode: 'initial',
        requestedByUserId: 'user-1',
        createdAt: new Date('2026-02-10T10:35:00.000Z'),
      },
    ],
    artifactDeliveries: [
      {
        id: 'delivery-2',
        artifactVersionId: 'version-2',
        artifactType: 'payout_statement',
        channel: 'api_pull_resend',
        recipientReference: '/statement/2',
        reasonCode: 'resend_customer_support',
        requestedByUserId: 'user-2',
        createdAt: new Date('2026-02-10T11:10:00.000Z'),
      },
      {
        id: 'delivery-1',
        artifactVersionId: 'version-1',
        artifactType: 'payout_statement',
        channel: 'api_pull',
        recipientReference: '/statement/1',
        reasonCode: 'initial',
        requestedByUserId: 'user-1',
        createdAt: new Date('2026-02-10T10:40:00.000Z'),
      },
    ],
    policyContext: {
      payoutRequest: {
        id: 'payout-1',
        status: 'processing',
        manualReviewNotes: 'admin only',
      },
    },
    viewRole: 'support',
    generatedAt: new Date('2026-02-10T12:00:00.000Z'),
    ...overrides,
  };
}

describe('financial evidence pack projection', () => {
  it('assembles deterministic trace evidence ordering and timestamps', () => {
    const pack = projectFinancialEvidencePack(buildInput());

    expect(pack.traceId).toBe('trace-evidence-1');
    expect(pack.keyTimestamps).toEqual({
      traceCreatedAt: new Date('2026-02-10T10:00:00.000Z'),
      firstEventAt: new Date('2026-02-10T10:30:00.000Z'),
      lastEventAt: new Date('2026-02-10T11:00:00.000Z'),
    });

    expect(pack.lifecycleEvents.map((event) => event.id)).toEqual(['event-1', 'event-2']);
    expect(pack.artifacts.versions.map((version) => version.id)).toEqual(['version-1', 'version-2']);
    expect(pack.artifacts.deliveries.map((delivery) => delivery.id)).toEqual([
      'delivery-1',
      'delivery-2',
    ]);
  });

  it('keeps full trace-linked details for support/admin roles', () => {
    const pack = projectFinancialEvidencePack(buildInput({ viewRole: 'support' }));

    expect(pack.redaction.viewRole).toBe('support');
    expect(pack.redaction.redactedPaths).toEqual([]);
    expect(pack.lifecycleEvents[1]?.payloadJson).toEqual({
      amountMinor: 1000,
      adminRiskNotes: 'manual internal triage',
    });
  });

  it('applies role redaction for attendee/organizer evidence views', () => {
    const pack = projectFinancialEvidencePack(buildInput({ viewRole: 'attendee' }));

    expect(pack.redaction.viewRole).toBe('attendee');
    expect(pack.organizerId).toBe('11111111…1111');
    expect(pack.redaction.redactedPaths).toEqual([
      'lifecycleEvents[0].metadataJson.internalNote',
      'lifecycleEvents[1].payloadJson.adminRiskNotes',
      'policyContext.payoutRequest.manualReviewNotes',
    ]);

    expect(pack.lifecycleEvents[0]?.metadataJson).toEqual({});
    expect(pack.lifecycleEvents[1]?.payloadJson).toEqual({
      amountMinor: 1000,
    });
    expect(pack.policyContext).toEqual({
      payoutRequest: {
        id: 'payout-1',
        status: 'processing',
      },
    });
  });
});

describe('buildFinancialEvidencePack DB-backed branches', () => {
  beforeEach(() => {
    selectResultQueue.length = 0;
    selectLimitCalls.length = 0;

    mockSelect.mockReset();
    mockFindFirstMoneyTrace.mockReset();
    mockFindFirstPayoutRequest.mockReset();
    mockFindFirstRefundRequest.mockReset();
    mockFindFirstDisputeCase.mockReset();

    mockSelect.mockImplementation(() => {
      const chain = {
        from: () => chain,
        where: () => chain,
        orderBy: () => chain,
        limit: (value: number) => {
          selectLimitCalls.push(value);
          return Promise.resolve(selectResultQueue.shift() ?? []);
        },
      };

      return chain;
    });

    mockFindFirstMoneyTrace.mockResolvedValue({
      traceId: 'trace-evidence-1',
      organizerId: '11111111-1111-4111-8111-111111111111',
      rootEntityType: 'payout_request',
      rootEntityId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      createdAt: new Date('2026-02-10T10:00:00.000Z'),
    });
    mockFindFirstPayoutRequest.mockResolvedValue({
      id: 'payout-request-1',
      status: 'processing',
      requestedAt: new Date('2026-02-10T10:05:00.000Z'),
      lifecycleContextJson: {
        publicNote: 'visible',
        manualReviewNotes: 'admin-only-note',
        restrictedMetadata: {
          reviewer: 'risk-ops',
        },
      },
    });
    mockFindFirstRefundRequest.mockResolvedValue(null);
    mockFindFirstDisputeCase.mockResolvedValue(null);
  });

  it('returns null for blank trace identifiers before issuing any query', async () => {
    const result = await buildFinancialEvidencePack({
      traceId: '   ',
    });

    expect(result).toBeNull();
    expect(mockFindFirstMoneyTrace).not.toHaveBeenCalled();
    expect(mockFindFirstPayoutRequest).not.toHaveBeenCalled();
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it('returns null when the trace does not exist', async () => {
    mockFindFirstMoneyTrace.mockResolvedValueOnce(null);

    const result = await buildFinancialEvidencePack({
      traceId: 'trace-missing',
    });

    expect(result).toBeNull();
    expect(mockFindFirstMoneyTrace).toHaveBeenCalledTimes(1);
    expect(mockFindFirstPayoutRequest).not.toHaveBeenCalled();
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it('normalizes non-positive eventLimit values to default 250', async () => {
    enqueueBuildFinancialEvidenceRows();

    const result = await buildFinancialEvidencePack({
      traceId: 'trace-evidence-1',
      eventLimit: 0,
      viewRole: 'support',
    });

    expect(result).not.toBeNull();
    expect(selectLimitCalls).toEqual([250, 60, 120]);
  });

  it('truncates positive eventLimit values before applying event query limit', async () => {
    enqueueBuildFinancialEvidenceRows();

    const result = await buildFinancialEvidencePack({
      traceId: 'trace-evidence-1',
      eventLimit: 12.9,
      viewRole: 'support',
    });

    expect(result).not.toBeNull();
    expect(selectLimitCalls).toEqual([12, 60, 120]);
  });

  it('applies attendee redaction when building through the DB path', async () => {
    enqueueBuildFinancialEvidenceRows({
      eventRows: [
        {
          id: 'event-db-redaction-1',
          eventName: 'payout.processing_started',
          entityType: 'payout',
          entityId: 'payout-1',
          occurredAt: new Date('2026-02-10T10:35:00.000Z'),
          payloadJson: {
            amountMinor: 1000,
            adminRiskNotes: 'manual internal triage',
            nested: {
              fraudSignal: 'elevated',
              allowed: true,
            },
          },
          metadataJson: {
            source: 'worker',
            internalNote: 'hidden for attendee',
          },
        },
      ],
    });

    const result = await buildFinancialEvidencePack({
      traceId: 'trace-evidence-1',
      viewRole: 'attendee',
    });

    expect(result).not.toBeNull();
    const pack = result!;

    expect(pack.redaction.viewRole).toBe('attendee');
    expect(pack.organizerId).toBe('11111111…1111');
    expect(pack.lifecycleEvents[0]?.payloadJson).toEqual({
      amountMinor: 1000,
      nested: {
        allowed: true,
      },
    });
    expect(pack.lifecycleEvents[0]?.metadataJson).toEqual({
      source: 'worker',
    });
    expect(pack.policyContext).toEqual({
      payoutRequest: {
        id: 'payout-request-1',
        status: 'processing',
        requestedAt: {},
        lifecycleContext: {
          publicNote: 'visible',
        },
      },
      refundRequest: null,
      disputeCase: null,
    });
    expect(pack.redaction.redactedPaths).toEqual([
      'lifecycleEvents[0].metadataJson.internalNote',
      'lifecycleEvents[0].payloadJson.adminRiskNotes',
      'lifecycleEvents[0].payloadJson.nested.fraudSignal',
      'policyContext.payoutRequest.lifecycleContext.manualReviewNotes',
      'policyContext.payoutRequest.lifecycleContext.restrictedMetadata',
    ]);
  });
});
