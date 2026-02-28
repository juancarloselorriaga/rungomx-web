const mockRequireAuthenticatedUser = jest.fn();
const mockGetOrgMembership = jest.fn();
const mockRequireOrgPermission = jest.fn();
const mockCreatePayoutQuoteAndContract = jest.fn();
const mockFindOrganization = jest.fn();

jest.mock('@/lib/auth/guards', () => {
  class MockUnauthenticatedError extends Error {}

  return {
    requireAuthenticatedUser: async (...args: unknown[]) => {
      const value = await mockRequireAuthenticatedUser(...args);
      if (!value?.user) {
        throw new MockUnauthenticatedError('Authentication required');
      }
      return value;
    },
    UnauthenticatedError: MockUnauthenticatedError,
  };
});

jest.mock('@/lib/organizations/permissions', () => ({
  getOrgMembership: (...args: unknown[]) => mockGetOrgMembership(...args),
  requireOrgPermission: (...args: unknown[]) => mockRequireOrgPermission(...args),
}));

jest.mock('@/lib/payments/payouts/quote-contract', () => {
  class MockPayoutQuoteContractError extends Error {
    public readonly code: string;

    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  }

  return {
    PayoutQuoteContractError: MockPayoutQuoteContractError,
    createPayoutQuoteAndContract: (...args: unknown[]) => mockCreatePayoutQuoteAndContract(...args),
  };
});

jest.mock('@/db', () => ({
  db: {
    query: {
      organizations: {
        findFirst: (...args: unknown[]) => mockFindOrganization(...args),
      },
    },
  },
}));

import { POST } from '@/app/api/payments/payouts/route';
import { PayoutQuoteContractError } from '@/lib/payments/payouts/quote-contract';

