const mockGetAuthContext = jest.fn();
const mockGetOrgMembership = jest.fn();
const mockRequireOrgPermission = jest.fn();
const mockSubmitOrganizerRefundDecision = jest.fn();
const mockFindOrganization = jest.fn();

jest.mock('@/lib/auth/server', () => ({
  getAuthContext: (...args: unknown[]) => mockGetAuthContext(...args),
}));

jest.mock('@/lib/organizations/permissions', () => ({
  getOrgMembership: (...args: unknown[]) => mockGetOrgMembership(...args),
  requireOrgPermission: (...args: unknown[]) => mockRequireOrgPermission(...args),
}));

jest.mock('@/lib/payments/refunds/decision-submission', () => {
  const actual = jest.requireActual('@/lib/payments/refunds/decision-submission');
  return {
    ...actual,
    submitOrganizerRefundDecision: (...args: unknown[]) =>
      mockSubmitOrganizerRefundDecision(...args),
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

import { PATCH } from '@/app/api/payments/refunds/[refundRequestId]/route';
import { RefundDecisionSubmissionError } from '@/lib/payments/refunds/decision-submission';

function createRouteContext(refundRequestId: string) {
  return {
    params: Promise.resolve({ refundRequestId }),
  };
}

describe('PATCH /api/payments/refunds/[refundRequestId]', () => {
  beforeEach(() => {
    mockGetAuthContext.mockReset();
    mockGetOrgMembership.mockReset();
    mockRequireOrgPermission.mockReset();
    mockSubmitOrganizerRefundDecision.mockReset();
    mockFindOrganization.mockReset();

    mockRequireOrgPermission.mockImplementation(() => undefined);
    mockFindOrganization.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
    });
  });

  it('returns 401 when user is not authenticated', async () => {
    mockGetAuthContext.mockResolvedValue({ user: null, permissions: { canManageEvents: false } });

    const response = await PATCH(
      new Request('http://localhost/api/payments/refunds/22222222-2222-4222-8222-222222222222', {
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
    mockGetAuthContext.mockResolvedValue({
      user: { id: 'organizer-user-1' },
      permissions: { canManageEvents: true },
    });

    const response = await PATCH(
      new Request('http://localhost/api/payments/refunds/not-a-uuid', {
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
    mockGetAuthContext.mockResolvedValue({
      user: { id: 'organizer-user-1' },
      permissions: { canManageEvents: true },
    });

    const response = await PATCH(
      new Request('http://localhost/api/payments/refunds/22222222-2222-4222-8222-222222222222', {
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

  it('returns 403 when requester lacks organizer permission', async () => {
    mockGetAuthContext.mockResolvedValue({
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

    const response = await PATCH(
      new Request('http://localhost/api/payments/refunds/22222222-2222-4222-8222-222222222222', {
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
  });

  it('returns 404 when organization is not found', async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: 'organizer-user-1' },
      permissions: { canManageEvents: false },
    });
    mockGetOrgMembership.mockResolvedValue({
      organizationId: '11111111-1111-4111-8111-111111111111',
      role: 'admin',
    });
    mockFindOrganization.mockResolvedValue(null);

    const response = await PATCH(
      new Request('http://localhost/api/payments/refunds/22222222-2222-4222-8222-222222222222', {
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
    mockGetAuthContext.mockResolvedValue({
      user: { id: 'organizer-user-1' },
      permissions: { canManageEvents: true },
    });
    mockSubmitOrganizerRefundDecision.mockRejectedValue(
      new RefundDecisionSubmissionError('REFUND_REQUEST_NOT_FOUND', 'Refund request was not found.'),
    );

    const response = await PATCH(
      new Request('http://localhost/api/payments/refunds/22222222-2222-4222-8222-222222222222', {
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

  it('maps service conflict to 409', async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: 'organizer-user-1' },
      permissions: { canManageEvents: true },
    });
    mockSubmitOrganizerRefundDecision.mockRejectedValue(
      new RefundDecisionSubmissionError(
        'REFUND_REQUEST_NOT_PENDING',
        'Refund request cannot be decided because it is already approved.',
      ),
    );

    const response = await PATCH(
      new Request('http://localhost/api/payments/refunds/22222222-2222-4222-8222-222222222222', {
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
      code: 'REFUND_REQUEST_NOT_PENDING',
      reason: 'Refund request cannot be decided because it is already approved.',
    });
  });

  it('returns 200 with decision payload when submission succeeds', async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: 'organizer-user-1' },
      permissions: { canManageEvents: false },
    });
    mockGetOrgMembership.mockResolvedValue({
      organizationId: '11111111-1111-4111-8111-111111111111',
      role: 'owner',
    });
    mockSubmitOrganizerRefundDecision.mockResolvedValue({
      refundRequestId: '22222222-2222-4222-8222-222222222222',
      registrationId: '33333333-3333-4333-8333-333333333333',
      organizerId: '11111111-1111-4111-8111-111111111111',
      attendeeUserId: 'attendee-1',
      decision: 'approve',
      status: 'approved',
      decisionReason: 'Approved by organizer',
      decisionAt: new Date('2026-02-23T22:00:00.000Z'),
      decidedByUserId: 'organizer-user-1',
      requestedAt: new Date('2026-02-23T20:00:00.000Z'),
    });

    const response = await PATCH(
      new Request('http://localhost/api/payments/refunds/22222222-2222-4222-8222-222222222222', {
        method: 'PATCH',
        body: JSON.stringify({
          organizationId: '11111111-1111-4111-8111-111111111111',
          decision: 'approve',
          decisionReason: 'Approved by organizer',
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
      decisionReason: 'Approved by organizer',
      decisionAt: '2026-02-23T22:00:00.000Z',
      decidedByUserId: 'organizer-user-1',
      requestedAt: '2026-02-23T20:00:00.000Z',
    });

    expect(mockSubmitOrganizerRefundDecision).toHaveBeenCalledWith({
      refundRequestId: '22222222-2222-4222-8222-222222222222',
      organizerId: '11111111-1111-4111-8111-111111111111',
      decidedByUserId: 'organizer-user-1',
      decision: 'approve',
      decisionReason: 'Approved by organizer',
    });
  });
});
