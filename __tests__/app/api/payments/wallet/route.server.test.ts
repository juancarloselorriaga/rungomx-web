const mockGetAuthContext = jest.fn();
const mockGetOrgMembership = jest.fn();
const mockGetOrganizerWalletBucketSnapshot = jest.fn();
const mockFindOrganization = jest.fn();

jest.mock('@/lib/auth/server', () => ({
  getAuthContext: (...args: unknown[]) => mockGetAuthContext(...args),
}));

jest.mock('@/lib/organizations/permissions', () => ({
  getOrgMembership: (...args: unknown[]) => mockGetOrgMembership(...args),
}));

jest.mock('@/lib/payments/wallet/snapshot', () => ({
  getOrganizerWalletBucketSnapshot: (...args: unknown[]) =>
    mockGetOrganizerWalletBucketSnapshot(...args),
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

import { GET } from '@/app/api/payments/wallet/route';
import { resetWalletPerformanceSamplesForTests } from '@/lib/payments/wallet/performance-budget';

describe('GET /api/payments/wallet', () => {
  beforeEach(() => {
    mockGetAuthContext.mockReset();
    mockGetOrgMembership.mockReset();
    mockGetOrganizerWalletBucketSnapshot.mockReset();
    mockFindOrganization.mockReset();
    resetWalletPerformanceSamplesForTests();
  });

  it('returns 401 when user is not authenticated', async () => {
    mockGetAuthContext.mockResolvedValue({ user: null, permissions: { canManageEvents: false } });

    const response = await GET(
      new Request('http://localhost/api/payments/wallet?organizationId=11111111-1111-4111-8111-111111111111'),
    );

    expect(response.status).toBe(401);
  });

  it('returns 400 when organizationId is invalid', async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: 'user-1' },
      permissions: { canManageEvents: false },
    });

    const response = await GET(
      new Request('http://localhost/api/payments/wallet?organizationId=not-a-uuid'),
    );

    expect(response.status).toBe(400);
  });

  it('returns 403 when requester is not allowed to access organizer wallet', async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: 'user-1' },
      permissions: { canManageEvents: false },
    });
    mockGetOrgMembership.mockResolvedValue(null);

    const response = await GET(
      new Request('http://localhost/api/payments/wallet?organizationId=11111111-1111-4111-8111-111111111111'),
    );

    expect(response.status).toBe(403);
  });

  it('returns 404 when organization does not exist', async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: 'user-1' },
      permissions: { canManageEvents: false },
    });
    mockGetOrgMembership.mockResolvedValue({
      organizationId: '11111111-1111-4111-8111-111111111111',
      role: 'admin',
    });
    mockFindOrganization.mockResolvedValue(null);

    const response = await GET(
      new Request('http://localhost/api/payments/wallet?organizationId=11111111-1111-4111-8111-111111111111'),
    );

    expect(response.status).toBe(404);
  });

  it('returns wallet buckets and consistent snapshot metadata when authorized', async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: 'user-1' },
      permissions: { canManageEvents: false },
    });
    mockGetOrgMembership.mockResolvedValue({
      organizationId: '11111111-1111-4111-8111-111111111111',
      role: 'owner',
    });
    mockFindOrganization.mockResolvedValue({ id: '11111111-1111-4111-8111-111111111111' });
    mockGetOrganizerWalletBucketSnapshot.mockResolvedValue({
      organizerId: '11111111-1111-4111-8111-111111111111',
      asOf: new Date('2026-02-23T22:00:00.000Z'),
      buckets: {
        availableMinor: 9500,
        processingMinor: 1000,
        frozenMinor: 500,
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
      historyEventCount: 128,
      queryDurationMs: 12,
    });

    const response = await GET(
      new Request('http://localhost/api/payments/wallet?organizationId=11111111-1111-4111-8111-111111111111'),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Server-Timing')).toBe('wallet-db;dur=12');

    const body = await response.json();
    expect(body.data).toEqual({
      organizerId: '11111111-1111-4111-8111-111111111111',
      asOf: '2026-02-23T22:00:00.000Z',
      buckets: {
        availableMinor: 9500,
        processingMinor: 1000,
        frozenMinor: 500,
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
    });
    expect(body.meta).toEqual({
      queryDurationMs: 12,
      durationMs: expect.any(Number),
      p95TargetMs: 2000,
      p95ObservedMs: 12,
      sampleCount: 1,
      overBudgetSampleCount: 0,
      sustainedDriftAlert: false,
      historyEventCount: 128,
      historyWindow: 'baseline',
    });
  });

  it('emits sustained drift alert metadata and warning signal after repeated over-budget high-history samples', async () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    mockGetAuthContext.mockResolvedValue({
      user: { id: 'user-1' },
      permissions: { canManageEvents: false },
    });
    mockGetOrgMembership.mockResolvedValue({
      organizationId: '11111111-1111-4111-8111-111111111111',
      role: 'owner',
    });
    mockFindOrganization.mockResolvedValue({ id: '11111111-1111-4111-8111-111111111111' });
    mockGetOrganizerWalletBucketSnapshot.mockResolvedValue({
      organizerId: '11111111-1111-4111-8111-111111111111',
      asOf: new Date('2026-02-23T22:00:00.000Z'),
      buckets: {
        availableMinor: 1200,
        processingMinor: 0,
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
      historyEventCount: 900,
      queryDurationMs: 2500,
    });

    await GET(
      new Request('http://localhost/api/payments/wallet?organizationId=11111111-1111-4111-8111-111111111111'),
    );
    await GET(
      new Request('http://localhost/api/payments/wallet?organizationId=11111111-1111-4111-8111-111111111111'),
    );
    const third = await GET(
      new Request('http://localhost/api/payments/wallet?organizationId=11111111-1111-4111-8111-111111111111'),
    );

    expect(third.status).toBe(200);
    const body = await third.json();
    expect(body.meta).toEqual({
      queryDurationMs: 2500,
      durationMs: expect.any(Number),
      p95TargetMs: 2000,
      p95ObservedMs: 2500,
      sampleCount: 3,
      overBudgetSampleCount: 3,
      sustainedDriftAlert: true,
      historyEventCount: 900,
      historyWindow: 'growth',
    });
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[payments-wallet] Sustained p95 budget drift detected',
      expect.objectContaining({
        p95TargetMs: 2000,
        p95ObservedMs: 2500,
        overBudgetSampleCount: 3,
        sampleCount: 3,
      }),
    );

    consoleWarnSpy.mockRestore();
  });
});
