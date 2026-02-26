const mockGetAuthContext = jest.fn();
const mockGetOrgMembership = jest.fn();
const mockRequireOrgPermission = jest.fn();
const mockCreateQueuedPayoutIntent = jest.fn();
const mockFindOrganization = jest.fn();

jest.mock('@/lib/auth/server', () => ({
  getAuthContext: (...args: unknown[]) => mockGetAuthContext(...args),
}));

jest.mock('@/lib/organizations/permissions', () => ({
  getOrgMembership: (...args: unknown[]) => mockGetOrgMembership(...args),
  requireOrgPermission: (...args: unknown[]) => mockRequireOrgPermission(...args),
}));

jest.mock('@/lib/payments/payouts/queue-intents', () => {
  class MockPayoutQueueIntentError extends Error {
    public readonly code: string;

    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  }

  return {
    PayoutQueueIntentError: MockPayoutQueueIntentError,
    createQueuedPayoutIntent: (...args: unknown[]) => mockCreateQueuedPayoutIntent(...args),
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

import { POST } from '@/app/api/payments/payouts/queued-intents/route';
import { PayoutQueueIntentError } from '@/lib/payments/payouts/queue-intents';

describe('POST /api/payments/payouts/queued-intents', () => {
  beforeEach(() => {
    mockGetAuthContext.mockReset();
    mockGetOrgMembership.mockReset();
    mockRequireOrgPermission.mockReset();
    mockCreateQueuedPayoutIntent.mockReset();
    mockFindOrganization.mockReset();

    mockRequireOrgPermission.mockImplementation(() => undefined);
    mockFindOrganization.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
    });
  });

  it('returns 401 when requester is unauthenticated', async () => {
    mockGetAuthContext.mockResolvedValue({ user: null, permissions: { canManageEvents: false } });

    const response = await POST(
      new Request('http://localhost/api/payments/payouts/queued-intents', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: '11111111-1111-4111-8111-111111111111',
          requestedAmountMinor: 5000,
          idempotencyKey: 'queued-1',
        }),
      }),
    );

    expect(response.status).toBe(401);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('returns 400 for invalid payload', async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: 'organizer-user-1' },
      permissions: { canManageEvents: true },
    });

    const response = await POST(
      new Request('http://localhost/api/payments/payouts/queued-intents', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: 'not-a-uuid',
          requestedAmountMinor: -1,
          idempotencyKey: '',
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(mockCreateQueuedPayoutIntent).not.toHaveBeenCalled();
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

    const response = await POST(
      new Request('http://localhost/api/payments/payouts/queued-intents', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: '11111111-1111-4111-8111-111111111111',
          requestedAmountMinor: 5000,
          idempotencyKey: 'queued-1',
        }),
      }),
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

    const response = await POST(
      new Request('http://localhost/api/payments/payouts/queued-intents', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: '11111111-1111-4111-8111-111111111111',
          requestedAmountMinor: 5000,
          idempotencyKey: 'queued-1',
        }),
      }),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Organization not found' });
  });

  it('maps immediate-eligibility queue rejections to 409', async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: 'organizer-user-1' },
      permissions: { canManageEvents: true },
    });
    mockCreateQueuedPayoutIntent.mockRejectedValue(
      new PayoutQueueIntentError(
        'PAYOUT_QUEUE_ELIGIBLE_FOR_IMMEDIATE',
        'Organizer is currently eligible for immediate payout; queueing is not required for this request.',
      ),
    );

    const response = await POST(
      new Request('http://localhost/api/payments/payouts/queued-intents', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: '11111111-1111-4111-8111-111111111111',
          requestedAmountMinor: 5000,
          idempotencyKey: 'queued-1',
        }),
      }),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: 'Queued payout intent is not required',
      code: 'PAYOUT_QUEUE_ELIGIBLE_FOR_IMMEDIATE',
      reason:
        'Organizer is currently eligible for immediate payout; queueing is not required for this request.',
    });
  });

  it('maps active queued-intent conflicts to 409', async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: 'organizer-user-1' },
      permissions: { canManageEvents: true },
    });
    mockCreateQueuedPayoutIntent.mockRejectedValue(
      new PayoutQueueIntentError(
        'PAYOUT_QUEUE_ALREADY_ACTIVE',
        'Organizer already has an active queued payout lifecycle.',
      ),
    );

    const response = await POST(
      new Request('http://localhost/api/payments/payouts/queued-intents', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: '11111111-1111-4111-8111-111111111111',
          requestedAmountMinor: 5000,
          idempotencyKey: 'queued-duplicate',
        }),
      }),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: 'Queued payout intent already exists for organizer',
      code: 'PAYOUT_QUEUE_ALREADY_ACTIVE',
      reason: 'Organizer already has an active queued payout lifecycle.',
    });
  });

  it('1.2-API-004 persists queued payout mutation metadata through ingress', async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: 'organizer-user-1' },
      permissions: { canManageEvents: true },
    });
    mockCreateQueuedPayoutIntent.mockResolvedValue({
      payoutQueuedIntentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      organizerId: '11111111-1111-4111-8111-111111111111',
      status: 'queued',
      requestedAmountMinor: 5000,
      currency: 'MXN',
      blockedReasonCode: 'insufficient_available_after_deductions',
      criteriaFingerprint: 'f'.repeat(64),
      queueTraceId: 'payout-queue:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      createdAt: new Date('2026-02-25T20:00:00.000Z'),
      idempotencyReused: false,
      ingressDeduplicated: false,
      eligibilityCriteria: { version: 'payout-queued-criteria-v1' },
    });

    const response = await POST(
      new Request('http://localhost/api/payments/payouts/queued-intents', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: '11111111-1111-4111-8111-111111111111',
          requestedAmountMinor: 5000,
          idempotencyKey: 'queued-1',
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const body = await response.json();
    expect(body.data).toMatchObject({
      payoutQueuedIntentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      status: 'queued',
      requestedAmountMinor: 5000,
      blockedReasonCode: 'insufficient_available_after_deductions',
      idempotencyReused: false,
      ingressDeduplicated: false,
      createdAt: '2026-02-25T20:00:00.000Z',
    });
  });

  it('1.3-API-002 returns deterministic queued-intent payload for duplicate idempotency keys', async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: 'organizer-user-1' },
      permissions: { canManageEvents: true },
    });
    mockCreateQueuedPayoutIntent.mockResolvedValue({
      payoutQueuedIntentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      organizerId: '11111111-1111-4111-8111-111111111111',
      status: 'queued',
      requestedAmountMinor: 5000,
      currency: 'MXN',
      blockedReasonCode: 'insufficient_available_after_deductions',
      criteriaFingerprint: 'f'.repeat(64),
      queueTraceId: 'payout-queue:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      createdAt: new Date('2026-02-25T20:00:00.000Z'),
      idempotencyReused: true,
      ingressDeduplicated: true,
      eligibilityCriteria: { version: 'payout-queued-criteria-v1' },
    });

    const response = await POST(
      new Request('http://localhost/api/payments/payouts/queued-intents', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: '11111111-1111-4111-8111-111111111111',
          requestedAmountMinor: 5000,
          idempotencyKey: 'queued-1',
        }),
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.idempotencyReused).toBe(true);
  });
});
