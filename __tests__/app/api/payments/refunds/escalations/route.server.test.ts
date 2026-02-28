const mockRequireAuthenticatedUser = jest.fn();
const mockGetOrgMembership = jest.fn();
const mockRequireOrgPermission = jest.fn();
const mockEscalateExpiredRefundRequests = jest.fn();
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
    escalateExpiredRefundRequests: (...args: unknown[]) =>
      mockEscalateExpiredRefundRequests(...args),
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

import { POST } from '@/app/api/payments/refunds/escalations/route';

describe('POST /api/payments/refunds/escalations', () => {
  beforeEach(() => {
    mockRequireAuthenticatedUser.mockReset();
    mockGetOrgMembership.mockReset();
    mockRequireOrgPermission.mockReset();
    mockEscalateExpiredRefundRequests.mockReset();
    mockFindOrganization.mockReset();

    mockRequireOrgPermission.mockImplementation(() => undefined);
    mockFindOrganization.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
    });
  });

  it('returns 401 when user is not authenticated', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({ user: null, permissions: { canManageEvents: false } });

    const response = await POST(
      new Request('http://localhost/api/payments/refunds/escalations', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: '11111111-1111-4111-8111-111111111111',
          requestedBefore: '2026-02-23T21:00:00.000Z',
        }),
      }),
    );

    expect(response.status).toBe(401);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('returns 400 for invalid payload', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({
      user: { id: 'admin-1' },
      permissions: { canManageEvents: true },
    });

    const response = await POST(
      new Request('http://localhost/api/payments/refunds/escalations', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: 'not-a-uuid',
          requestedBefore: 'not-a-date',
        }),
      }),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('Invalid refund escalation payload');
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
      new Request('http://localhost/api/payments/refunds/escalations', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: '11111111-1111-4111-8111-111111111111',
          requestedBefore: '2026-02-23T21:00:00.000Z',
        }),
      }),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Permission denied' });
  });

  it('returns escalation summary when request succeeds', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({
      user: { id: 'admin-1' },
      permissions: { canManageEvents: false },
    });
    mockGetOrgMembership.mockResolvedValue({
      organizationId: '11111111-1111-4111-8111-111111111111',
      role: 'owner',
    });
    mockEscalateExpiredRefundRequests.mockResolvedValue({
      organizerId: '11111111-1111-4111-8111-111111111111',
      actorUserId: 'admin-1',
      requestedBefore: new Date('2026-02-23T21:00:00.000Z'),
      escalatedAt: new Date('2026-02-23T22:00:00.000Z'),
      escalatedCount: 2,
      refundRequestIds: ['r1', 'r2'],
    });

    const response = await POST(
      new Request('http://localhost/api/payments/refunds/escalations', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: '11111111-1111-4111-8111-111111111111',
          requestedBefore: '2026-02-23T21:00:00.000Z',
          limit: 50,
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');

    const body = await response.json();
    expect(body.data).toEqual({
      organizerId: '11111111-1111-4111-8111-111111111111',
      actorUserId: 'admin-1',
      requestedBefore: '2026-02-23T21:00:00.000Z',
      escalatedAt: '2026-02-23T22:00:00.000Z',
      escalatedCount: 2,
      refundRequestIds: ['r1', 'r2'],
    });

    expect(mockEscalateExpiredRefundRequests).toHaveBeenCalledWith(
      expect.objectContaining({
        organizerId: '11111111-1111-4111-8111-111111111111',
        actorUserId: 'admin-1',
        requestedBefore: new Date('2026-02-23T21:00:00.000Z'),
        limit: 50,
      }),
    );
  });
});
