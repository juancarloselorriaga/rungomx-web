const mockRequireAuthenticatedUser = jest.fn();
const mockGetOrgMembership = jest.fn();
const mockRequireOrgPermission = jest.fn();
const mockSubmitDisputeEvidence = jest.fn();
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
    submitDisputeEvidence: (...args: unknown[]) => mockSubmitDisputeEvidence(...args),
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

import { POST } from '@/app/api/payments/disputes/[disputeCaseId]/evidence/route';
import { DisputeLifecycleError } from '@/lib/payments/disputes/lifecycle';

function createRouteContext(disputeCaseId: string) {
  return {
    params: Promise.resolve({ disputeCaseId }),
  };
}

describe('POST /api/payments/disputes/[disputeCaseId]/evidence', () => {
  beforeEach(() => {
    mockRequireAuthenticatedUser.mockReset();
    mockGetOrgMembership.mockReset();
    mockRequireOrgPermission.mockReset();
    mockSubmitDisputeEvidence.mockReset();
    mockFindOrganization.mockReset();

    mockRequireOrgPermission.mockImplementation(() => undefined);
    mockFindOrganization.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
    });
  });

  it('returns 401 when requester is unauthenticated', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({ user: null, permissions: { canManageEvents: false } });

    const response = await POST(
      new Request('http://localhost/api/payments/disputes/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/evidence', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: '11111111-1111-4111-8111-111111111111',
          evidenceNote: 'Proof package',
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
      new Request('http://localhost/api/payments/disputes/not-a-uuid/evidence', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: '11111111-1111-4111-8111-111111111111',
          evidenceNote: 'Proof package',
        }),
      }),
      createRouteContext('not-a-uuid'),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('Invalid dispute case ID');
  });

  it('returns 400 for invalid evidence payload', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({
      user: { id: 'risk-user-1' },
      permissions: { canManageEvents: true },
    });

    const response = await POST(
      new Request('http://localhost/api/payments/disputes/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/evidence', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: 'not-a-uuid',
          evidenceReferences: [
            {
              referenceId: '',
              referenceType: 'document',
            },
          ],
        }),
      }),
      createRouteContext('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('Invalid dispute evidence payload');
  });

  it('returns 400 when both evidence note and references are missing', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({
      user: { id: 'risk-user-1' },
      permissions: { canManageEvents: true },
    });

    const response = await POST(
      new Request('http://localhost/api/payments/disputes/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/evidence', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: '11111111-1111-4111-8111-111111111111',
        }),
      }),
      createRouteContext('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('Invalid dispute evidence payload');
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
      new Request('http://localhost/api/payments/disputes/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/evidence', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: '11111111-1111-4111-8111-111111111111',
          evidenceNote: 'Proof package',
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
      new Request('http://localhost/api/payments/disputes/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/evidence', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: '11111111-1111-4111-8111-111111111111',
          evidenceNote: 'Proof package',
        }),
      }),
      createRouteContext('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Organization not found' });
  });

  it('maps dispute-not-found errors to 404', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({
      user: { id: 'risk-user-1' },
      permissions: { canManageEvents: true },
    });
    mockSubmitDisputeEvidence.mockRejectedValue(
      new DisputeLifecycleError('DISPUTE_CASE_NOT_FOUND', 'Dispute case not found.'),
    );

    const response = await POST(
      new Request('http://localhost/api/payments/disputes/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/evidence', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: '11111111-1111-4111-8111-111111111111',
          evidenceNote: 'Proof package',
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

  it('returns 409 with escalation routing when evidence deadline has expired', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({
      user: { id: 'risk-user-1' },
      permissions: { canManageEvents: true },
    });
    mockSubmitDisputeEvidence.mockResolvedValue({
      disputeCaseId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      organizerId: '11111111-1111-4111-8111-111111111111',
      status: 'evidence_required',
      evidenceDeadlineAt: new Date('2026-02-23T23:29:59.000Z'),
      asOf: new Date('2026-02-23T23:30:00.000Z'),
      remainingSeconds: 0,
      deadlineState: 'expired',
      accepted: false,
      nextAction: 'escalate_dispute_review',
      metadata: {},
    });

    const response = await POST(
      new Request('http://localhost/api/payments/disputes/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/evidence', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: '11111111-1111-4111-8111-111111111111',
          evidenceNote: 'Late evidence package',
        }),
      }),
      createRouteContext('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
    );

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body).toMatchObject({
      error: 'Dispute evidence submission deadline expired',
      code: 'DISPUTE_EVIDENCE_DEADLINE_EXPIRED',
      nextAction: 'escalate_dispute_review',
    });
  });

  it('maps evidence-status errors to 409', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({
      user: { id: 'risk-user-1' },
      permissions: { canManageEvents: true },
    });
    mockSubmitDisputeEvidence.mockRejectedValue(
      new DisputeLifecycleError(
        'DISPUTE_EVIDENCE_STATUS_INVALID',
        'Dispute evidence submission is not allowed for the current lifecycle state. status=won',
      ),
    );

    const response = await POST(
      new Request('http://localhost/api/payments/disputes/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/evidence', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: '11111111-1111-4111-8111-111111111111',
          evidenceNote: 'Proof package',
        }),
      }),
      createRouteContext('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: 'Dispute evidence submission rejected',
      code: 'DISPUTE_EVIDENCE_STATUS_INVALID',
      reason:
        'Dispute evidence submission is not allowed for the current lifecycle state. status=won',
    });
  });

  it('returns 500 when dispute evidence submission throws an unexpected error', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({
      user: { id: 'risk-user-1' },
      permissions: { canManageEvents: true },
    });
    mockSubmitDisputeEvidence.mockRejectedValue(new Error('Unexpected failure'));

    const response = await POST(
      new Request('http://localhost/api/payments/disputes/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/evidence', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: '11111111-1111-4111-8111-111111111111',
          evidenceNote: 'Evidence package',
        }),
      }),
      createRouteContext('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Server error' });
  });

  it('returns 200 with deterministic accepted payload on success', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({
      user: { id: 'risk-user-1' },
      permissions: { canManageEvents: false },
    });
    mockGetOrgMembership.mockResolvedValue({
      organizationId: '11111111-1111-4111-8111-111111111111',
      role: 'admin',
    });
    mockSubmitDisputeEvidence.mockResolvedValue({
      disputeCaseId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      organizerId: '11111111-1111-4111-8111-111111111111',
      status: 'under_review',
      evidenceDeadlineAt: new Date('2026-02-24T00:30:05.000Z'),
      asOf: new Date('2026-02-23T23:30:00.000Z'),
      remainingSeconds: 3605,
      deadlineState: 'open',
      accepted: true,
      nextAction: 'continue_review',
      metadata: {
        lastEvidenceSubmission: {
          outcome: 'accepted',
        },
      },
    });

    const response = await POST(
      new Request('http://localhost/api/payments/disputes/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/evidence', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: '11111111-1111-4111-8111-111111111111',
          evidenceNote: 'Evidence package',
          evidenceReferences: [
            {
              referenceId: 'doc-1',
              referenceType: 'document',
              referenceUrl: 'https://example.test/evidence/doc-1',
            },
          ],
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
      status: 'under_review',
      remainingSeconds: 3605,
      deadlineState: 'open',
      accepted: true,
      nextAction: 'continue_review',
    });
  });
});
