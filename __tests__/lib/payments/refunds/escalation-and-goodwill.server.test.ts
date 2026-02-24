const mockFindManyRefundRequests = jest.fn();
const mockFindFirstRefundRequest = jest.fn();
const mockFindFirstRegistration = jest.fn();
const mockFindFirstEventEdition = jest.fn();
const mockUpdate = jest.fn();
const mockSet = jest.fn();
const mockWhere = jest.fn();
const mockUpdateReturning = jest.fn();
const mockInsert = jest.fn();
const mockValues = jest.fn();
const mockInsertReturning = jest.fn();

jest.mock('@/db', () => ({
  db: {
    query: {
      refundRequests: {
        findMany: (...args: unknown[]) => mockFindManyRefundRequests(...args),
        findFirst: (...args: unknown[]) => mockFindFirstRefundRequest(...args),
      },
      registrations: {
        findFirst: (...args: unknown[]) => mockFindFirstRegistration(...args),
      },
      eventEditions: {
        findFirst: (...args: unknown[]) => mockFindFirstEventEdition(...args),
      },
    },
    update: (...args: unknown[]) => mockUpdate(...args),
    insert: (...args: unknown[]) => mockInsert(...args),
  },
}));

import {
  escalateExpiredRefundRequests,
  initiateGoodwillRefundRequest,
  listRefundAdminReviewQueue,
  RefundEscalationGoodwillError,
} from '@/lib/payments/refunds/escalation-and-goodwill';

