import {
  projectFinancialEvidencePack,
  type EvidencePackProjectionInput,
} from '@/lib/payments/support/evidence-pack';

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
