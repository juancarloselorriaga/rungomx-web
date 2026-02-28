const mockRequireAuthenticatedUser = jest.fn();
const mockGetOrgMembership = jest.fn();
const mockRequireOrgPermission = jest.fn();
const mockInitiateGoodwillRefundRequest = jest.fn();
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

jest.mock('@/lib/payments/refunds/escalation-and-goodwill', () => {
  const actual = jest.requireActual('@/lib/payments/refunds/escalation-and-goodwill');
  return {
    ...actual,
    initiateGoodwillRefundRequest: (...args: unknown[]) =>
      mockInitiateGoodwillRefundRequest(...args),
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

import { POST } from '@/app/api/payments/refunds/goodwill/route';
import { RefundEscalationGoodwillError } from '@/lib/payments/refunds/escalation-and-goodwill';

describe('POST /api/payments/refunds/goodwill', () => {
  beforeEach(() => {
    mockRequireAuthenticatedUser.mockReset();
    mockGetOrgMembership.mockReset();
    mockRequireOrgPermission.mockReset();
    mockInitiateGoodwillRefundRequest.mockReset();
    mockFindOrganization.mockReset();

    mockRequireOrgPermission.mockImplementation(() => undefined);
    mockFindOrganization.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
    });
  });

  it('returns 401 when user is not authenticated', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({ user: null, permissions: { canManageEvents: false } });

    const response = await POST(
      new Request('http://localhost/api/payments/refunds/goodwill', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: '11111111-1111-4111-8111-111111111111',
          registrationId: '22222222-2222-4222-8222-222222222222',
          reasonNote: 'Manual goodwill',
        }),
      }),
    );

    expect(response.status).toBe(401);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('returns 400 for invalid JSON body', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({
      user: { id: 'admin-1' },
      permissions: { canManageEvents: true },
    });

    const response = await POST(
      new Request('http://localhost/api/payments/refunds/goodwill', {
        method: 'POST',
        body: '{invalid-json',
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Invalid JSON body' });
    expect(mockFindOrganization).not.toHaveBeenCalled();
    expect(mockInitiateGoodwillRefundRequest).not.toHaveBeenCalled();
  });

  it('returns 400 for payload validation errors', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({
      user: { id: 'admin-1' },
      permissions: { canManageEvents: true },
    });

    const response = await POST(
      new Request('http://localhost/api/payments/refunds/goodwill', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: 'not-a-uuid',
          registrationId: '22222222-2222-4222-8222-222222222222',
          reasonNote: '   ',
        }),
      }),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('Invalid goodwill initiation payload');
    expect(body.details).toBeDefined();
    expect(mockFindOrganization).not.toHaveBeenCalled();
    expect(mockInitiateGoodwillRefundRequest).not.toHaveBeenCalled();
  });

  it('returns 403 when requester lacks organizer permission', async () => {
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
      new Request('http://localhost/api/payments/refunds/goodwill', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: '11111111-1111-4111-8111-111111111111',
          registrationId: '22222222-2222-4222-8222-222222222222',
          reasonNote: 'Manual goodwill',
        }),
      }),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Permission denied' });
    expect(mockInitiateGoodwillRefundRequest).not.toHaveBeenCalled();
  });

  it('returns 404 when organization does not exist', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({
      user: { id: 'admin-1' },
      permissions: { canManageEvents: true },
    });
    mockFindOrganization.mockResolvedValueOnce(null);

    const response = await POST(
      new Request('http://localhost/api/payments/refunds/goodwill', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: '11111111-1111-4111-8111-111111111111',
          registrationId: '22222222-2222-4222-8222-222222222222',
          reasonNote: 'Manual goodwill',
        }),
      }),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Organization not found' });
    expect(mockInitiateGoodwillRefundRequest).not.toHaveBeenCalled();
  });

  it('maps goodwill target-not-found to 404', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({
      user: { id: 'admin-1' },
      permissions: { canManageEvents: true },
    });
    mockInitiateGoodwillRefundRequest.mockRejectedValue(
      new RefundEscalationGoodwillError(
        'GOODWILL_TARGET_NOT_FOUND',
        'Registration context was not found for goodwill initiation.',
      ),
    );

    const response = await POST(
      new Request('http://localhost/api/payments/refunds/goodwill', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: '11111111-1111-4111-8111-111111111111',
          registrationId: '22222222-2222-4222-8222-222222222222',
          reasonNote: 'Manual goodwill',
        }),
      }),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: 'Goodwill target not found',
      code: 'GOODWILL_TARGET_NOT_FOUND',
    });
    expect(mockGetOrgMembership).not.toHaveBeenCalled();
    expect(mockRequireOrgPermission).not.toHaveBeenCalled();
  });

  it('maps goodwill conflict errors to 409', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({
      user: { id: 'admin-1' },
      permissions: { canManageEvents: true },
    });
    mockInitiateGoodwillRefundRequest.mockRejectedValue(
      new RefundEscalationGoodwillError(
        'GOODWILL_ALREADY_OPEN',
        'An open refund workflow already exists for this registration.',
      ),
    );

    const response = await POST(
      new Request('http://localhost/api/payments/refunds/goodwill', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: '11111111-1111-4111-8111-111111111111',
          registrationId: '22222222-2222-4222-8222-222222222222',
          reasonNote: 'Manual goodwill',
        }),
      }),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: 'Goodwill request cannot be created',
      code: 'GOODWILL_ALREADY_OPEN',
      reason: 'An open refund workflow already exists for this registration.',
    });
  });

  it('maps goodwill attendee-missing errors to 409', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({
      user: { id: 'admin-1' },
      permissions: { canManageEvents: true },
    });
    mockInitiateGoodwillRefundRequest.mockRejectedValue(
      new RefundEscalationGoodwillError(
        'GOODWILL_ATTENDEE_MISSING',
        'Goodwill initiation requires an attendee user linked to the registration.',
      ),
    );

    const response = await POST(
      new Request('http://localhost/api/payments/refunds/goodwill', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: '11111111-1111-4111-8111-111111111111',
          registrationId: '22222222-2222-4222-8222-222222222222',
          reasonNote: 'Manual goodwill',
        }),
      }),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: 'Goodwill request cannot be created',
      code: 'GOODWILL_ATTENDEE_MISSING',
      reason: 'Goodwill initiation requires an attendee user linked to the registration.',
    });
  });

  it('maps non-conflict goodwill domain errors to 400', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({
      user: { id: 'admin-1' },
      permissions: { canManageEvents: true },
    });
    mockInitiateGoodwillRefundRequest.mockRejectedValue(
      new RefundEscalationGoodwillError(
        'GOODWILL_INSERT_FAILED',
        'Goodwill refund request could not be created.',
      ),
    );

    const response = await POST(
      new Request('http://localhost/api/payments/refunds/goodwill', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: '11111111-1111-4111-8111-111111111111',
          registrationId: '22222222-2222-4222-8222-222222222222',
          reasonNote: 'Manual goodwill',
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'Invalid goodwill request',
      code: 'GOODWILL_INSERT_FAILED',
      reason: 'Goodwill refund request could not be created.',
    });
  });

  it('returns 500 for unexpected errors', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({
      user: { id: 'admin-1' },
      permissions: { canManageEvents: true },
    });
    mockInitiateGoodwillRefundRequest.mockRejectedValue(new Error('Unexpected failure'));
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await POST(
      new Request('http://localhost/api/payments/refunds/goodwill', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: '11111111-1111-4111-8111-111111111111',
          registrationId: '22222222-2222-4222-8222-222222222222',
          reasonNote: 'Manual goodwill',
        }),
      }),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Server error' });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[payments-refunds] Failed to initiate goodwill refund request',
      expect.objectContaining({
        organizationId: '11111111-1111-4111-8111-111111111111',
        registrationId: '22222222-2222-4222-8222-222222222222',
        actorUserId: 'admin-1',
      }),
    );

    consoleErrorSpy.mockRestore();
  });

  it('returns 201 with goodwill queue payload when request succeeds', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({
      user: { id: 'admin-1' },
      permissions: { canManageEvents: false },
    });
    mockGetOrgMembership.mockResolvedValue({
      organizationId: '11111111-1111-4111-8111-111111111111',
      role: 'owner',
    });
    mockInitiateGoodwillRefundRequest.mockResolvedValue({
      refundRequestId: 'goodwill-request-1',
      registrationId: '22222222-2222-4222-8222-222222222222',
      organizerId: '11111111-1111-4111-8111-111111111111',
      attendeeUserId: 'attendee-1',
      status: 'escalated_admin_review',
      reasonCode: 'goodwill_manual',
      reasonNote: 'Manual goodwill',
      requestedByUserId: 'admin-1',
      requestedAt: new Date('2026-02-23T22:00:00.000Z'),
      escalatedAt: new Date('2026-02-23T22:00:00.000Z'),
      eligibilitySnapshot: { source: 'goodwill', version: 'refund-goodwill-initiation-v1' },
      financialSnapshot: { version: 'refund-goodwill-financial-v1' },
    });

    const response = await POST(
      new Request('http://localhost/api/payments/refunds/goodwill', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: '11111111-1111-4111-8111-111111111111',
          registrationId: '22222222-2222-4222-8222-222222222222',
          reasonNote: 'Manual goodwill',
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(response.headers.get('Cache-Control')).toBe('no-store');

    const body = await response.json();
    expect(body.data).toMatchObject({
      refundRequestId: 'goodwill-request-1',
      registrationId: '22222222-2222-4222-8222-222222222222',
      organizerId: '11111111-1111-4111-8111-111111111111',
      attendeeUserId: 'attendee-1',
      status: 'escalated_admin_review',
      reasonCode: 'goodwill_manual',
      reasonNote: 'Manual goodwill',
      requestedByUserId: 'admin-1',
      requestedAt: '2026-02-23T22:00:00.000Z',
      escalatedAt: '2026-02-23T22:00:00.000Z',
      eligibilitySnapshot: { source: 'goodwill', version: 'refund-goodwill-initiation-v1' },
      financialSnapshot: { version: 'refund-goodwill-financial-v1' },
    });
  });
});
