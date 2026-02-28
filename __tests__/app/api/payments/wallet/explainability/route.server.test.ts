const mockRequireAuthenticatedUser = jest.fn();
const mockGetOrgMembership = jest.fn();
const mockGetOrganizerWalletExplainability = jest.fn();
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
}));

jest.mock('@/lib/payments/wallet/explainability', () => ({
  getOrganizerWalletExplainability: (...args: unknown[]) =>
    mockGetOrganizerWalletExplainability(...args),
}));

jest.mock('@/db', () => ({
  db: {
    query: {
      organizations: {
        findFirst: (...args: unknown[]) => mockFindOrganization(...args),
      },
    },
  },
}));

import { GET } from '@/app/api/payments/wallet/explainability/route';

describe('GET /api/payments/wallet/explainability', () => {
  beforeEach(() => {
    mockRequireAuthenticatedUser.mockReset();
    mockGetOrgMembership.mockReset();
    mockGetOrganizerWalletExplainability.mockReset();
    mockFindOrganization.mockReset();
  });

  it('returns 401 when user is unauthenticated', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({ user: null, permissions: { canManageEvents: false } });

    const response = await GET(
      new Request(
        'http://localhost/api/payments/wallet/explainability?organizationId=11111111-1111-4111-8111-111111111111&eventId=22222222-2222-4222-8222-222222222222',
      ),
    );

    expect(response.status).toBe(401);
  });

  it('returns 400 for invalid query parameters', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({
      user: { id: 'user-1' },
      permissions: { canManageEvents: false },
    });

    const response = await GET(
      new Request(
        'http://localhost/api/payments/wallet/explainability?organizationId=bad-org&eventId=bad-event',
      ),
    );

    expect(response.status).toBe(400);
  });

  it('returns 403 when user lacks organizer membership', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({
      user: { id: 'user-1' },
      permissions: { canManageEvents: false },
    });
    mockGetOrgMembership.mockResolvedValue(null);

    const response = await GET(
      new Request(
        'http://localhost/api/payments/wallet/explainability?organizationId=11111111-1111-4111-8111-111111111111&eventId=22222222-2222-4222-8222-222222222222',
      ),
    );

    expect(response.status).toBe(403);
  });

  it('returns 404 when explainability target event is missing', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({
      user: { id: 'user-1' },
      permissions: { canManageEvents: false },
    });
    mockGetOrgMembership.mockResolvedValue({
      organizationId: '11111111-1111-4111-8111-111111111111',
      role: 'owner',
    });
    mockFindOrganization.mockResolvedValue({ id: '11111111-1111-4111-8111-111111111111' });
    mockGetOrganizerWalletExplainability.mockResolvedValue(null);

    const response = await GET(
      new Request(
        'http://localhost/api/payments/wallet/explainability?organizationId=11111111-1111-4111-8111-111111111111&eventId=22222222-2222-4222-8222-222222222222',
      ),
    );

    expect(response.status).toBe(404);
  });

  it('returns explainability payload when authorized and event exists', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({
      user: { id: 'user-1' },
      permissions: { canManageEvents: false },
    });
    mockGetOrgMembership.mockResolvedValue({
      organizationId: '11111111-1111-4111-8111-111111111111',
      role: 'owner',
    });
    mockFindOrganization.mockResolvedValue({ id: '11111111-1111-4111-8111-111111111111' });
    mockGetOrganizerWalletExplainability.mockResolvedValue({
      organizerId: '11111111-1111-4111-8111-111111111111',
      eventId: '22222222-2222-4222-8222-222222222222',
      eventName: 'payment.captured',
      traceId: 'trace-pay-1',
      reasonText:
        'A registration payment was captured, and the net proceeds were added to your available balance.',
      policyDisclosure: 'Net proceeds follow your configured fee model at capture time.',
      impactedEntities: [
        {
          entityType: 'registration',
          entityId: 'registration-1',
          label: 'Primary financial entity',
        },
      ],
      evidenceReferences: [
        {
          kind: 'trace',
          label: 'Trace reference',
          value: 'trace-pay-1',
        },
      ],
    });

    const response = await GET(
      new Request(
        'http://localhost/api/payments/wallet/explainability?organizationId=11111111-1111-4111-8111-111111111111&eventId=22222222-2222-4222-8222-222222222222',
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');

    const body = await response.json();
    expect(body.meta).toEqual({
      organizationId: '11111111-1111-4111-8111-111111111111',
      eventId: '22222222-2222-4222-8222-222222222222',
    });
    expect(body.data.eventName).toBe('payment.captured');
    expect(body.data.traceId).toBe('trace-pay-1');
  });
});
