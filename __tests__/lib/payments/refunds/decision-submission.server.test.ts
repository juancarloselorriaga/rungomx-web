const mockUpdate = jest.fn();
const mockSet = jest.fn();
const mockWhere = jest.fn();
const mockReturning = jest.fn();
const mockFindFirstRefundRequest = jest.fn();

jest.mock('@/db', () => ({
  db: {
    update: (...args: unknown[]) => mockUpdate(...args),
    query: {
      refundRequests: {
        findFirst: (...args: unknown[]) => mockFindFirstRefundRequest(...args),
      },
    },
  },
}));

import {
  RefundDecisionSubmissionError,
  submitOrganizerRefundDecision,
} from '@/lib/payments/refunds/decision-submission';

describe('organizer refund decision submission', () => {
  const now = new Date('2026-02-23T21:00:00.000Z');

  beforeEach(() => {
    mockUpdate.mockReset();
    mockSet.mockReset();
    mockWhere.mockReset();
    mockReturning.mockReset();
    mockFindFirstRefundRequest.mockReset();

    mockUpdate.mockImplementation(() => ({
      set: (...setArgs: unknown[]) => {
        mockSet(...setArgs);
        return {
          where: (...whereArgs: unknown[]) => {
            mockWhere(...whereArgs);
            return {
              returning: (...returningArgs: unknown[]) => mockReturning(...returningArgs),
            };
          },
        };
      },
    }));

    mockFindFirstRefundRequest.mockResolvedValue(null);
  });

  it('persists approve decision with actor, rationale, and timestamp', async () => {
    mockReturning.mockResolvedValueOnce([
      {
        refundRequestId: 'refund-request-1',
        registrationId: 'registration-1',
        organizerId: 'organization-1',
        attendeeUserId: 'attendee-1',
        status: 'approved',
        decisionReason: 'Approved after organizer review',
        decisionAt: now,
        decidedByUserId: 'organizer-user-1',
        requestedAt: new Date('2026-02-23T19:00:00.000Z'),
      },
    ]);

    const result = await submitOrganizerRefundDecision({
      refundRequestId: 'refund-request-1',
      organizerId: 'organization-1',
      decidedByUserId: 'organizer-user-1',
      decision: 'approve',
      decisionReason: '  Approved after organizer review  ',
      now,
    });

    expect(result).toMatchObject({
      refundRequestId: 'refund-request-1',
      organizerId: 'organization-1',
      attendeeUserId: 'attendee-1',
      decision: 'approve',
      status: 'approved',
      decisionReason: 'Approved after organizer review',
      decidedByUserId: 'organizer-user-1',
    });
    expect(result.decisionAt.toISOString()).toBe('2026-02-23T21:00:00.000Z');

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockSet).toHaveBeenCalledTimes(1);

    const updatePayload = mockSet.mock.calls[0]![0] as Record<string, unknown>;
    expect(updatePayload.status).toBe('approved');
    expect(updatePayload.decisionReason).toBe('Approved after organizer review');
    expect(updatePayload.decisionAt).toBe(now);
    expect(updatePayload.decidedByUserId).toBe('organizer-user-1');
  });

  it('persists deny decision with deterministic status mapping', async () => {
    mockReturning.mockResolvedValueOnce([
      {
        refundRequestId: 'refund-request-2',
        registrationId: 'registration-2',
        organizerId: 'organization-1',
        attendeeUserId: 'attendee-2',
        status: 'denied',
        decisionReason: 'Denied per policy terms',
        decisionAt: now,
        decidedByUserId: 'organizer-user-2',
        requestedAt: new Date('2026-02-23T20:00:00.000Z'),
      },
    ]);

    await expect(
      submitOrganizerRefundDecision({
        refundRequestId: 'refund-request-2',
        organizerId: 'organization-1',
        decidedByUserId: 'organizer-user-2',
        decision: 'deny',
        decisionReason: 'Denied per policy terms',
        now,
      }),
    ).resolves.toMatchObject({
      decision: 'deny',
      status: 'denied',
    });
  });

  it('rejects blank decision rationale', async () => {
    await expect(
      submitOrganizerRefundDecision({
        refundRequestId: 'refund-request-1',
        organizerId: 'organization-1',
        decidedByUserId: 'organizer-user-1',
        decision: 'approve',
        decisionReason: '   ',
        now,
      }),
    ).rejects.toMatchObject({
      code: 'REFUND_DECISION_REASON_REQUIRED',
    });

    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('rejects rationale longer than the deterministic max length', async () => {
    await expect(
      submitOrganizerRefundDecision({
        refundRequestId: 'refund-request-1',
        organizerId: 'organization-1',
        decidedByUserId: 'organizer-user-1',
        decision: 'approve',
        decisionReason: 'x'.repeat(2001),
        now,
      }),
    ).rejects.toMatchObject({
      code: 'REFUND_DECISION_REASON_TOO_LONG',
    });

    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('returns not-found when the refund request is missing for the organizer scope', async () => {
    mockReturning.mockResolvedValueOnce([]);
    mockFindFirstRefundRequest.mockResolvedValueOnce(null);

    await expect(
      submitOrganizerRefundDecision({
        refundRequestId: 'missing-request',
        organizerId: 'organization-1',
        decidedByUserId: 'organizer-user-1',
        decision: 'approve',
        decisionReason: 'Approved',
        now,
      }),
    ).rejects.toMatchObject({
      code: 'REFUND_REQUEST_NOT_FOUND',
    });
  });

  it('returns conflict when request is no longer pending', async () => {
    mockReturning.mockResolvedValueOnce([]);
    mockFindFirstRefundRequest.mockResolvedValueOnce({
      status: 'approved',
    });

    let caught: unknown;
    try {
      await submitOrganizerRefundDecision({
        refundRequestId: 'refund-request-1',
        organizerId: 'organization-1',
        decidedByUserId: 'organizer-user-1',
        decision: 'deny',
        decisionReason: 'Denied',
        now,
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(RefundDecisionSubmissionError);
    expect((caught as RefundDecisionSubmissionError).code).toBe('REFUND_REQUEST_NOT_PENDING');
  });
});
