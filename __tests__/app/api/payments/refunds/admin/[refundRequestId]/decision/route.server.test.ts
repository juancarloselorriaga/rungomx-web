const mockRequireAuthenticatedUser = jest.fn();
const mockSubmitAdminRefundDecision = jest.fn();
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

jest.mock('@/lib/payments/refunds/decision-submission', () => {
  const actual = jest.requireActual('@/lib/payments/refunds/decision-submission');
  return {
    ...actual,
    submitAdminRefundDecision: (...args: unknown[]) => mockSubmitAdminRefundDecision(...args),
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

import { PATCH } from '@/app/api/payments/refunds/admin/[refundRequestId]/decision/route';
import { RefundDecisionSubmissionError } from '@/lib/payments/refunds/decision-submission';

function createRouteContext(refundRequestId: string) {
  return {
    params: Promise.resolve({ refundRequestId }),
  };
}

describe('PATCH /api/payments/refunds/admin/[refundRequestId]/decision', () => {
  beforeEach(() => {
    mockRequireAuthenticatedUser.mockReset();
    mockSubmitAdminRefundDecision.mockReset();
    mockFindOrganization.mockReset();

    mockFindOrganization.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
    });
  });

  it('returns 401 when user is not authenticated', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({ user: null, permissions: {} });

    const response = await PATCH(
      new Request('http://localhost/api/payments/refunds/admin/22222222-2222-4222-8222-222222222222/decision', {
        method: 'PATCH',
        body: JSON.stringify({
          organizationId: '11111111-1111-4111-8111-111111111111',
          decision: 'approve',
          decisionReason: 'Approved',
        }),
      }),
      createRouteContext('22222222-2222-4222-8222-222222222222'),
    );

    expect(response.status).toBe(401);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('returns 400 when route param is invalid', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({
      user: { id: 'staff-user-1' },
      permissions: { canAccessAdminArea: true, canViewStaffTools: true },
    });

    const response = await PATCH(
      new Request('http://localhost/api/payments/refunds/admin/not-a-uuid/decision', {
        method: 'PATCH',
        body: JSON.stringify({
          organizationId: '11111111-1111-4111-8111-111111111111',
          decision: 'approve',
          decisionReason: 'Approved',
        }),
      }),
      createRouteContext('not-a-uuid'),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('Invalid refund request ID');
  });

  it('returns 400 for payload validation errors', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({
      user: { id: 'staff-user-1' },
      permissions: { canAccessAdminArea: true, canViewStaffTools: true },
    });

    const response = await PATCH(
      new Request('http://localhost/api/payments/refunds/admin/22222222-2222-4222-8222-222222222222/decision', {
        method: 'PATCH',
        body: JSON.stringify({
          organizationId: 'not-a-uuid',
          decision: 'invalid',
          decisionReason: '',
        }),
      }),
      createRouteContext('22222222-2222-4222-8222-222222222222'),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('Invalid refund decision payload');
    expect(body.details).toBeDefined();
  });

  it('returns 403 when requester is not internal staff', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({
      user: { id: 'organizer-user-1' },
      permissions: { canManageEvents: true, canAccessAdminArea: false },
    });

    const response = await PATCH(
      new Request('http://localhost/api/payments/refunds/admin/22222222-2222-4222-8222-222222222222/decision', {
        method: 'PATCH',
        body: JSON.stringify({
          organizationId: '11111111-1111-4111-8111-111111111111',
          decision: 'approve',
          decisionReason: 'Approved',
        }),
      }),
      createRouteContext('22222222-2222-4222-8222-222222222222'),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Permission denied' });
    expect(mockSubmitAdminRefundDecision).not.toHaveBeenCalled();
  });

  it('returns 404 when organization is not found', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({
      user: { id: 'staff-user-1' },
      permissions: { canAccessAdminArea: true, canViewStaffTools: true },
    });
    mockFindOrganization.mockResolvedValue(null);

    const response = await PATCH(
      new Request('http://localhost/api/payments/refunds/admin/22222222-2222-4222-8222-222222222222/decision', {
        method: 'PATCH',
        body: JSON.stringify({
          organizationId: '11111111-1111-4111-8111-111111111111',
          decision: 'approve',
          decisionReason: 'Approved',
        }),
      }),
      createRouteContext('22222222-2222-4222-8222-222222222222'),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Organization not found' });
  });

  it('maps service not-found to 404', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({
      user: { id: 'staff-user-1' },
      permissions: { canAccessAdminArea: true, canViewStaffTools: true },
    });
    mockSubmitAdminRefundDecision.mockRejectedValue(
      new RefundDecisionSubmissionError('REFUND_REQUEST_NOT_FOUND', 'Refund request was not found.'),
    );

    const response = await PATCH(
      new Request('http://localhost/api/payments/refunds/admin/22222222-2222-4222-8222-222222222222/decision', {
        method: 'PATCH',
        body: JSON.stringify({
          organizationId: '11111111-1111-4111-8111-111111111111',
          decision: 'deny',
          decisionReason: 'Denied by policy',
        }),
      }),
      createRouteContext('22222222-2222-4222-8222-222222222222'),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: 'Refund request not found',
      code: 'REFUND_REQUEST_NOT_FOUND',
    });
  });

  it('maps REFUND_REQUEST_NOT_IN_REVIEW to 409', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({
      user: { id: 'staff-user-1' },
      permissions: { canAccessAdminArea: true, canViewStaffTools: true },
    });
    mockSubmitAdminRefundDecision.mockRejectedValue(
      new RefundDecisionSubmissionError(
        'REFUND_REQUEST_NOT_IN_REVIEW',
        'Refund request cannot be decided because it is not awaiting admin review (currently approved).',
      ),
    );

    const response = await PATCH(
      new Request('http://localhost/api/payments/refunds/admin/22222222-2222-4222-8222-222222222222/decision', {
        method: 'PATCH',
        body: JSON.stringify({
          organizationId: '11111111-1111-4111-8111-111111111111',
          decision: 'deny',
          decisionReason: 'Denied by policy',
        }),
      }),
      createRouteContext('22222222-2222-4222-8222-222222222222'),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: 'Refund request cannot be decided',
      code: 'REFUND_REQUEST_NOT_IN_REVIEW',
      reason: 'Refund request cannot be decided because it is not awaiting admin review (currently approved).',
    });
  });

  it('returns 500 when decision submission throws an unexpected error', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({
      user: { id: 'staff-user-1' },
      permissions: { canAccessAdminArea: true, canViewStaffTools: true },
    });
    mockSubmitAdminRefundDecision.mockRejectedValue(new Error('Unexpected failure'));

    const response = await PATCH(
      new Request('http://localhost/api/payments/refunds/admin/22222222-2222-4222-8222-222222222222/decision', {
        method: 'PATCH',
        body: JSON.stringify({
          organizationId: '11111111-1111-4111-8111-111111111111',
          decision: 'approve',
          decisionReason: 'Approved',
        }),
      }),
      createRouteContext('22222222-2222-4222-8222-222222222222'),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Server error' });
  });

  it('returns 200 with decision payload when staff submission succeeds', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({
      user: { id: 'staff-user-1' },
      permissions: { canManageEvents: false, canAccessAdminArea: true, canViewStaffTools: true },
    });
    mockSubmitAdminRefundDecision.mockResolvedValue({
      refundRequestId: '22222222-2222-4222-8222-222222222222',
      registrationId: '33333333-3333-4333-8333-333333333333',
      organizerId: '11111111-1111-4111-8111-111111111111',
      attendeeUserId: 'attendee-1',
      decision: 'approve',
      status: 'approved',
      decisionReason: 'Approved by staff',
      decisionAt: new Date('2026-02-23T22:00:00.000Z'),
      decidedByUserId: 'staff-user-1',
      requestedAt: new Date('2026-02-23T20:00:00.000Z'),
    });

    const response = await PATCH(
      new Request('http://localhost/api/payments/refunds/admin/22222222-2222-4222-8222-222222222222/decision', {
        method: 'PATCH',
        body: JSON.stringify({
          organizationId: '11111111-1111-4111-8111-111111111111',
          decision: 'approve',
          decisionReason: 'Approved by staff',
        }),
      }),
      createRouteContext('22222222-2222-4222-8222-222222222222'),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');

    const body = await response.json();
    expect(body.data).toEqual({
      refundRequestId: '22222222-2222-4222-8222-222222222222',
      registrationId: '33333333-3333-4333-8333-333333333333',
      organizerId: '11111111-1111-4111-8111-111111111111',
      attendeeUserId: 'attendee-1',
      decision: 'approve',
      status: 'approved',
      decisionReason: 'Approved by staff',
      decisionAt: '2026-02-23T22:00:00.000Z',
      decidedByUserId: 'staff-user-1',
      requestedAt: '2026-02-23T20:00:00.000Z',
    });

    expect(mockSubmitAdminRefundDecision).toHaveBeenCalledWith({
      refundRequestId: '22222222-2222-4222-8222-222222222222',
      organizerId: '11111111-1111-4111-8111-111111111111',
      decidedByUserId: 'staff-user-1',
      decision: 'approve',
      decisionReason: 'Approved by staff',
    });
  });
});
