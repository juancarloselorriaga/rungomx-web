const mockGetAuthContext = jest.fn();
const mockGetOrgMembership = jest.fn();
const mockRequireOrgPermission = jest.fn();
const mockGeneratePayoutStatementArtifact = jest.fn();
const mockFindOrganization = jest.fn();

jest.mock('@/lib/auth/server', () => ({
  getAuthContext: (...args: unknown[]) => mockGetAuthContext(...args),
}));

jest.mock('@/lib/organizations/permissions', () => ({
  getOrgMembership: (...args: unknown[]) => mockGetOrgMembership(...args),
  requireOrgPermission: (...args: unknown[]) => mockRequireOrgPermission(...args),
}));

jest.mock('@/lib/payments/payouts/statements', () => {
  class MockPayoutStatementError extends Error {
    public readonly code: string;

    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  }

  return {
    PayoutStatementError: MockPayoutStatementError,
    generatePayoutStatementArtifact: (...args: unknown[]) =>
      mockGeneratePayoutStatementArtifact(...args),
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

import { GET } from '@/app/api/payments/payouts/[payoutRequestId]/statement/route';
import { PayoutStatementError } from '@/lib/payments/payouts/statements';

function createRouteContext(payoutRequestId: string) {
  return {
    params: Promise.resolve({ payoutRequestId }),
  };
}

describe('GET /api/payments/payouts/[payoutRequestId]/statement', () => {
  beforeEach(() => {
    mockGetAuthContext.mockReset();
    mockGetOrgMembership.mockReset();
    mockRequireOrgPermission.mockReset();
    mockGeneratePayoutStatementArtifact.mockReset();
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
        'http://localhost/api/payments/payouts/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/statement?organizationId=11111111-1111-4111-8111-111111111111',
      ),
      createRouteContext('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
    );

    expect(response.status).toBe(401);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('returns 400 when route params are invalid', async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: 'organizer-user-1' },
      permissions: { canManageEvents: true },
    });

    const response = await GET(
      new Request(
        'http://localhost/api/payments/payouts/not-a-uuid/statement?organizationId=11111111-1111-4111-8111-111111111111',
      ),
      createRouteContext('not-a-uuid'),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('Invalid payout request ID');
  });

  it('returns 400 when organizationId query is invalid', async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: 'organizer-user-1' },
      permissions: { canManageEvents: true },
    });

    const response = await GET(
      new Request(
        'http://localhost/api/payments/payouts/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/statement?organizationId=not-a-uuid',
      ),
      createRouteContext('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('Invalid organizationId');
  });

  it('returns 403 when requester lacks organizer permissions', async () => {
    mockGetAuthContext.mockResolvedValue({
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
        'http://localhost/api/payments/payouts/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/statement?organizationId=11111111-1111-4111-8111-111111111111',
      ),
      createRouteContext('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Permission denied' });
  });

  it('returns 404 when organization does not exist', async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: 'organizer-user-1' },
      permissions: { canManageEvents: true },
    });
    mockFindOrganization.mockResolvedValue(null);

    const response = await GET(
      new Request(
        'http://localhost/api/payments/payouts/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/statement?organizationId=11111111-1111-4111-8111-111111111111',
      ),
      createRouteContext('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Organization not found' });
  });

  it('maps statement-not-found errors to 404', async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: 'organizer-user-1' },
      permissions: { canManageEvents: true },
    });
    mockGeneratePayoutStatementArtifact.mockRejectedValue(
      new PayoutStatementError(
        'PAYOUT_STATEMENT_NOT_FOUND',
        'Payout request was not found for statement generation.',
      ),
    );

    const response = await GET(
      new Request(
        'http://localhost/api/payments/payouts/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/statement?organizationId=11111111-1111-4111-8111-111111111111',
      ),
      createRouteContext('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: 'Payout request not found',
      code: 'PAYOUT_STATEMENT_NOT_FOUND',
    });
  });

  it('maps non-terminal payout status errors to 409', async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: 'organizer-user-1' },
      permissions: { canManageEvents: true },
    });
    mockGeneratePayoutStatementArtifact.mockRejectedValue(
      new PayoutStatementError(
        'PAYOUT_STATEMENT_STATUS_NOT_TERMINAL',
        'Payout statement generation requires terminal status, received=processing.',
      ),
    );

    const response = await GET(
      new Request(
        'http://localhost/api/payments/payouts/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/statement?organizationId=11111111-1111-4111-8111-111111111111',
      ),
      createRouteContext('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: 'Payout statement is not available for non-terminal payout status',
      code: 'PAYOUT_STATEMENT_STATUS_NOT_TERMINAL',
      reason: 'Payout statement generation requires terminal status, received=processing.',
    });
  });

  it('maps baseline-incomplete errors to 500', async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: 'organizer-user-1' },
      permissions: { canManageEvents: true },
    });
    mockGeneratePayoutStatementArtifact.mockRejectedValue(
      new PayoutStatementError(
        'PAYOUT_STATEMENT_BASELINE_INCOMPLETE',
        'Payout statement generation requires quote and contract baseline artifacts for the payout request.',
      ),
    );

    const response = await GET(
      new Request(
        'http://localhost/api/payments/payouts/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/statement?organizationId=11111111-1111-4111-8111-111111111111',
      ),
      createRouteContext('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: 'Payout statement baseline could not be resolved',
      code: 'PAYOUT_STATEMENT_BASELINE_INCOMPLETE',
      reason:
        'Payout statement generation requires quote and contract baseline artifacts for the payout request.',
    });
  });

  it('returns 200 with payout statement artifact payload on success', async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: 'organizer-user-1' },
      permissions: { canManageEvents: false },
    });
    mockGetOrgMembership.mockResolvedValue({
      organizationId: '11111111-1111-4111-8111-111111111111',
      role: 'admin',
    });
    mockGeneratePayoutStatementArtifact.mockResolvedValue({
      payoutStatementId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      organizerId: '11111111-1111-4111-8111-111111111111',
      payoutRequestId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      payoutQuoteId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      payoutContractId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      payoutStatus: 'completed',
      traceId: 'payout-request:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      statementFingerprint: 'f'.repeat(64),
      quoteReference: {
        payoutQuoteId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        quoteFingerprint: 'e'.repeat(64),
        requestedAt: new Date('2026-02-25T20:00:00.000Z'),
        includedAmountMinor: 12000,
        deductionAmountMinor: 2000,
        maxWithdrawableAmountMinor: 10000,
        requestedAmountMinor: 10000,
      },
      componentBreakdown: {
        version: 'payout-quote-components-v1',
      },
      adjustmentLines: [
        {
          eventId: 'event-adjust-1',
          traceId: 'payout-lifecycle:trace-1',
          occurredAt: new Date('2026-02-25T21:00:00.000Z'),
          reasonCode: 'high_risk_dispute_signal',
          previousRequestedAmountMinor: 10000,
          adjustedRequestedAmountMinor: 8000,
          deltaMinor: 2000,
        },
      ],
      originalRequestedAmountMinor: 10000,
      currentRequestedAmountMinor: 8000,
      terminalAmountMinor: 8000,
      adjustmentTotalMinor: 2000,
      accessReference: {
        kind: 'organizer_statement',
        traceId: 'payout-request:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        href: '/api/payments/payouts/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/statement?organizationId=11111111-1111-4111-8111-111111111111',
      },
      deliveryReference: {
        channel: 'api_pull',
        referenceId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        traceId: 'payout-statement-delivery:payout-request:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      },
      generatedAt: new Date('2026-02-25T23:15:00.000Z'),
    });

    const response = await GET(
      new Request(
        'http://localhost/api/payments/payouts/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/statement?organizationId=11111111-1111-4111-8111-111111111111',
      ),
      createRouteContext('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');

    const body = await response.json();
    expect(body.data).toMatchObject({
      payoutStatementId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      organizerId: '11111111-1111-4111-8111-111111111111',
      payoutRequestId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      payoutStatus: 'completed',
      adjustmentTotalMinor: 2000,
      quoteReference: {
        requestedAt: '2026-02-25T20:00:00.000Z',
      },
      adjustmentLines: [
        expect.objectContaining({
          occurredAt: '2026-02-25T21:00:00.000Z',
        }),
      ],
      generatedAt: '2026-02-25T23:15:00.000Z',
    });
  });
});
