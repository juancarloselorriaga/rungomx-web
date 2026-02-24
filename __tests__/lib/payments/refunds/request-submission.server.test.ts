const mockGetRegistrationForOwnerOrThrow = jest.fn();
const mockSelect = jest.fn();
const mockFindFirstRefundRequest = jest.fn();
const mockInsert = jest.fn();
const mockValues = jest.fn();
const mockReturning = jest.fn();

const editionContextQueue: Array<Array<Record<string, unknown>>> = [];

jest.mock('@/lib/events/registrations/ownership', () => ({
  getRegistrationForOwnerOrThrow: (...args: unknown[]) => mockGetRegistrationForOwnerOrThrow(...args),
  RegistrationOwnershipError: class RegistrationOwnershipError extends Error {
    code: 'NOT_FOUND' | 'FORBIDDEN';

    constructor(code: 'NOT_FOUND' | 'FORBIDDEN', message: string) {
      super(message);
      this.code = code;
    }
  },
}));

jest.mock('@/db', () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    query: {
      refundRequests: {
        findFirst: (...args: unknown[]) => mockFindFirstRefundRequest(...args),
      },
    },
    insert: (...args: unknown[]) => mockInsert(...args),
  },
}));

import {
  RefundRequestEligibilityError,
  submitAttendeeRefundRequest,
} from '@/lib/payments/refunds/request-submission';