describe('refund escalation and goodwill domain service', () => {
  const now = new Date('2026-02-23T22:00:00.000Z');

  beforeEach(() => {
    mockFindManyRefundRequests.mockReset();
    mockFindFirstRefundRequest.mockReset();
    mockFindFirstRegistration.mockReset();
    mockFindFirstEventEdition.mockReset();
    mockUpdate.mockReset();
    mockSet.mockReset();
    mockWhere.mockReset();
    mockUpdateReturning.mockReset();
    mockInsert.mockReset();
    mockValues.mockReset();
    mockInsertReturning.mockReset();

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

    mockInsert.mockImplementation(() => ({
      values: (...valueArgs: unknown[]) => {
        mockValues(...valueArgs);
        return {
          returning: (...returningArgs: unknown[]) => mockInsertReturning(...returningArgs),
        };
      },
    }));
  });

  it('escalates pending requests older than cutoff and records audit actor metadata', async () => {
    mockFindManyRefundRequests.mockResolvedValueOnce([{ id: 'r1' }, { id: 'r2' }]);
    mockUpdateReturning.mockResolvedValueOnce([{ id: 'r1' }, { id: 'r2' }]);

    const result = await escalateExpiredRefundRequests({
      organizerId: 'organization-1',
      actorUserId: 'admin-1',
      requestedBefore: new Date('2026-02-23T21:00:00.000Z'),
      now,
    });

    expect(result).toEqual({
      organizerId: 'organization-1',
      actorUserId: 'admin-1',
      requestedBefore: new Date('2026-02-23T21:00:00.000Z'),
      escalatedAt: now,
      escalatedCount: 2,
      refundRequestIds: ['r1', 'r2'],
    });

    const updatePayload = mockSet.mock.calls[0]![0] as Record<string, unknown>;
    expect(updatePayload.status).toBe('escalated_admin_review');
    expect(updatePayload.decidedByUserId).toBe('admin-1');
    expect(updatePayload.escalatedAt).toBe(now);
  });

  it('returns empty escalation result when no pending requests qualify', async () => {
    mockFindManyRefundRequests.mockResolvedValueOnce([]);

    const result = await escalateExpiredRefundRequests({
      organizerId: 'organization-1',
      actorUserId: 'admin-1',
      requestedBefore: new Date('2026-02-23T21:00:00.000Z'),
      now,
    });

    expect(result.escalatedCount).toBe(0);
    expect(result.refundRequestIds).toEqual([]);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('creates goodwill request in review queue with deterministic snapshots', async () => {
    mockFindFirstRegistration.mockResolvedValueOnce({
      id: 'registration-1',
      editionId: 'edition-1',
      buyerUserId: 'attendee-1',
      basePriceCents: 1000,
      feesCents: 120,
      taxCents: 80,
      totalCents: 1200,
    });
    mockFindFirstEventEdition.mockResolvedValueOnce({
      id: 'edition-1',
      timezone: 'America/Mexico_City',
      series: {
        organizationId: 'organization-1',
        deletedAt: null,
      },
      policyConfig: {
        refundsAllowed: false,
        refundPolicyText: 'No refunds by default',
        refundDeadline: null,
      },
    });
    mockFindFirstRefundRequest.mockResolvedValueOnce(null);
    mockInsertReturning.mockResolvedValueOnce([
      {
        refundRequestId: 'goodwill-request-1',
        registrationId: 'registration-1',
        organizerId: 'organization-1',
        attendeeUserId: 'attendee-1',
        status: 'escalated_admin_review',
        reasonCode: 'goodwill_manual',
        reasonNote: 'Manual goodwill for support resolution',
        requestedByUserId: 'admin-1',
        requestedAt: now,
        escalatedAt: now,
      },
    ]);

    const result = await initiateGoodwillRefundRequest({
      organizerId: 'organization-1',
      actorUserId: 'admin-1',
      registrationId: 'registration-1',
      reasonNote: '  Manual goodwill for support resolution  ',
      now,
    });

    expect(result).toMatchObject({
      refundRequestId: 'goodwill-request-1',
      status: 'escalated_admin_review',
      reasonCode: 'goodwill_manual',
      reasonNote: 'Manual goodwill for support resolution',
      requestedByUserId: 'admin-1',
    });
    expect(result.eligibilitySnapshot.source).toBe('goodwill');
    expect(result.financialSnapshot).toEqual({
      version: 'refund-goodwill-financial-v1',
      currency: 'MXN',
      totalPaidMinor: 1200,
      nonRefundableServiceFeeMinor: 120,
      maxRefundableToAttendeeMinor: 1080,
      serviceFeePolicy: 'non_refundable_always',
    });

    const insertPayload = mockValues.mock.calls[0]![0] as Record<string, unknown>;
    expect(insertPayload.status).toBe('escalated_admin_review');
    expect(insertPayload.reasonCode).toBe('goodwill_manual');
    expect(
      (insertPayload.eligibilitySnapshotJson as Record<string, unknown>).source,
    ).toBe('goodwill');
  });

  it('rejects goodwill initiation when an open refund workflow already exists', async () => {
    mockFindFirstRegistration.mockResolvedValueOnce({
      id: 'registration-1',
      editionId: 'edition-1',
      buyerUserId: 'attendee-1',
      basePriceCents: 1000,
      feesCents: 120,
      taxCents: 80,
      totalCents: 1200,
    });
    mockFindFirstEventEdition.mockResolvedValueOnce({
      id: 'edition-1',
      timezone: 'America/Mexico_City',
      series: {
        organizationId: 'organization-1',
        deletedAt: null,
      },
      policyConfig: null,
    });
    mockFindFirstRefundRequest.mockResolvedValueOnce({ id: 'existing-open' });

    let caught: unknown;
    try {
      await initiateGoodwillRefundRequest({
        organizerId: 'organization-1',
        actorUserId: 'admin-1',
        registrationId: 'registration-1',
        reasonNote: 'Need goodwill',
        now,
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(RefundEscalationGoodwillError);
    expect((caught as RefundEscalationGoodwillError).code).toBe('GOODWILL_ALREADY_OPEN');
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('returns review queue items with deterministic queue source classification', async () => {
    mockFindManyRefundRequests.mockResolvedValueOnce([
      {
        id: 'goodwill-request-1',
        registrationId: 'registration-1',
        organizerId: 'organization-1',
        attendeeUserId: 'attendee-1',
        requestedByUserId: 'admin-1',
        status: 'escalated_admin_review',
        reasonCode: 'goodwill_manual',
        reasonNote: 'Manual goodwill',
        requestedAt: now,
        escalatedAt: now,
        eligibilitySnapshotJson: { source: 'goodwill' },
      },
      {
        id: 'escalated-request-1',
        registrationId: 'registration-2',
        organizerId: 'organization-1',
        attendeeUserId: 'attendee-2',
        requestedByUserId: 'admin-1',
        status: 'escalated_admin_review',
        reasonCode: 'medical',
        reasonNote: 'Escalated by SLA',
        requestedAt: now,
        escalatedAt: now,
        eligibilitySnapshotJson: {},
      },
    ]);

    const queue = await listRefundAdminReviewQueue({
      organizerId: 'organization-1',
      limit: 20,
    });

    expect(queue).toHaveLength(2);
    expect(queue[0]!.queueSource).toBe('goodwill');
    expect(queue[1]!.queueSource).toBe('escalation');
  });
});