describe('POST /api/payments/payouts', () => {
  beforeEach(() => {
    mockRequireAuthenticatedUser.mockReset();
    mockGetOrgMembership.mockReset();
    mockRequireOrgPermission.mockReset();
    mockCreatePayoutQuoteAndContract.mockReset();
    mockFindOrganization.mockReset();

    mockRequireOrgPermission.mockImplementation(() => undefined);
    mockFindOrganization.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
    });
  });

  it('returns 401 when requester is unauthenticated', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({ user: null, permissions: { canManageEvents: false } });

    const response = await POST(
      new Request('http://localhost/api/payments/payouts', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: '11111111-1111-4111-8111-111111111111',
          idempotencyKey: 'withdrawal-1',
        }),
      }),
    );

    expect(response.status).toBe(401);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('returns 400 for invalid payload', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({
      user: { id: 'organizer-user-1' },
      permissions: { canManageEvents: true },
    });

    const response = await POST(
      new Request('http://localhost/api/payments/payouts', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: 'not-a-uuid',
          idempotencyKey: '',
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(mockCreatePayoutQuoteAndContract).not.toHaveBeenCalled();
  });

  it('returns 403 when requester lacks organizer permissions', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({
      user: { id: 'organizer-user-1' },
      permissions: { canManageEvents: false },
    });
    mockGetOrgMembership.mockResolvedValue({
      organizationId: '11111111-1111-4111-8111-111111111111',
      role: 'viewer',
    });
    mockRequireOrgPermission.mockImplementationOnce(() => {
      throw new Error('Permission denied');
    });

    const response = await POST(
      new Request('http://localhost/api/payments/payouts', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: '11111111-1111-4111-8111-111111111111',
          idempotencyKey: 'withdrawal-1',
        }),
      }),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Permission denied' });
  });

  it('returns 404 when organization does not exist', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({
      user: { id: 'organizer-user-1' },
      permissions: { canManageEvents: true },
    });
    mockFindOrganization.mockResolvedValue(null);

    const response = await POST(
      new Request('http://localhost/api/payments/payouts', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: '11111111-1111-4111-8111-111111111111',
          idempotencyKey: 'withdrawal-1',
        }),
      }),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Organization not found' });
  });

  it('maps payout ineligibility errors to 409', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({
      user: { id: 'organizer-user-1' },
      permissions: { canManageEvents: true },
    });
    mockCreatePayoutQuoteAndContract.mockRejectedValue(
      new PayoutQuoteContractError(
        'PAYOUT_NOT_ELIGIBLE',
        'Organizer is not eligible for immediate payout because max withdrawable amount is zero.',
      ),
    );

    const response = await POST(
      new Request('http://localhost/api/payments/payouts', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: '11111111-1111-4111-8111-111111111111',
          idempotencyKey: 'withdrawal-1',
        }),
      }),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: 'Payout quote request is not eligible',
      code: 'PAYOUT_NOT_ELIGIBLE',
      reason: 'Organizer is not eligible for immediate payout because max withdrawable amount is zero.',
    });
  });

  it('maps active payout lifecycle reject conflicts to 409', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({
      user: { id: 'organizer-user-1' },
      permissions: { canManageEvents: true },
    });
    mockCreatePayoutQuoteAndContract.mockRejectedValue(
      new PayoutQuoteContractError(
        'PAYOUT_REQUEST_ACTIVE_CONFLICT_REJECTED',
        'Organizer already has an active payout lifecycle. reasonCode=active_processing_payout_exists policyOutcome=reject',
      ),
    );

    const response = await POST(
      new Request('http://localhost/api/payments/payouts', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: '11111111-1111-4111-8111-111111111111',
          idempotencyKey: 'withdrawal-active-conflict',
        }),
      }),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: 'Payout request conflicts with active payout lifecycle',
      code: 'PAYOUT_REQUEST_ACTIVE_CONFLICT_REJECTED',
      reason:
        'Organizer already has an active payout lifecycle. reasonCode=active_processing_payout_exists policyOutcome=reject',
    });
  });

  it('maps queue-required active lifecycle conflicts to 409 with suggested action', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({
      user: { id: 'organizer-user-1' },
      permissions: { canManageEvents: true },
    });
    mockCreatePayoutQuoteAndContract.mockRejectedValue(
      new PayoutQuoteContractError(
        'PAYOUT_REQUEST_ACTIVE_CONFLICT_QUEUE_REQUIRED',
        'Organizer already has an active payout lifecycle. reasonCode=active_requested_payout_exists policyOutcome=queue',
      ),
    );

    const response = await POST(
      new Request('http://localhost/api/payments/payouts', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: '11111111-1111-4111-8111-111111111111',
          requestedAmountMinor: 9000,
          idempotencyKey: 'withdrawal-active-conflict-queue',
          activeConflictPolicy: 'queue',
        }),
      }),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: 'Payout request conflicts with active lifecycle and should be queued',
      code: 'PAYOUT_REQUEST_ACTIVE_CONFLICT_QUEUE_REQUIRED',
      reason:
        'Organizer already has an active payout lifecycle. reasonCode=active_requested_payout_exists policyOutcome=queue',
      suggestedAction: 'submit_queue_intent',
    });
  });

  it('maps persistence failures to 500', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({
      user: { id: 'organizer-user-1' },
      permissions: { canManageEvents: true },
    });
    mockCreatePayoutQuoteAndContract.mockRejectedValue(
      new PayoutQuoteContractError(
        'PAYOUT_REQUEST_INSERT_FAILED',
        'Payout request could not be persisted.',
      ),
    );

    const response = await POST(
      new Request('http://localhost/api/payments/payouts', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: '11111111-1111-4111-8111-111111111111',
          idempotencyKey: 'withdrawal-1',
        }),
      }),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: 'Payout quote could not be persisted',
      code: 'PAYOUT_REQUEST_INSERT_FAILED',
      reason: 'Payout request could not be persisted.',
    });
  });

  it('1.2-API-001 persists trace-linked payout command outcome with ingress metadata', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({
      user: { id: 'organizer-user-1' },
      permissions: { canManageEvents: true },
    });
    mockCreatePayoutQuoteAndContract.mockResolvedValue({
      payoutQuoteId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      payoutRequestId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      payoutContractId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      organizerId: '11111111-1111-4111-8111-111111111111',
      quoteFingerprint: 'f'.repeat(64),
      currency: 'MXN',
      includedAmountMinor: 12000,
      deductionAmountMinor: 2000,
      maxWithdrawableAmountMinor: 10000,
      requestedAmountMinor: 9000,
      traceId: 'payout-request:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      requestedAt: new Date('2026-02-25T18:00:00.000Z'),
      idempotencyReused: false,
      ingressDeduplicated: false,
      eligibilitySnapshot: { version: 'payout-quote-eligibility-v1' },
      componentBreakdown: { version: 'payout-quote-components-v1' },
      contractBaseline: { version: 'payout-contract-v1' },
    });

    const response = await POST(
      new Request('http://localhost/api/payments/payouts', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: '11111111-1111-4111-8111-111111111111',
          requestedAmountMinor: 9000,
          idempotencyKey: 'withdrawal-1',
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const body = await response.json();
    expect(body.data).toMatchObject({
      payoutQuoteId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      payoutRequestId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      payoutContractId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      currency: 'MXN',
      maxWithdrawableAmountMinor: 10000,
      requestedAmountMinor: 9000,
      idempotencyReused: false,
      ingressDeduplicated: false,
      requestedAt: '2026-02-25T18:00:00.000Z',
    });
  });

  it('1.2-API-003 routes payout mutation requests through ingress-backed contract service', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({
      user: { id: 'organizer-user-1' },
      permissions: { canManageEvents: true },
    });
    mockCreatePayoutQuoteAndContract.mockResolvedValue({
      payoutQuoteId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      payoutRequestId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      payoutContractId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      organizerId: '11111111-1111-4111-8111-111111111111',
      quoteFingerprint: 'f'.repeat(64),
      currency: 'MXN',
      includedAmountMinor: 12000,
      deductionAmountMinor: 2000,
      maxWithdrawableAmountMinor: 10000,
      requestedAmountMinor: 9000,
      traceId: 'payout-request:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      requestedAt: new Date('2026-02-25T18:00:00.000Z'),
      idempotencyReused: false,
      ingressDeduplicated: false,
      eligibilitySnapshot: { version: 'payout-quote-eligibility-v1' },
      componentBreakdown: { version: 'payout-quote-components-v1' },
      contractBaseline: { version: 'payout-contract-v1' },
    });

    const response = await POST(
      new Request('http://localhost/api/payments/payouts', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: '11111111-1111-4111-8111-111111111111',
          requestedAmountMinor: 9000,
          idempotencyKey: 'withdrawal-1',
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(mockCreatePayoutQuoteAndContract).toHaveBeenCalledTimes(1);
    expect(mockCreatePayoutQuoteAndContract).toHaveBeenCalledWith({
      organizerId: '11111111-1111-4111-8111-111111111111',
      requestedByUserId: 'organizer-user-1',
      requestedAmountMinor: 9000,
      idempotencyKey: 'withdrawal-1',
      activeConflictPolicy: undefined,
    });
  });

  it('1.3-API-001 reuses canonical payout outcome for duplicate idempotency keys', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({
      user: { id: 'organizer-user-1' },
      permissions: { canManageEvents: true },
    });
    mockCreatePayoutQuoteAndContract.mockResolvedValue({
      payoutQuoteId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      payoutRequestId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      payoutContractId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      organizerId: '11111111-1111-4111-8111-111111111111',
      quoteFingerprint: 'f'.repeat(64),
      currency: 'MXN',
      includedAmountMinor: 12000,
      deductionAmountMinor: 2000,
      maxWithdrawableAmountMinor: 10000,
      requestedAmountMinor: 9000,
      traceId: 'payout-request:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      requestedAt: new Date('2026-02-25T18:00:00.000Z'),
      idempotencyReused: true,
      ingressDeduplicated: true,
      eligibilitySnapshot: { version: 'payout-quote-eligibility-v1' },
      componentBreakdown: { version: 'payout-quote-components-v1' },
      contractBaseline: { version: 'payout-contract-v1' },
    });

    const response = await POST(
      new Request('http://localhost/api/payments/payouts', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: '11111111-1111-4111-8111-111111111111',
          idempotencyKey: 'withdrawal-1',
        }),
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.idempotencyReused).toBe(true);
  });

  it('1.3-API-003 keeps duplicate ingestion on the ingress-backed payout contract path', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({
      user: { id: 'organizer-user-1' },
      permissions: { canManageEvents: true },
    });
    mockCreatePayoutQuoteAndContract.mockResolvedValue({
      payoutQuoteId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      payoutRequestId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      payoutContractId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      organizerId: '11111111-1111-4111-8111-111111111111',
      quoteFingerprint: 'f'.repeat(64),
      currency: 'MXN',
      includedAmountMinor: 12000,
      deductionAmountMinor: 2000,
      maxWithdrawableAmountMinor: 10000,
      requestedAmountMinor: 9000,
      traceId: 'payout-request:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      requestedAt: new Date('2026-02-25T18:00:00.000Z'),
      idempotencyReused: true,
      ingressDeduplicated: true,
      eligibilitySnapshot: { version: 'payout-quote-eligibility-v1' },
      componentBreakdown: { version: 'payout-quote-components-v1' },
      contractBaseline: { version: 'payout-contract-v1' },
    });

    const response = await POST(
      new Request('http://localhost/api/payments/payouts', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: '11111111-1111-4111-8111-111111111111',
          idempotencyKey: 'withdrawal-1',
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mockCreatePayoutQuoteAndContract).toHaveBeenCalledTimes(1);
    expect(mockCreatePayoutQuoteAndContract).toHaveBeenCalledWith(
      expect.objectContaining({
        organizerId: '11111111-1111-4111-8111-111111111111',
        requestedByUserId: 'organizer-user-1',
        idempotencyKey: 'withdrawal-1',
      }),
    );
  });
});
