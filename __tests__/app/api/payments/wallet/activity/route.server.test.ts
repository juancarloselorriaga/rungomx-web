const mockGetAuthContext = jest.fn();
const mockGetOrgMembership = jest.fn();
const mockGetOrganizerWalletActivityTimeline = jest.fn();
const mockFindOrganization = jest.fn();

jest.mock('@/lib/auth/server', () => ({
  getAuthContext: (...args: unknown[]) => mockGetAuthContext(...args),
}));

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
    mockGetAuthContext.mockReset();
    mockGetOrgMembership.mockReset();
    mockGetOrganizerWalletActivityTimeline.mockReset();
    mockFindOrganization.mockReset();
  });

  it('returns 401 when user is not authenticated', async () => {
    mockGetAuthContext.mockResolvedValue({ user: null, permissions: { canManageEvents: false } });

    const response = await GET(
      new Request('http://localhost/api/payments/wallet/activity?organizationId=11111111-1111-4111-8111-111111111111'),
    );

    expect(response.status).toBe(401);
  });

  it('returns 400 when scope is invalid', async () => {
    mockGetAuthContext.mockResolvedValue({
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
    mockGetAuthContext.mockResolvedValue({
      user: { id: 'user-1' },
      permissions: { canManageEvents: false },
    });
    mockGetOrgMembership.mockResolvedValue(null);

    const response = await GET(
      new Request('http://localhost/api/payments/wallet/activity?organizationId=11111111-1111-4111-8111-111111111111'),
    );

    expect(response.status).toBe(403);
  });

  it('returns organizer timeline payload when authorized', async () => {
    mockGetAuthContext.mockResolvedValue({
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
          entries: [],
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
          entries: [],
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
