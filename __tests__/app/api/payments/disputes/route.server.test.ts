const mockRequireAuthenticatedUser = jest.fn();
const mockGetOrgMembership = jest.fn();
const mockRequireOrgPermission = jest.fn();
const mockOpenDisputeCase = jest.fn();
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

jest.mock('@/lib/payments/disputes/lifecycle', () => {
  class MockDisputeLifecycleError extends Error {
    public readonly code: string;

    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  }

  return {
    DisputeLifecycleError: MockDisputeLifecycleError,
    openDisputeCase: (...args: unknown[]) => mockOpenDisputeCase(...args),
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

import { POST } from '@/app/api/payments/disputes/route';
import { DisputeLifecycleError } from '@/lib/payments/disputes/lifecycle';

describe('POST /api/payments/disputes', () => {
  beforeEach(() => {
    mockRequireAuthenticatedUser.mockReset();
    mockGetOrgMembership.mockReset();
    mockRequireOrgPermission.mockReset();
    mockOpenDisputeCase.mockReset();
    mockFindOrganization.mockReset();

    mockRequireOrgPermission.mockImplementation(() => undefined);
    mockFindOrganization.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
    });
  });

  it('returns 401 when requester is unauthenticated', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({ user: null, permissions: { canManageEvents: false } });

    const response = await POST(
      new Request('http://localhost/api/payments/disputes', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: '11111111-1111-4111-8111-111111111111',
          registrationId: '33333333-3333-4333-8333-333333333333',
          reasonCode: 'fraud_reported',
          amountAtRiskMinor: 1500,
        }),
      }),
    );

    expect(response.status).toBe(401);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('returns 400 for invalid intake payload', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({
      user: { id: 'risk-user-1' },
      permissions: { canManageEvents: true },
    });

    const response = await POST(
      new Request('http://localhost/api/payments/disputes', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: '11111111-1111-4111-8111-111111111111',
          reasonCode: 'fraud_reported',
          amountAtRiskMinor: 1500,
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(mockOpenDisputeCase).not.toHaveBeenCalled();
  });

  it('returns 403 when requester lacks organizer permissions', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({
      user: { id: 'risk-user-1' },
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
      new Request('http://localhost/api/payments/disputes', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: '11111111-1111-4111-8111-111111111111',
          registrationId: '33333333-3333-4333-8333-333333333333',
          reasonCode: 'fraud_reported',
          amountAtRiskMinor: 1500,
        }),
      }),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Permission denied' });
  });

  it('returns 404 when organization does not exist', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({
      user: { id: 'risk-user-1' },
      permissions: { canManageEvents: true },
    });
    mockFindOrganization.mockResolvedValue(null);

    const response = await POST(
      new Request('http://localhost/api/payments/disputes', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: '11111111-1111-4111-8111-111111111111',
          registrationId: '33333333-3333-4333-8333-333333333333',
          reasonCode: 'fraud_reported',
          amountAtRiskMinor: 1500,
        }),
      }),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Organization not found' });
  });

  it('maps registration-not-found intake errors to 404', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({
      user: { id: 'risk-user-1' },
      permissions: { canManageEvents: true },
    });
    mockOpenDisputeCase.mockRejectedValue(
      new DisputeLifecycleError(
        'DISPUTE_INTAKE_REGISTRATION_NOT_FOUND',
        'Registration scope was not found for dispute intake.',
      ),
    );

    const response = await POST(
      new Request('http://localhost/api/payments/disputes', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: '11111111-1111-4111-8111-111111111111',
          registrationId: '33333333-3333-4333-8333-333333333333',
          reasonCode: 'fraud_reported',
          amountAtRiskMinor: 1500,
        }),
      }),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: 'Registration not found',
      code: 'DISPUTE_INTAKE_REGISTRATION_NOT_FOUND',
      reason: 'Registration scope was not found for dispute intake.',
    });
  });

  it('maps invalid evidence deadline errors to 400', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({
      user: { id: 'risk-user-1' },
      permissions: { canManageEvents: true },
    });
    mockOpenDisputeCase.mockRejectedValue(
      new DisputeLifecycleError(
        'DISPUTE_INTAKE_EVIDENCE_DEADLINE_INVALID',
        'Dispute evidence deadline must be after dispute opened time.',
      ),
    );

    const response = await POST(
      new Request('http://localhost/api/payments/disputes', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: '11111111-1111-4111-8111-111111111111',
          registrationId: '33333333-3333-4333-8333-333333333333',
          reasonCode: 'fraud_reported',
          amountAtRiskMinor: 1500,
          evidenceDeadlineAt: '2026-02-23T23:30:00.000Z',
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'Invalid dispute intake request',
      code: 'DISPUTE_INTAKE_EVIDENCE_DEADLINE_INVALID',
      reason: 'Dispute evidence deadline must be after dispute opened time.',
    });
  });

  it('returns 200 with deterministic intake payload on success', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({
      user: { id: 'risk-user-1' },
      permissions: { canManageEvents: false },
    });
    mockGetOrgMembership.mockResolvedValue({
      organizationId: '11111111-1111-4111-8111-111111111111',
      role: 'owner',
    });
    mockOpenDisputeCase.mockResolvedValue({
      disputeCaseId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      organizerId: '11111111-1111-4111-8111-111111111111',
      registrationId: '33333333-3333-4333-8333-333333333333',
      orderId: null,
      attendeeUserId: '44444444-4444-4444-8444-444444444444',
      status: 'opened',
      reasonCode: 'fraud_reported',
      reasonNote: 'Chargeback opened by provider',
      amountAtRiskMinor: 1500,
      currency: 'MXN',
      evidenceDeadlineAt: new Date('2026-02-26T23:30:00.000Z'),
      openedAt: new Date('2026-02-23T23:30:00.000Z'),
      lastTransitionAt: new Date('2026-02-23T23:30:00.000Z'),
      traceId: 'dispute-intake:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      ingressDeduplicated: false,
      metadata: {
        createdBy: {
          userId: 'risk-user-1',
          source: 'api',
        },
      },
    });

    const response = await POST(
      new Request('http://localhost/api/payments/disputes', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: '11111111-1111-4111-8111-111111111111',
          registrationId: '33333333-3333-4333-8333-333333333333',
          reasonCode: 'fraud_reported',
          reasonNote: 'Chargeback opened by provider',
          amountAtRiskMinor: 1500,
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');

    const body = await response.json();
    expect(body.data).toMatchObject({
      disputeCaseId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      organizerId: '11111111-1111-4111-8111-111111111111',
      registrationId: '33333333-3333-4333-8333-333333333333',
      status: 'opened',
      amountAtRiskMinor: 1500,
      traceId: 'dispute-intake:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      ingressDeduplicated: false,
    });
  });
});
