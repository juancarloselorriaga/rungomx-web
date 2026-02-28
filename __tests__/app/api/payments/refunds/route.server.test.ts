const mockRequireAuthenticatedUser = jest.fn();
const mockSubmitAttendeeRefundRequest = jest.fn();

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

jest.mock('@/lib/payments/refunds/request-submission', () => {
  const actual = jest.requireActual('@/lib/payments/refunds/request-submission');
  return {
    ...actual,
    submitAttendeeRefundRequest: (...args: unknown[]) => mockSubmitAttendeeRefundRequest(...args),
  };
});

import { POST } from '@/app/api/payments/refunds/route';
import { RegistrationOwnershipError } from '@/lib/events/registrations/ownership';
import { RefundRequestEligibilityError } from '@/lib/payments/refunds/request-submission';

describe('POST /api/payments/refunds', () => {
  beforeEach(() => {
    mockRequireAuthenticatedUser.mockReset();
    mockSubmitAttendeeRefundRequest.mockReset();
  });

  it('returns 401 when user is not authenticated', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({ user: null, permissions: { canManageEvents: false } });

    const response = await POST(
      new Request('http://localhost/api/payments/refunds', {
        method: 'POST',
        body: JSON.stringify({ registrationId: '11111111-1111-4111-8111-111111111111', reasonCode: 'other' }),
      }),
    );

    expect(response.status).toBe(401);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('returns 400 for invalid JSON body', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({
      user: { id: 'attendee-1' },
      permissions: { canManageEvents: false },
    });

    const response = await POST(
      new Request('http://localhost/api/payments/refunds', {
        method: 'POST',
        body: '{invalid-json',
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Invalid JSON body' });
    expect(mockSubmitAttendeeRefundRequest).not.toHaveBeenCalled();
  });

  it('returns 400 for payload validation errors', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({
      user: { id: 'attendee-1' },
      permissions: { canManageEvents: false },
    });

    const response = await POST(
      new Request('http://localhost/api/payments/refunds', {
        method: 'POST',
        body: JSON.stringify({ registrationId: 'not-a-uuid', reasonCode: 'invalid_reason' }),
      }),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('Invalid refund request payload');
    expect(body.details).toBeDefined();
    expect(mockSubmitAttendeeRefundRequest).not.toHaveBeenCalled();
  });

  it('returns 201 with request snapshots when submission succeeds', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({
      user: { id: 'attendee-1' },
      permissions: { canManageEvents: false },
    });

    mockSubmitAttendeeRefundRequest.mockResolvedValue({
      id: 'refund-request-1',
      registrationId: '11111111-1111-4111-8111-111111111111',
      editionId: '22222222-2222-4222-8222-222222222222',
      organizerId: '33333333-3333-4333-8333-333333333333',
      attendeeUserId: 'attendee-1',
      status: 'pending_organizer_decision',
      reasonCode: 'medical',
      reasonNote: 'Need to travel',
      requestedAt: new Date('2026-02-23T20:00:00.000Z'),
      eligibilitySnapshot: {
        version: 'refund-request-eligibility-v1',
        decision: 'eligible',
      },
      financialSnapshot: {
        version: 'refund-request-financial-v1',
        serviceFeePolicy: 'non_refundable_always',
      },
    });

    const response = await POST(
      new Request('http://localhost/api/payments/refunds', {
        method: 'POST',
        body: JSON.stringify({
          registrationId: '11111111-1111-4111-8111-111111111111',
          reasonCode: 'medical',
          reasonNote: 'Need to travel',
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(response.headers.get('Cache-Control')).toBe('no-store');

    const body = await response.json();
    expect(body.data).toMatchObject({
      refundRequestId: 'refund-request-1',
      registrationId: '11111111-1111-4111-8111-111111111111',
      status: 'pending_organizer_decision',
      reasonCode: 'medical',
      reasonNote: 'Need to travel',
      requestedAt: '2026-02-23T20:00:00.000Z',
      policySnapshot: {
        version: 'refund-request-eligibility-v1',
      },
      financialSnapshot: {
        version: 'refund-request-financial-v1',
        serviceFeePolicy: 'non_refundable_always',
      },
    });
  });

  it('maps ownership not-found errors to 404', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({
      user: { id: 'attendee-1' },
      permissions: { canManageEvents: false },
    });

    mockSubmitAttendeeRefundRequest.mockRejectedValue(
      new RegistrationOwnershipError('NOT_FOUND', 'Registration not found'),
    );

    const response = await POST(
      new Request('http://localhost/api/payments/refunds', {
        method: 'POST',
        body: JSON.stringify({
          registrationId: '11111111-1111-4111-8111-111111111111',
          reasonCode: 'other',
        }),
      }),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: 'Registration not found',
      code: 'NOT_FOUND',
    });
  });

  it('maps eligibility rejection to 409 with a clear reason payload', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({
      user: { id: 'attendee-1' },
      permissions: { canManageEvents: false },
    });

    mockSubmitAttendeeRefundRequest.mockRejectedValue(
      new RefundRequestEligibilityError('REFUND_DEADLINE_EXPIRED', 'Refund window closed on 2026-02-20T00:00:00.000Z.'),
    );

    const response = await POST(
      new Request('http://localhost/api/payments/refunds', {
        method: 'POST',
        body: JSON.stringify({
          registrationId: '11111111-1111-4111-8111-111111111111',
          reasonCode: 'other',
        }),
      }),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: 'Refund request is not eligible',
      reasonCode: 'REFUND_DEADLINE_EXPIRED',
      reason: 'Refund window closed on 2026-02-20T00:00:00.000Z.',
    });
  });
});
