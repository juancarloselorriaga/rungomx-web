const mockRequireAuthenticatedUser = jest.fn();
const mockGetOrgMembership = jest.fn();
const mockRequireOrgPermission = jest.fn();
const mockListRefundAdminReviewQueue = jest.fn();
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
    listRefundAdminReviewQueue: (...args: unknown[]) => mockListRefundAdminReviewQueue(...args),
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

import { GET } from '@/app/api/payments/refunds/admin/review-queue/route';

describe('GET /api/payments/refunds/admin/review-queue', () => {
  beforeEach(() => {
    mockRequireAuthenticatedUser.mockReset();
    mockGetOrgMembership.mockReset();
    mockRequireOrgPermission.mockReset();
    mockListRefundAdminReviewQueue.mockReset();
    mockFindOrganization.mockReset();

    mockRequireOrgPermission.mockImplementation(() => undefined);
    mockFindOrganization.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
    });
  });

  it('returns 401 when user is not authenticated', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({ user: null, permissions: { canManageEvents: false } });

    const response = await GET(
      new Request(
        'http://localhost/api/payments/refunds/admin/review-queue?organizationId=11111111-1111-4111-8111-111111111111',
      ),
    );

    expect(response.status).toBe(401);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('returns 400 when query params are invalid', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({
      user: { id: 'admin-1' },
      permissions: { canManageEvents: true },
    });

    const response = await GET(
      new Request(
        'http://localhost/api/payments/refunds/admin/review-queue?organizationId=not-a-uuid&limit=nope',
      ),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('Invalid admin review queue query');
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

    const response = await GET(
      new Request(
        'http://localhost/api/payments/refunds/admin/review-queue?organizationId=11111111-1111-4111-8111-111111111111',
      ),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Permission denied' });
  });

  it('returns queue entries with deterministic metadata', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({
      user: { id: 'admin-1' },
      permissions: { canManageEvents: false },
    });
    mockGetOrgMembership.mockResolvedValue({
      organizationId: '11111111-1111-4111-8111-111111111111',
      role: 'owner',
    });
    mockListRefundAdminReviewQueue.mockResolvedValue([
      {
        refundRequestId: 'r1',
        registrationId: 'registration-1',
        organizerId: '11111111-1111-4111-8111-111111111111',
        attendeeUserId: 'attendee-1',
        requestedByUserId: 'admin-1',
        status: 'escalated_admin_review',
        reasonCode: 'goodwill_manual',
        reasonNote: 'Manual goodwill',
        requestedAt: new Date('2026-02-23T22:00:00.000Z'),
        escalatedAt: new Date('2026-02-23T22:05:00.000Z'),
        queueSource: 'goodwill',
      },
    ]);

    const response = await GET(
      new Request(
        'http://localhost/api/payments/refunds/admin/review-queue?organizationId=11111111-1111-4111-8111-111111111111&limit=25',
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');

    const body = await response.json();
    expect(body.data).toEqual([
      {
        refundRequestId: 'r1',
        registrationId: 'registration-1',
        organizerId: '11111111-1111-4111-8111-111111111111',
        attendeeUserId: 'attendee-1',
        requestedByUserId: 'admin-1',
        status: 'escalated_admin_review',
        reasonCode: 'goodwill_manual',
        reasonNote: 'Manual goodwill',
        requestedAt: '2026-02-23T22:00:00.000Z',
        escalatedAt: '2026-02-23T22:05:00.000Z',
        queueSource: 'goodwill',
      },
    ]);
    expect(body.meta).toEqual({
      count: 1,
      organizationId: '11111111-1111-4111-8111-111111111111',
    });
    expect(mockListRefundAdminReviewQueue).toHaveBeenCalledWith({
      organizerId: '11111111-1111-4111-8111-111111111111',
      limit: 25,
    });
  });
});
