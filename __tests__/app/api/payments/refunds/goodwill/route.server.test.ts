const mockGetAuthContext = jest.fn();
const mockGetOrgMembership = jest.fn();
const mockRequireOrgPermission = jest.fn();
const mockInitiateGoodwillRefundRequest = jest.fn();
const mockFindOrganization = jest.fn();

jest.mock('@/lib/auth/server', () => ({
  getAuthContext: (...args: unknown[]) => mockGetAuthContext(...args),
}));

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
    mockGetAuthContext.mockReset();
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
    mockGetAuthContext.mockResolvedValue({ user: null, permissions: { canManageEvents: false } });

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

  it('maps goodwill target-not-found to 404', async () => {
    mockGetAuthContext.mockResolvedValue({
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
  });

  it('maps goodwill conflict errors to 409', async () => {
    mockGetAuthContext.mockResolvedValue({
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

  it('returns 201 with goodwill queue payload when request succeeds', async () => {
    mockGetAuthContext.mockResolvedValue({
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
