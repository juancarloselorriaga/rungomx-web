const mockGetAuthContext = jest.fn();
const mockGetOrgMembership = jest.fn();
const mockRequireOrgPermission = jest.fn();
const mockGetDisputeEvidenceWindow = jest.fn();
const mockFindOrganization = jest.fn();

jest.mock('@/lib/auth/server', () => ({
  getAuthContext: (...args: unknown[]) => mockGetAuthContext(...args),
}));

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
    getDisputeEvidenceWindow: (...args: unknown[]) => mockGetDisputeEvidenceWindow(...args),
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

import { GET } from '@/app/api/payments/disputes/[disputeCaseId]/route';
import { DisputeLifecycleError } from '@/lib/payments/disputes/lifecycle';

function createRouteContext(disputeCaseId: string) {
  return {
    params: Promise.resolve({ disputeCaseId }),
  };
}

describe('GET /api/payments/disputes/[disputeCaseId]', () => {
  beforeEach(() => {
    mockGetAuthContext.mockReset();
    mockGetOrgMembership.mockReset();
    mockRequireOrgPermission.mockReset();
    mockGetDisputeEvidenceWindow.mockReset();
    mockFindOrganization.mockReset();

    mockRequireOrgPermission.mockImplementation(() => undefined);
    mockFindOrganization.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
    });
  });

  it('returns 401 when requester is unauthenticated', async () => {
    mockGetAuthContext.mockResolvedValue({ user: null, permissions: { canManageEvents: false } });

    const response = await GET(
      new Request(
        'http://localhost/api/payments/disputes/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa?organizationId=11111111-1111-4111-8111-111111111111',
      ),
      createRouteContext('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
    );

    expect(response.status).toBe(401);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('returns 400 for invalid route params', async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: 'risk-user-1' },
      permissions: { canManageEvents: true },
    });

    const response = await GET(
      new Request(
        'http://localhost/api/payments/disputes/not-a-uuid?organizationId=11111111-1111-4111-8111-111111111111',
      ),
      createRouteContext('not-a-uuid'),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('Invalid dispute case ID');
  });

  it('returns 400 when organization query parameter is invalid', async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: 'risk-user-1' },
      permissions: { canManageEvents: true },
    });

    const response = await GET(
      new Request('http://localhost/api/payments/disputes/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
      createRouteContext('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('Invalid dispute detail query');
  });

  it('returns 403 when requester lacks organizer permissions', async () => {
    mockGetAuthContext.mockResolvedValue({
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

    const response = await GET(
      new Request(
        'http://localhost/api/payments/disputes/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa?organizationId=11111111-1111-4111-8111-111111111111',
      ),
      createRouteContext('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Permission denied' });
  });

  it('returns 404 when organization does not exist', async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: 'risk-user-1' },
      permissions: { canManageEvents: true },
    });
    mockFindOrganization.mockResolvedValue(null);

    const response = await GET(
      new Request(
        'http://localhost/api/payments/disputes/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa?organizationId=11111111-1111-4111-8111-111111111111',
      ),
      createRouteContext('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Organization not found' });
  });

  it('maps not-found dispute errors to 404', async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: 'risk-user-1' },
      permissions: { canManageEvents: true },
    });
    mockGetDisputeEvidenceWindow.mockRejectedValue(
      new DisputeLifecycleError('DISPUTE_CASE_NOT_FOUND', 'Dispute case not found.'),
    );

    const response = await GET(
      new Request(
        'http://localhost/api/payments/disputes/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa?organizationId=11111111-1111-4111-8111-111111111111',
      ),
      createRouteContext('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: 'Dispute case not found',
      code: 'DISPUTE_CASE_NOT_FOUND',
    });
  });

  it('returns 200 with deterministic countdown payload on success', async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: 'risk-user-1' },
      permissions: { canManageEvents: false },
    });
    mockGetOrgMembership.mockResolvedValue({
      organizationId: '11111111-1111-4111-8111-111111111111',
      role: 'admin',
    });
    mockGetDisputeEvidenceWindow.mockResolvedValue({
      disputeCaseId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      organizerId: '11111111-1111-4111-8111-111111111111',
      status: 'evidence_required',
      evidenceDeadlineAt: new Date('2026-02-24T00:30:05.000Z'),
      asOf: new Date('2026-02-23T23:30:00.000Z'),
      remainingSeconds: 3605,
      deadlineState: 'open',
    });

    const response = await GET(
      new Request(
        'http://localhost/api/payments/disputes/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa?organizationId=11111111-1111-4111-8111-111111111111',
      ),
      createRouteContext('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');

    const body = await response.json();
    expect(body.data).toMatchObject({
      disputeCaseId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      organizerId: '11111111-1111-4111-8111-111111111111',
      status: 'evidence_required',
      remainingSeconds: 3605,
      deadlineState: 'open',
    });
  });
});
