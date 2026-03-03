const mockRequireAuthenticatedUser = jest.fn();
const mockGetOrgMembership = jest.fn();
const mockRequireOrgPermission = jest.fn();
const mockSubmitOrganizerRefundDecision = jest.fn();
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

jest.mock('@/lib/payments/refunds/decision-submission', () => {
  const actual = jest.requireActual('@/lib/payments/refunds/decision-submission');
  return {
    ...actual,
    submitOrganizerRefundDecision: (...args: unknown[]) =>
      mockSubmitOrganizerRefundDecision(...args),
  };
});

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

import { PATCH } from '@/app/api/payments/refunds/[refundRequestId]/route';
import { POST } from '@/app/api/payments/refunds/[refundRequestId]/execute/route';
import { RefundExecutionError } from '@/lib/payments/refunds/refund-execution';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const REFUND_REQUEST_ID = '22222222-2222-4222-8222-222222222222';
const REGISTRATION_ID = '33333333-3333-4333-8333-333333333333';

function createRouteContext(refundRequestId: string) {
  return {
    params: Promise.resolve({ refundRequestId }),
  };
}

describe('refund decision -> execution money-flow route scenario', () => {
  beforeEach(() => {
    mockRequireAuthenticatedUser.mockReset();
    mockGetOrgMembership.mockReset();
    mockRequireOrgPermission.mockReset();
    mockSubmitOrganizerRefundDecision.mockReset();
    mockExecuteRefundRequest.mockReset();
    mockFindOrganization.mockReset();

    mockRequireAuthenticatedUser.mockResolvedValue({
      user: { id: 'organizer-user-1' },
      permissions: { canManageEvents: false },
    });
    mockGetOrgMembership.mockResolvedValue({
      organizationId: ORGANIZATION_ID,
      role: 'owner',
    });
    mockRequireOrgPermission.mockImplementation(() => undefined);
    mockFindOrganization.mockResolvedValue({ id: ORGANIZATION_ID });
  });

  it('approves a request and executes a partial refund amount through route boundaries', async () => {
    mockSubmitOrganizerRefundDecision.mockResolvedValue({
      refundRequestId: REFUND_REQUEST_ID,
      registrationId: REGISTRATION_ID,
      organizerId: ORGANIZATION_ID,
      attendeeUserId: 'attendee-1',
      decision: 'approve',
      status: 'approved',
      decisionReason: 'Approved by organizer',
      decisionAt: new Date('2026-03-03T10:00:00.000Z'),
      decidedByUserId: 'organizer-user-1',
      requestedAt: new Date('2026-03-03T09:00:00.000Z'),
    });
    mockExecuteRefundRequest.mockResolvedValue({
      refundRequestId: REFUND_REQUEST_ID,
      registrationId: REGISTRATION_ID,
      organizerId: ORGANIZATION_ID,
      attendeeUserId: 'attendee-1',
      status: 'executed',
      reasonCode: 'approved',
      requestedAmountMinor: 300,
      maxRefundableToAttendeeMinorPerRun: 1000,
      effectiveMaxRefundableMinor: 1000,
      alreadyRefundedMinor: 0,
      remainingRefundableBeforeMinor: 1000,
      remainingRefundableAfterMinor: 700,
      executedAt: new Date('2026-03-03T10:05:00.000Z'),
      executedByUserId: 'organizer-user-1',
      traceId: `refund-execution:${REFUND_REQUEST_ID}`,
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
          traceId: `refund-execution:${REFUND_REQUEST_ID}`,
          inAppStatus: 'persisted',
          emailStatus: 'sent',
        },
        organizer: {
          userIds: ['organizer-user-1'],
          message: 'Organizer message',
          traceId: `refund-execution:${REFUND_REQUEST_ID}`,
          inAppStatus: 'persisted',
          emailStatus: 'sent',
        },
      },
    });

    const decisionResponse = await PATCH(
      new Request(`http://localhost/api/payments/refunds/${REFUND_REQUEST_ID}`, {
        method: 'PATCH',
        body: JSON.stringify({
          organizationId: ORGANIZATION_ID,
          decision: 'approve',
          decisionReason: 'Approved by organizer',
        }),
      }),
      createRouteContext(REFUND_REQUEST_ID),
    );

    expect(decisionResponse.status).toBe(200);
    expect(decisionResponse.headers.get('Cache-Control')).toBe('no-store');
    const decisionBody = await decisionResponse.json();
    expect(decisionBody.data).toMatchObject({
      refundRequestId: REFUND_REQUEST_ID,
      status: 'approved',
      decision: 'approve',
    });

    const executionResponse = await POST(
      new Request(`http://localhost/api/payments/refunds/${REFUND_REQUEST_ID}/execute`, {
        method: 'POST',
        body: JSON.stringify({
          organizationId: ORGANIZATION_ID,
          requestedAmountMinor: 300,
          maxRefundableToAttendeeMinorPerRun: 1000,
        }),
      }),
      createRouteContext(REFUND_REQUEST_ID),
    );

    expect(executionResponse.status).toBe(200);
    expect(executionResponse.headers.get('Cache-Control')).toBe('no-store');
    const executionBody = await executionResponse.json();
    expect(executionBody.data).toMatchObject({
      refundRequestId: REFUND_REQUEST_ID,
      status: 'executed',
      requestedAmountMinor: 300,
      maxRefundableToAttendeeMinorPerRun: 1000,
      runtime: 'web',
      executionMode: 'in_process',
    });

    expect(mockSubmitOrganizerRefundDecision).toHaveBeenCalledWith({
      refundRequestId: REFUND_REQUEST_ID,
      organizerId: ORGANIZATION_ID,
      decidedByUserId: 'organizer-user-1',
      decision: 'approve',
      decisionReason: 'Approved by organizer',
    });
    expect(mockExecuteRefundRequest).toHaveBeenCalledWith({
      refundRequestId: REFUND_REQUEST_ID,
      organizerId: ORGANIZATION_ID,
      executedByUserId: 'organizer-user-1',
      requestedAmountMinor: 300,
      maxRefundableToAttendeeMinorPerRun: 1000,
      runtime: 'web',
      executionMode: 'in_process',
    });
  });

  it('allows deny decision route response and maps follow-up execute attempt to 409', async () => {
    mockSubmitOrganizerRefundDecision.mockResolvedValue({
      refundRequestId: REFUND_REQUEST_ID,
      registrationId: REGISTRATION_ID,
      organizerId: ORGANIZATION_ID,
      attendeeUserId: 'attendee-1',
      decision: 'deny',
      status: 'denied',
      decisionReason: 'Not eligible',
      decisionAt: new Date('2026-03-03T11:00:00.000Z'),
      decidedByUserId: 'organizer-user-1',
      requestedAt: new Date('2026-03-03T09:00:00.000Z'),
    });
    mockExecuteRefundRequest.mockRejectedValue(
      new RefundExecutionError(
        'REFUND_REQUEST_NOT_EXECUTABLE',
        'Refund request cannot be executed because it is denied.',
      ),
    );

    const decisionResponse = await PATCH(
      new Request(`http://localhost/api/payments/refunds/${REFUND_REQUEST_ID}`, {
        method: 'PATCH',
        body: JSON.stringify({
          organizationId: ORGANIZATION_ID,
          decision: 'deny',
          decisionReason: 'Not eligible',
        }),
      }),
      createRouteContext(REFUND_REQUEST_ID),
    );

    expect(decisionResponse.status).toBe(200);
    const decisionBody = await decisionResponse.json();
    expect(decisionBody.data).toMatchObject({
      refundRequestId: REFUND_REQUEST_ID,
      status: 'denied',
      decision: 'deny',
    });

    const executionResponse = await POST(
      new Request(`http://localhost/api/payments/refunds/${REFUND_REQUEST_ID}/execute`, {
        method: 'POST',
        body: JSON.stringify({
          organizationId: ORGANIZATION_ID,
          requestedAmountMinor: 100,
          maxRefundableToAttendeeMinorPerRun: 1000,
        }),
      }),
      createRouteContext(REFUND_REQUEST_ID),
    );

    expect(executionResponse.status).toBe(409);
    expect(await executionResponse.json()).toEqual({
      error: 'Refund execution rejected',
      code: 'REFUND_REQUEST_NOT_EXECUTABLE',
      reason: 'Refund request cannot be executed because it is denied.',
    });
  });

  it('handles near-simultaneous duplicate execution attempts with one success and one conflict', async () => {
    mockExecuteRefundRequest
      .mockResolvedValueOnce({
        refundRequestId: REFUND_REQUEST_ID,
        registrationId: REGISTRATION_ID,
        organizerId: ORGANIZATION_ID,
        attendeeUserId: 'attendee-1',
        status: 'executed',
        reasonCode: 'approved',
        requestedAmountMinor: 250,
        maxRefundableToAttendeeMinorPerRun: 1000,
        effectiveMaxRefundableMinor: 1000,
        alreadyRefundedMinor: 0,
        remainingRefundableBeforeMinor: 1000,
        remainingRefundableAfterMinor: 750,
        executedAt: new Date('2026-03-03T12:00:00.000Z'),
        executedByUserId: 'organizer-user-1',
        traceId: `refund-execution:${REFUND_REQUEST_ID}`,
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
            traceId: `refund-execution:${REFUND_REQUEST_ID}`,
            inAppStatus: 'persisted',
            emailStatus: 'sent',
          },
          organizer: {
            userIds: ['organizer-user-1'],
            message: 'Organizer message',
            traceId: `refund-execution:${REFUND_REQUEST_ID}`,
            inAppStatus: 'persisted',
            emailStatus: 'sent',
          },
        },
      })
      .mockRejectedValueOnce(
        new RefundExecutionError(
          'REFUND_REQUEST_ALREADY_EXECUTED',
          'Refund request has already been executed.',
        ),
      );

    const callExecution = () =>
      POST(
        new Request(`http://localhost/api/payments/refunds/${REFUND_REQUEST_ID}/execute`, {
          method: 'POST',
          body: JSON.stringify({
            organizationId: ORGANIZATION_ID,
            requestedAmountMinor: 250,
            maxRefundableToAttendeeMinorPerRun: 1000,
          }),
        }),
        createRouteContext(REFUND_REQUEST_ID),
      );

    const [firstResponse, secondResponse] = await Promise.all([callExecution(), callExecution()]);
    const sortedStatuses = [firstResponse.status, secondResponse.status].sort((a, b) => a - b);
    expect(sortedStatuses).toEqual([200, 409]);
    expect(mockExecuteRefundRequest).toHaveBeenCalledTimes(2);

    const [firstBody, secondBody] = await Promise.all([firstResponse.json(), secondResponse.json()]);
    const successBody = firstResponse.status === 200 ? firstBody : secondBody;
    const conflictBody = firstResponse.status === 409 ? firstBody : secondBody;

    expect(successBody.data).toMatchObject({
      refundRequestId: REFUND_REQUEST_ID,
      status: 'executed',
      requestedAmountMinor: 250,
    });
    expect(conflictBody).toEqual({
      error: 'Refund execution rejected',
      code: 'REFUND_REQUEST_ALREADY_EXECUTED',
      reason: 'Refund request has already been executed.',
    });
  });
});
