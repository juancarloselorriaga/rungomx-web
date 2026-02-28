const mockRequireAuthenticatedUser = jest.fn();
const mockGetOrgMembership = jest.fn();
const mockRequireOrgPermission = jest.fn();
const mockExecuteRefundRequest = jest.fn();
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

jest.mock('@/lib/payments/refunds/refund-execution', () => {
  class MockRefundExecutionError extends Error {
    public readonly code: string;

    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  }

  return {
    RefundExecutionError: MockRefundExecutionError,
    executeRefundRequest: (...args: unknown[]) => mockExecuteRefundRequest(...args),
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

import { POST } from '@/app/api/payments/refunds/[refundRequestId]/execute/route';
import { RefundExecutionError } from '@/lib/payments/refunds/refund-execution';

function createRouteContext(refundRequestId: string) {
  return {
    params: Promise.resolve({ refundRequestId }),
  };
}

describe('POST /api/payments/refunds/[refundRequestId]/execute', () => {
  beforeEach(() => {
    mockRequireAuthenticatedUser.mockReset();
    mockGetOrgMembership.mockReset();
    mockRequireOrgPermission.mockReset();
    mockExecuteRefundRequest.mockReset();
    mockFindOrganization.mockReset();

    mockRequireOrgPermission.mockImplementation(() => undefined);
    mockFindOrganization.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
    });
  });

  it('returns 401 when user is not authenticated', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({ user: null, permissions: { canManageEvents: false } });

    const response = await POST(
      new Request('http://localhost/api/payments/refunds/22222222-2222-4222-8222-222222222222/execute', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: '11111111-1111-4111-8111-111111111111',
          requestedAmountMinor: 500,
          maxRefundableToAttendeeMinorPerRun: 1000,
        }),
      }),
      createRouteContext('22222222-2222-4222-8222-222222222222'),
    );

    expect(response.status).toBe(401);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('returns 400 when route param is invalid', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({
      user: { id: 'organizer-user-1' },
      permissions: { canManageEvents: true },
    });

    const response = await POST(
      new Request('http://localhost/api/payments/refunds/not-a-uuid/execute', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: '11111111-1111-4111-8111-111111111111',
          requestedAmountMinor: 500,
          maxRefundableToAttendeeMinorPerRun: 1000,
        }),
      }),
      createRouteContext('not-a-uuid'),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('Invalid refund request ID');
  });

  it('returns 403 when requester lacks organizer permission', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({
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
      new Request('http://localhost/api/payments/refunds/22222222-2222-4222-8222-222222222222/execute', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: '11111111-1111-4111-8111-111111111111',
          requestedAmountMinor: 500,
          maxRefundableToAttendeeMinorPerRun: 1000,
        }),
      }),
      createRouteContext('22222222-2222-4222-8222-222222222222'),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Permission denied' });
  });

  it('returns 404 when organization is not found', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({
      user: { id: 'organizer-user-1' },
      permissions: { canManageEvents: true },
    });
    mockFindOrganization.mockResolvedValue(null);

    const response = await POST(
      new Request('http://localhost/api/payments/refunds/22222222-2222-4222-8222-222222222222/execute', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: '11111111-1111-4111-8111-111111111111',
          requestedAmountMinor: 500,
          maxRefundableToAttendeeMinorPerRun: 1000,
        }),
      }),
      createRouteContext('22222222-2222-4222-8222-222222222222'),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Organization not found' });
  });

  it('maps max refundable violations to 409', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({
      user: { id: 'organizer-user-1' },
      permissions: { canManageEvents: true },
    });
    mockExecuteRefundRequest.mockRejectedValue(
      new RefundExecutionError(
        'REFUND_MAX_REFUNDABLE_EXCEEDED',
        'Requested refund exceeds remaining refundable capacity (100).',
      ),
    );

    const response = await POST(
      new Request('http://localhost/api/payments/refunds/22222222-2222-4222-8222-222222222222/execute', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: '11111111-1111-4111-8111-111111111111',
          requestedAmountMinor: 500,
          maxRefundableToAttendeeMinorPerRun: 1000,
        }),
      }),
      createRouteContext('22222222-2222-4222-8222-222222222222'),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: 'Refund execution rejected',
      code: 'REFUND_MAX_REFUNDABLE_EXCEEDED',
      reason: 'Requested refund exceeds remaining refundable capacity (100).',
    });
  });

  it('maps runtime policy blocks to 503', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({
      user: { id: 'organizer-user-1' },
      permissions: { canManageEvents: true },
    });
    mockExecuteRefundRequest.mockRejectedValue(
      new RefundExecutionError(
        'REFUND_RUNTIME_BLOCKED',
        'refund_execution_processor must run on dedicated worker runtime in production (received: web).',
      ),
    );

    const response = await POST(
      new Request('http://localhost/api/payments/refunds/22222222-2222-4222-8222-222222222222/execute', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: '11111111-1111-4111-8111-111111111111',
          requestedAmountMinor: 500,
          maxRefundableToAttendeeMinorPerRun: 1000,
        }),
      }),
      createRouteContext('22222222-2222-4222-8222-222222222222'),
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: 'Refund execution processor unavailable on this runtime',
      code: 'REFUND_RUNTIME_BLOCKED',
      reason:
        'refund_execution_processor must run on dedicated worker runtime in production (received: web).',
    });
  });

  it('returns 200 with execution payload on success', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({
      user: { id: 'organizer-user-1' },
      permissions: { canManageEvents: false },
    });
    mockGetOrgMembership.mockResolvedValue({
      organizationId: '11111111-1111-4111-8111-111111111111',
      role: 'owner',
    });
    mockExecuteRefundRequest.mockResolvedValue({
      refundRequestId: '22222222-2222-4222-8222-222222222222',
      registrationId: '33333333-3333-4333-8333-333333333333',
      organizerId: '11111111-1111-4111-8111-111111111111',
      attendeeUserId: 'attendee-1',
      status: 'executed',
      reasonCode: 'medical',
      requestedAmountMinor: 500,
      maxRefundableToAttendeeMinorPerRun: 1000,
      effectiveMaxRefundableMinor: 1000,
      alreadyRefundedMinor: 100,
      remainingRefundableBeforeMinor: 900,
      remainingRefundableAfterMinor: 400,
      executedAt: new Date('2026-02-23T23:10:00.000Z'),
      executedByUserId: 'organizer-user-1',
      traceId: 'refund-execution:22222222-2222-4222-8222-222222222222',
      ingressDeduplicated: false,
      runtime: 'web',
      executionMode: 'in_process',
      notifications: {
        channels: ['in_app', 'email'],
        policyWordingVersion: 'refund-execution-policy-v1',
        policyWording:
          'Refund execution is limited by remaining refundable capacity, and service fees are non-refundable.',
        attendee: {
          userIds: ['attendee-1'],
          message: 'Attendee message',
          traceId: 'refund-execution:22222222-2222-4222-8222-222222222222',
          inAppStatus: 'persisted',
          emailStatus: 'sent',
        },
        organizer: {
          userIds: ['organizer-user-1'],
          message: 'Organizer message',
          traceId: 'refund-execution:22222222-2222-4222-8222-222222222222',
          inAppStatus: 'persisted',
          emailStatus: 'sent',
        },
      },
    });

    const response = await POST(
      new Request('http://localhost/api/payments/refunds/22222222-2222-4222-8222-222222222222/execute', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: '11111111-1111-4111-8111-111111111111',
          requestedAmountMinor: 500,
          maxRefundableToAttendeeMinorPerRun: 1000,
        }),
      }),
      createRouteContext('22222222-2222-4222-8222-222222222222'),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');

    const body = await response.json();
    expect(body.data).toMatchObject({
      refundRequestId: '22222222-2222-4222-8222-222222222222',
      registrationId: '33333333-3333-4333-8333-333333333333',
      organizerId: '11111111-1111-4111-8111-111111111111',
      attendeeUserId: 'attendee-1',
      status: 'executed',
      reasonCode: 'medical',
      requestedAmountMinor: 500,
      maxRefundableToAttendeeMinorPerRun: 1000,
      effectiveMaxRefundableMinor: 1000,
      alreadyRefundedMinor: 100,
      remainingRefundableBeforeMinor: 900,
      remainingRefundableAfterMinor: 400,
      executedAt: '2026-02-23T23:10:00.000Z',
      traceId: 'refund-execution:22222222-2222-4222-8222-222222222222',
      runtime: 'web',
      executionMode: 'in_process',
      notifications: {
        channels: ['in_app', 'email'],
      },
    });

    expect(mockExecuteRefundRequest).toHaveBeenCalledWith({
      refundRequestId: '22222222-2222-4222-8222-222222222222',
      organizerId: '11111111-1111-4111-8111-111111111111',
      executedByUserId: 'organizer-user-1',
      requestedAmountMinor: 500,
      maxRefundableToAttendeeMinorPerRun: 1000,
      runtime: 'web',
      executionMode: 'in_process',
    });
  });
});
