const mockRequireAuthenticatedUser = jest.fn();
const mockGetOrgMembership = jest.fn();
const mockRequireOrgPermission = jest.fn();
const mockTransitionDisputeCase = jest.fn();
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
    disputeLifecycleStatuses: [
      'opened',
      'evidence_required',
      'under_review',
      'won',
      'lost',
      'cancelled',
    ],
    DisputeLifecycleError: MockDisputeLifecycleError,
    transitionDisputeCase: (...args: unknown[]) => mockTransitionDisputeCase(...args),
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

import { POST } from '@/app/api/payments/disputes/[disputeCaseId]/transitions/route';
import { DisputeLifecycleError } from '@/lib/payments/disputes/lifecycle';

function createRouteContext(disputeCaseId: string) {
  return {
    params: Promise.resolve({ disputeCaseId }),
  };
}

describe('POST /api/payments/disputes/[disputeCaseId]/transitions', () => {
  beforeEach(() => {
    mockRequireAuthenticatedUser.mockReset();
    mockGetOrgMembership.mockReset();
    mockRequireOrgPermission.mockReset();
    mockTransitionDisputeCase.mockReset();
    mockFindOrganization.mockReset();

    mockRequireOrgPermission.mockImplementation(() => undefined);
    mockFindOrganization.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
    });
  });

  it('returns 401 when requester is unauthenticated', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({ user: null, permissions: { canManageEvents: false } });

    const response = await POST(
      new Request('http://localhost/api/payments/disputes/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/transitions', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: '11111111-1111-4111-8111-111111111111',
          toStatus: 'under_review',
        }),
      }),
      createRouteContext('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
    );

    expect(response.status).toBe(401);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('returns 400 for invalid route params', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({
      user: { id: 'risk-user-1' },
      permissions: { canManageEvents: true },
    });

    const response = await POST(
      new Request('http://localhost/api/payments/disputes/not-a-uuid/transitions', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: '11111111-1111-4111-8111-111111111111',
          toStatus: 'under_review',
        }),
      }),
      createRouteContext('not-a-uuid'),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('Invalid dispute case ID');
  });

  it('returns 400 for invalid JSON body', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({
      user: { id: 'risk-user-1' },
      permissions: { canManageEvents: true },
    });

    const response = await POST(
      new Request('http://localhost/api/payments/disputes/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/transitions', {
        method: 'POST',
        body: '{invalid-json',
      }),
      createRouteContext('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Invalid JSON body' });
    expect(mockFindOrganization).not.toHaveBeenCalled();
    expect(mockTransitionDisputeCase).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid transition payload', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({
      user: { id: 'risk-user-1' },
      permissions: { canManageEvents: true },
    });

    const response = await POST(
      new Request('http://localhost/api/payments/disputes/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/transitions', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: 'not-a-uuid',
          toStatus: 'under_review',
        }),
      }),
      createRouteContext('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('Invalid dispute transition payload');
    expect(body.details).toBeDefined();
    expect(mockFindOrganization).not.toHaveBeenCalled();
    expect(mockTransitionDisputeCase).not.toHaveBeenCalled();
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
      new Request('http://localhost/api/payments/disputes/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/transitions', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: '11111111-1111-4111-8111-111111111111',
          toStatus: 'under_review',
        }),
      }),
      createRouteContext('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
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
      new Request('http://localhost/api/payments/disputes/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/transitions', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: '11111111-1111-4111-8111-111111111111',
          toStatus: 'under_review',
        }),
      }),
      createRouteContext('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Organization not found' });
  });

  it('maps invalid transition errors to 409', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({
      user: { id: 'risk-user-1' },
      permissions: { canManageEvents: true },
    });
    mockTransitionDisputeCase.mockRejectedValue(
      new DisputeLifecycleError(
        'DISPUTE_TRANSITION_NOT_ALLOWED',
        'Dispute transition is not allowed for the current lifecycle state. from=opened to=won',
      ),
    );

    const response = await POST(
      new Request('http://localhost/api/payments/disputes/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/transitions', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: '11111111-1111-4111-8111-111111111111',
          toStatus: 'won',
        }),
      }),
      createRouteContext('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: 'Dispute transition rejected',
      code: 'DISPUTE_TRANSITION_NOT_ALLOWED',
      reason:
        'Dispute transition is not allowed for the current lifecycle state. from=opened to=won',
    });
  });

  it('maps missing dispute cases to 404', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({
      user: { id: 'risk-user-1' },
      permissions: { canManageEvents: true },
    });
    mockTransitionDisputeCase.mockRejectedValue(
      new DisputeLifecycleError('DISPUTE_CASE_NOT_FOUND', 'Dispute case not found.'),
    );

    const response = await POST(
      new Request('http://localhost/api/payments/disputes/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/transitions', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: '11111111-1111-4111-8111-111111111111',
          toStatus: 'under_review',
        }),
      }),
      createRouteContext('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: 'Dispute case not found',
      code: 'DISPUTE_CASE_NOT_FOUND',
    });
  });

  it('maps unexpected lifecycle errors to 400', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({
      user: { id: 'risk-user-1' },
      permissions: { canManageEvents: true },
    });
    mockTransitionDisputeCase.mockRejectedValue(
      new DisputeLifecycleError('DISPUTE_INTAKE_SCOPE_REQUIRED', 'Dispute intake scope is required.'),
    );

    const response = await POST(
      new Request('http://localhost/api/payments/disputes/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/transitions', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: '11111111-1111-4111-8111-111111111111',
          toStatus: 'under_review',
        }),
      }),
      createRouteContext('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'Invalid dispute transition request',
      code: 'DISPUTE_INTAKE_SCOPE_REQUIRED',
      reason: 'Dispute intake scope is required.',
    });
  });

  it('returns 500 when transition throws a non-lifecycle error', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({
      user: { id: 'risk-user-1' },
      permissions: { canManageEvents: true },
    });
    mockTransitionDisputeCase.mockRejectedValue(new Error('Unexpected failure'));
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await POST(
      new Request('http://localhost/api/payments/disputes/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/transitions', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: '11111111-1111-4111-8111-111111111111',
          toStatus: 'under_review',
        }),
      }),
      createRouteContext('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Server error' });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[payments-disputes] Failed to transition dispute case',
      expect.objectContaining({
        disputeCaseId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        organizationId: '11111111-1111-4111-8111-111111111111',
        actorUserId: 'risk-user-1',
      }),
    );

    consoleErrorSpy.mockRestore();
  });

  it('returns 200 with deterministic transition payload on success', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({
      user: { id: 'risk-user-1' },
      permissions: { canManageEvents: false },
    });
    mockGetOrgMembership.mockResolvedValue({
      organizationId: '11111111-1111-4111-8111-111111111111',
      role: 'admin',
    });
    mockTransitionDisputeCase.mockResolvedValue({
      disputeCaseId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      organizerId: '11111111-1111-4111-8111-111111111111',
      fromStatus: 'opened',
      toStatus: 'evidence_required',
      reasonCode: 'awaiting_evidence',
      reasonNote: 'Need organizer proof',
      transitionedAt: new Date('2026-02-23T23:45:00.000Z'),
      closedAt: null,
      latestTransitionByUserId: 'risk-user-1',
      metadata: {
        lastTransition: {
          fromStatus: 'opened',
          toStatus: 'evidence_required',
        },
      },
    });

    const response = await POST(
      new Request('http://localhost/api/payments/disputes/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/transitions', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: '11111111-1111-4111-8111-111111111111',
          toStatus: 'evidence_required',
          reasonCode: 'awaiting_evidence',
          reasonNote: 'Need organizer proof',
        }),
      }),
      createRouteContext('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');

    const body = await response.json();
    expect(body.data).toMatchObject({
      disputeCaseId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      organizerId: '11111111-1111-4111-8111-111111111111',
      fromStatus: 'opened',
      toStatus: 'evidence_required',
      reasonCode: 'awaiting_evidence',
      latestTransitionByUserId: 'risk-user-1',
    });
  });
});