describe('refund request submission', () => {
  const now = new Date('2026-02-23T19:00:00.000Z');

  beforeEach(() => {
    editionContextQueue.length = 0;

    mockGetRegistrationForOwnerOrThrow.mockReset();
    mockSelect.mockReset();
    mockFindFirstRefundRequest.mockReset();
    mockInsert.mockReset();
    mockValues.mockReset();
    mockReturning.mockReset();

    mockSelect.mockImplementation(() => ({
      from: () => ({
        innerJoin: () => ({
          leftJoin: () => ({
            where: () => ({
              limit: async () => editionContextQueue.shift() ?? [],
            }),
          }),
        }),
      }),
    }));

    mockInsert.mockImplementation(() => ({
      values: (...args: unknown[]) => {
        mockValues(...args);
        return {
          returning: (...returningArgs: unknown[]) => mockReturning(...returningArgs),
        };
      },
    }));

    mockFindFirstRefundRequest.mockResolvedValue(null);

    mockGetRegistrationForOwnerOrThrow.mockResolvedValue({
      id: 'registration-1',
      editionId: 'edition-1',
      status: 'confirmed',
      basePriceCents: 1000,
      feesCents: 120,
      taxCents: 80,
      totalCents: 1200,
    });

    editionContextQueue.push([
      {
        editionId: 'edition-1',
        timezone: 'America/Mexico_City',
        organizerId: 'organization-1',
        refundsAllowed: true,
        refundPolicyText: 'Refunds available before cutoff.',
        refundDeadline: new Date('2026-02-25T12:00:00.000Z'),
      },
    ]);

    mockReturning.mockResolvedValue([
      {
        id: 'refund-request-1',
        registrationId: 'registration-1',
        editionId: 'edition-1',
        organizerId: 'organization-1',
        attendeeUserId: 'attendee-1',
        status: 'pending_organizer_decision',
        reasonCode: 'medical',
        reasonNote: 'Need to travel',
        requestedAt: now,
      },
    ]);
  });

  it('creates a pending refund request with deterministic policy and financial snapshots', async () => {
    const result = await submitAttendeeRefundRequest({
      registrationId: 'registration-1',
      attendeeUserId: 'attendee-1',
      reasonCode: 'medical',
      reasonNote: '  Need to travel  ',
      now,
    });

    expect(result).toMatchObject({
      id: 'refund-request-1',
      registrationId: 'registration-1',
      editionId: 'edition-1',
      organizerId: 'organization-1',
      attendeeUserId: 'attendee-1',
      status: 'pending_organizer_decision',
      reasonCode: 'medical',
      reasonNote: 'Need to travel',
    });

    expect(result.eligibilitySnapshot).toMatchObject({
      version: 'refund-request-eligibility-v1',
      decision: 'eligible',
      reasonCode: 'ELIGIBLE',
      baseline: 'registration_status_confirmed_only',
      deadlineRule: 'policy_deadline_if_configured_else_open',
      policy: {
        refundsAllowed: true,
        refundPolicyText: 'Refunds available before cutoff.',
        refundDeadline: '2026-02-25T12:00:00.000Z',
        timezone: 'America/Mexico_City',
      },
    });

    expect(result.financialSnapshot).toEqual({
      version: 'refund-request-financial-v1',
      currency: 'MXN',
      totalPaidMinor: 1200,
      nonRefundableServiceFeeMinor: 120,
      maxRefundableToAttendeeMinor: 1080,
      serviceFeePolicy: 'non_refundable_always',
    });

    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockValues).toHaveBeenCalledTimes(1);

    const insertedPayload = mockValues.mock.calls[0]![0] as Record<string, unknown>;
    expect(insertedPayload.status).toBe('pending_organizer_decision');
    expect(insertedPayload.reasonCode).toBe('medical');
    expect(insertedPayload.reasonNote).toBe('Need to travel');
    expect(insertedPayload.eligibilitySnapshotJson).toMatchObject({
      baseline: 'registration_status_confirmed_only',
    });
    expect(insertedPayload.financialSnapshotJson).toMatchObject({
      serviceFeePolicy: 'non_refundable_always',
      nonRefundableServiceFeeMinor: 120,
    });
  });

  it('applies deadline fallback behavior when refundDeadline is not configured', async () => {
    editionContextQueue.length = 0;
    editionContextQueue.push([
      {
        editionId: 'edition-1',
        timezone: 'America/Mexico_City',
        organizerId: 'organization-1',
        refundsAllowed: true,
        refundPolicyText: null,
        refundDeadline: null,
      },
    ]);

    await expect(
      submitAttendeeRefundRequest({
        registrationId: 'registration-1',
        attendeeUserId: 'attendee-1',
        reasonCode: 'other',
        now,
      }),
    ).resolves.toMatchObject({
      status: 'pending_organizer_decision',
    });

    const insertedPayload = mockValues.mock.calls[0]![0] as Record<string, unknown>;
    const eligibilitySnapshot = insertedPayload.eligibilitySnapshotJson as Record<string, unknown>;
    expect(
      (eligibilitySnapshot.policy as Record<string, unknown>).refundDeadline,
    ).toBeNull();
  });

  it('rejects and performs no writes when refunds are disabled', async () => {
    editionContextQueue.length = 0;
    editionContextQueue.push([
      {
        editionId: 'edition-1',
        timezone: 'America/Mexico_City',
        organizerId: 'organization-1',
        refundsAllowed: false,
        refundPolicyText: 'No refunds.',
        refundDeadline: null,
      },
    ]);

    await expect(
      submitAttendeeRefundRequest({
        registrationId: 'registration-1',
        attendeeUserId: 'attendee-1',
        reasonCode: 'other',
        now,
      }),
    ).rejects.toMatchObject({
      code: 'REFUNDS_DISABLED',
    });

    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('rejects non-confirmed registrations by baseline policy and performs no writes', async () => {
    mockGetRegistrationForOwnerOrThrow.mockResolvedValueOnce({
      id: 'registration-1',
      editionId: 'edition-1',
      status: 'payment_pending',
      basePriceCents: 1000,
      feesCents: 100,
      taxCents: 0,
      totalCents: 1100,
    });

    await expect(
      submitAttendeeRefundRequest({
        registrationId: 'registration-1',
        attendeeUserId: 'attendee-1',
        reasonCode: 'injury',
        now,
      }),
    ).rejects.toMatchObject({
      code: 'REGISTRATION_NOT_CONFIRMED',
    });

    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('rejects when deadline is expired and performs no writes', async () => {
    editionContextQueue.length = 0;
    editionContextQueue.push([
      {
        editionId: 'edition-1',
        timezone: 'America/Mexico_City',
        organizerId: 'organization-1',
        refundsAllowed: true,
        refundPolicyText: 'Deadline passed.',
        refundDeadline: new Date('2026-02-23T18:59:00.000Z'),
      },
    ]);

    await expect(
      submitAttendeeRefundRequest({
        registrationId: 'registration-1',
        attendeeUserId: 'attendee-1',
        reasonCode: 'event_changed',
        now,
      }),
    ).rejects.toMatchObject({
      code: 'REFUND_DEADLINE_EXPIRED',
    });

    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('rejects when a pending request already exists', async () => {
    mockFindFirstRefundRequest.mockResolvedValueOnce({
      id: 'refund-request-existing',
    });

    await expect(
      submitAttendeeRefundRequest({
        registrationId: 'registration-1',
        attendeeUserId: 'attendee-1',
        reasonCode: 'medical',
        now,
      }),
    ).rejects.toMatchObject({
      code: 'REFUND_ALREADY_PENDING',
    });

    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('maps unique-constraint races to deterministic pending-request ineligibility', async () => {
    const duplicateError = Object.assign(new Error('duplicate key'), { code: '23505' });
    mockReturning.mockRejectedValueOnce(duplicateError);

    let caught: unknown;
    try {
      await submitAttendeeRefundRequest({
        registrationId: 'registration-1',
        attendeeUserId: 'attendee-1',
        reasonCode: 'medical',
        now,
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(RefundRequestEligibilityError);
    expect((caught as RefundRequestEligibilityError).code).toBe('REFUND_ALREADY_PENDING');
  });
});
