const mockRequireAuthenticatedUser = jest.fn();
const mockGetOrgMembership = jest.fn();
const mockGetOrganizerWalletActivityTimeline = jest.fn();
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

jest.mock('@/lib/payments/wallet/activity-timeline', () => ({
  walletActivityScopes: [
    'payment.captured',
    'refund.executed',
    'dispute.opened',
    'dispute.funds_released',
    'dispute.debt_posted',
    'payout.requested',
    'subscription.renewal_failed',
    'financial.adjustment_posted',
  ],
  getOrganizerWalletActivityTimeline: (...args: unknown[]) =>
    mockGetOrganizerWalletActivityTimeline(...args),
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

import { GET } from '@/app/api/payments/wallet/activity/route';

describe('GET /api/payments/wallet/activity', () => {
  beforeEach(() => {
    mockRequireAuthenticatedUser.mockReset();
    mockGetOrgMembership.mockReset();
    mockGetOrganizerWalletActivityTimeline.mockReset();
    mockFindOrganization.mockReset();
  });

  it('returns 401 when user is not authenticated', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({ user: null, permissions: { canManageEvents: false } });

    const response = await GET(
      new Request('http://localhost/api/payments/wallet/activity?organizationId=11111111-1111-4111-8111-111111111111'),
    );

    expect(response.status).toBe(401);
  });

  it('returns 400 when scope is invalid', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({
      user: { id: 'user-1' },
      permissions: { canManageEvents: false },
    });

    const response = await GET(
      new Request(
        'http://localhost/api/payments/wallet/activity?organizationId=11111111-1111-4111-8111-111111111111&scope=invalid-scope',
      ),
    );

    expect(response.status).toBe(400);
  });

  it('returns 403 when requester is not allowed to access organizer activity', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({
      user: { id: 'user-1' },
      permissions: { canManageEvents: false },
    });
    mockGetOrgMembership.mockResolvedValue(null);

    const response = await GET(
      new Request('http://localhost/api/payments/wallet/activity?organizationId=11111111-1111-4111-8111-111111111111'),
    );

    expect(response.status).toBe(403);
  });

  it('returns 500 when timeline retrieval throws an unexpected error', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({
      user: { id: 'user-1' },
      permissions: { canManageEvents: true },
    });
    mockFindOrganization.mockResolvedValue({ id: '11111111-1111-4111-8111-111111111111' });
    mockGetOrganizerWalletActivityTimeline.mockRejectedValue(new Error('Unexpected failure'));

    const response = await GET(
      new Request('http://localhost/api/payments/wallet/activity?organizationId=11111111-1111-4111-8111-111111111111'),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Server error' });
  });

  it('1.2-API-002 returns trace-linked organizer timeline payload when authorized', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({
      user: { id: 'user-1' },
      permissions: { canManageEvents: false },
    });
    mockGetOrgMembership.mockResolvedValue({
      organizationId: '11111111-1111-4111-8111-111111111111',
      role: 'owner',
    });
    mockFindOrganization.mockResolvedValue({ id: '11111111-1111-4111-8111-111111111111' });
    mockGetOrganizerWalletActivityTimeline.mockResolvedValue({
      organizerId: '11111111-1111-4111-8111-111111111111',
      asOf: new Date('2026-02-24T12:00:00.000Z'),
      totals: {
        availableMinor: 600,
        processingMinor: 300,
        frozenMinor: 0,
        debtMinor: 0,
      },
      debt: {
        waterfallOrder: ['disputes', 'refunds', 'fees'],
        categoryBalancesMinor: {
          disputes: 0,
          refunds: 0,
          fees: 0,
        },
        repaymentAppliedMinor: 0,
      },
      dayGroups: [
        {
          day: '2026-02-24',
          entries: [
            {
              eventId: 'event-1',
              traceId: 'trace-refund-1',
              eventName: 'refund.executed',
              occurredAt: '2026-02-24T09:00:00.000Z',
            },
          ],
        },
      ],
      scope: 'refund.executed',
      entryCount: 3,
      filteredEntryCount: 1,
      queryDurationMs: 15,
    });

    const response = await GET(
      new Request(
        'http://localhost/api/payments/wallet/activity?organizationId=11111111-1111-4111-8111-111111111111&scope=refund.executed',
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Server-Timing')).toBe('wallet-activity-db;dur=15');

    const body = await response.json();
    expect(body.data).toEqual({
      organizerId: '11111111-1111-4111-8111-111111111111',
      asOf: '2026-02-24T12:00:00.000Z',
      totals: {
        availableMinor: 600,
        processingMinor: 300,
        frozenMinor: 0,
        debtMinor: 0,
      },
      debt: {
        waterfallOrder: ['disputes', 'refunds', 'fees'],
        categoryBalancesMinor: {
          disputes: 0,
          refunds: 0,
          fees: 0,
        },
        repaymentAppliedMinor: 0,
      },
      dayGroups: [
        {
          day: '2026-02-24',
          entries: [
            {
              eventId: 'event-1',
              traceId: 'trace-refund-1',
              eventName: 'refund.executed',
              occurredAt: '2026-02-24T09:00:00.000Z',
            },
          ],
        },
      ],
    });
    expect(body.meta).toEqual({
      scope: 'refund.executed',
      dayGroupingTimezone: 'UTC',
      entryCount: 3,
      filteredEntryCount: 1,
      queryDurationMs: 15,
    });
  });
});
