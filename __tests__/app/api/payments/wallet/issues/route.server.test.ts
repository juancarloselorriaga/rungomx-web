const mockRequireAuthenticatedUser = jest.fn();
const mockGetOrgMembership = jest.fn();
const mockGetOrganizerWalletIssueActivity = jest.fn();
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

jest.mock('@/lib/payments/wallet/issue-activity', () => ({
  getOrganizerWalletIssueActivity: (...args: unknown[]) =>
    mockGetOrganizerWalletIssueActivity(...args),
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

import { GET } from '@/app/api/payments/wallet/issues/route';

describe('GET /api/payments/wallet/issues', () => {
  beforeEach(() => {
    mockRequireAuthenticatedUser.mockReset();
    mockGetOrgMembership.mockReset();
    mockGetOrganizerWalletIssueActivity.mockReset();
    mockFindOrganization.mockReset();
  });

  it('returns 401 when user is unauthenticated', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({ user: null, permissions: { canManageEvents: false } });

    const response = await GET(
      new Request('http://localhost/api/payments/wallet/issues?organizationId=11111111-1111-4111-8111-111111111111'),
    );

    expect(response.status).toBe(401);
  });

  it('returns 400 when organizationId is invalid', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({
      user: { id: 'user-1' },
      permissions: { canManageEvents: false },
    });

    const response = await GET(
      new Request('http://localhost/api/payments/wallet/issues?organizationId=invalid-org'),
    );

    expect(response.status).toBe(400);
  });

  it('returns 403 when user has no organizer membership', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({
      user: { id: 'user-1' },
      permissions: { canManageEvents: false },
    });
    mockGetOrgMembership.mockResolvedValue(null);

    const response = await GET(
      new Request('http://localhost/api/payments/wallet/issues?organizationId=11111111-1111-4111-8111-111111111111'),
    );

    expect(response.status).toBe(403);
  });

  it('returns grouped issue-focused activity when authorized', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({
      user: { id: 'user-1' },
      permissions: { canManageEvents: false },
    });
    mockGetOrgMembership.mockResolvedValue({
      organizationId: '11111111-1111-4111-8111-111111111111',
      role: 'owner',
    });
    mockFindOrganization.mockResolvedValue({ id: '11111111-1111-4111-8111-111111111111' });
    mockGetOrganizerWalletIssueActivity.mockResolvedValue({
      organizerId: '11111111-1111-4111-8111-111111111111',
      asOf: new Date('2026-02-24T12:00:00.000Z'),
      actionNeeded: [
        {
          eventId: 'event-debt-policy',
          traceId: 'trace-debt-policy',
          eventName: 'debt_control.pause_required',
          entityType: 'debt_policy',
          entityId: 'policy-1',
          occurredAt: new Date('2026-02-24T10:00:00.000Z'),
          state: 'action_needed',
          stateLabel: 'Action Needed',
          stateDescription:
            'Paid registrations were paused by debt policy; free registrations remain available while debt recovers.',
          recoveryGuidance: {
            policyCode: 'debt_threshold_v1',
            reasonCode: 'debt_threshold_pause_required',
            guidanceCode: 'reduce_debt_below_resume_threshold',
            debtMinor: 90000,
            pauseThresholdMinor: 50000,
            resumeThresholdMinor: 25000,
          },
        },
      ],
      inProgress: [
        {
          eventId: 'event-payout',
          traceId: 'trace-payout',
          eventName: 'payout.requested',
          entityType: 'payout',
          entityId: 'payout-1',
          occurredAt: new Date('2026-02-24T09:00:00.000Z'),
          state: 'in_progress',
          stateLabel: 'In Progress',
          stateDescription: 'Your payout request is processing through the platform payout lifecycle.',
          recoveryGuidance: null,
        },
      ],
      actionNeededCount: 1,
      inProgressCount: 1,
    });

    const response = await GET(
      new Request('http://localhost/api/payments/wallet/issues?organizationId=11111111-1111-4111-8111-111111111111'),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');

    const body = await response.json();
    expect(body.data.organizerId).toBe('11111111-1111-4111-8111-111111111111');
    expect(body.data.actionNeeded).toHaveLength(1);
    expect(body.data.actionNeeded[0].recoveryGuidance.guidanceCode).toBe(
      'reduce_debt_below_resume_threshold',
    );
    expect(body.data.inProgress).toHaveLength(1);
    expect(body.meta).toEqual({
      actionNeededCount: 1,
      inProgressCount: 1,
      semantics: {
        actionNeededLabel: 'Action Needed',
        inProgressLabel: 'In Progress',
      },
    });
  });
});
