const mockRequireAuthenticatedUser = jest.fn();
const mockSweepQueuedPayoutIntentActivations = jest.fn();
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

jest.mock('@/lib/payments/payouts/queue-intents', () => {
  const actual = jest.requireActual('@/lib/payments/payouts/queue-intents');
  return {
    ...actual,
    sweepQueuedPayoutIntentActivations: (...args: unknown[]) =>
      mockSweepQueuedPayoutIntentActivations(...args),
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

import { POST } from '@/app/api/payments/payouts/queued-intents/activations/route';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';

function buildRequest(body: unknown): Request {
  return new Request('http://localhost/api/payments/payouts/queued-intents/activations', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('POST /api/payments/payouts/queued-intents/activations', () => {
  beforeEach(() => {
    mockRequireAuthenticatedUser.mockReset();
    mockSweepQueuedPayoutIntentActivations.mockReset();
    mockFindOrganization.mockReset();

    mockFindOrganization.mockResolvedValue({ id: ORGANIZATION_ID });
  });

  it('returns 401 when user is not authenticated', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({ user: null, permissions: { canManageEvents: false } });

    const response = await POST(buildRequest({}));

    expect(response.status).toBe(401);
    expect(mockSweepQueuedPayoutIntentActivations).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid organizationId', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({
      user: { id: 'admin-1' },
      permissions: { canManageEvents: false, canAccessAdminArea: true, canViewStaffTools: true },
    });

    const response = await POST(buildRequest({ organizationId: 'not-a-uuid' }));

    expect(response.status).toBe(400);
    expect(mockSweepQueuedPayoutIntentActivations).not.toHaveBeenCalled();
  });

  it('returns 400 when limit is out of range', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({
      user: { id: 'admin-1' },
      permissions: { canManageEvents: false, canAccessAdminArea: true, canViewStaffTools: true },
    });

    const response = await POST(buildRequest({ limit: 500 }));

    expect(response.status).toBe(400);
    expect(mockSweepQueuedPayoutIntentActivations).not.toHaveBeenCalled();
  });

  it('returns 403 when requester lacks staff tools access', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({
      user: { id: 'organizer-user-1' },
      permissions: { canManageEvents: true, canAccessAdminArea: false, canViewStaffTools: false },
    });

    const response = await POST(buildRequest({}));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Permission denied' });
    expect(mockSweepQueuedPayoutIntentActivations).not.toHaveBeenCalled();
  });

  it('returns 403 when requester has admin area access but lacks staff tools access', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({
      user: { id: 'admin-area-user-1' },
      permissions: { canManageEvents: false, canAccessAdminArea: true, canViewStaffTools: false },
    });

    const response = await POST(buildRequest({}));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Permission denied' });
    expect(mockSweepQueuedPayoutIntentActivations).not.toHaveBeenCalled();
  });

  it('returns 404 when organizationId is provided but the organization is inactive or missing', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({
      user: { id: 'admin-1' },
      permissions: { canManageEvents: false, canAccessAdminArea: true, canViewStaffTools: true },
    });
    mockFindOrganization.mockResolvedValue(undefined);

    const response = await POST(buildRequest({ organizationId: ORGANIZATION_ID }));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Organization not found' });
    expect(mockSweepQueuedPayoutIntentActivations).not.toHaveBeenCalled();
  });

  it('returns a global sweep summary when organizationId is omitted', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({
      user: { id: 'admin-1' },
      permissions: { canManageEvents: false, canAccessAdminArea: true, canViewStaffTools: true },
    });
    mockSweepQueuedPayoutIntentActivations.mockResolvedValue({
      scannedCount: 3,
      activatedCount: 2,
      results: [
        {
          payoutQueuedIntentId: 'intent-a',
          organizerId: 'org-a',
          activated: true,
          reasonCode: 'activated',
          payoutRequestId: 'request-a',
        },
        {
          payoutQueuedIntentId: 'intent-b',
          organizerId: 'org-b',
          activated: true,
          reasonCode: 'activated',
          payoutRequestId: 'request-b',
        },
        {
          payoutQueuedIntentId: 'intent-c',
          organizerId: 'org-c',
          activated: false,
          reasonCode: 'still_ineligible',
          payoutRequestId: null,
        },
      ],
    });

    const response = await POST(buildRequest({}));

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');

    const body = await response.json();
    expect(body.data.organizerId).toBeNull();
    expect(body.data.scannedCount).toBe(3);
    expect(body.data.activatedCount).toBe(2);
    expect(mockFindOrganization).not.toHaveBeenCalled();
    expect(mockSweepQueuedPayoutIntentActivations).toHaveBeenCalledWith(
      expect.objectContaining({ organizerId: undefined }),
    );
  });

  it('returns an organization-scoped sweep summary when organizationId is provided', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({
      user: { id: 'admin-1' },
      permissions: { canManageEvents: false, canAccessAdminArea: true, canViewStaffTools: true },
    });
    mockSweepQueuedPayoutIntentActivations.mockResolvedValue({
      scannedCount: 1,
      activatedCount: 1,
      results: [
        {
          payoutQueuedIntentId: 'intent-a',
          organizerId: ORGANIZATION_ID,
          activated: true,
          reasonCode: 'activated',
          payoutRequestId: 'request-a',
        },
      ],
    });

    const response = await POST(buildRequest({ organizationId: ORGANIZATION_ID, limit: 25 }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.organizerId).toBe(ORGANIZATION_ID);
    expect(body.data.scannedCount).toBe(1);
    expect(body.data.activatedCount).toBe(1);
    expect(mockSweepQueuedPayoutIntentActivations).toHaveBeenCalledWith(
      expect.objectContaining({
        organizerId: ORGANIZATION_ID,
        limit: 25,
      }),
    );
  });

  it('returns 500 when the sweep throws an unexpected error', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({
      user: { id: 'admin-1' },
      permissions: { canManageEvents: false, canAccessAdminArea: true, canViewStaffTools: true },
    });
    mockSweepQueuedPayoutIntentActivations.mockRejectedValue(new Error('Unexpected failure'));

    const response = await POST(buildRequest({}));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Server error' });
  });

  it('returns 400 when cursor.createdAt is not a valid ISO datetime string', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({
      user: { id: 'admin-1' },
      permissions: { canManageEvents: false, canAccessAdminArea: true, canViewStaffTools: true },
    });
    // Stub the sweep so a pre-fix (schema doesn't know `cursor` yet) pass-through
    // resolves to a clean 200 instead of a masking 500 from an unstubbed mock.
    mockSweepQueuedPayoutIntentActivations.mockResolvedValue({
      scannedCount: 0,
      activatedCount: 0,
      results: [],
    });

    const response = await POST(
      buildRequest({
        cursor: { createdAt: 'not-a-date', id: '11111111-1111-4111-8111-111111111111' },
      }),
    );

    expect(response.status).toBe(400);
    expect(mockSweepQueuedPayoutIntentActivations).not.toHaveBeenCalled();
  });

  it('returns 400 when cursor.id is not a valid uuid', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({
      user: { id: 'admin-1' },
      permissions: { canManageEvents: false, canAccessAdminArea: true, canViewStaffTools: true },
    });
    mockSweepQueuedPayoutIntentActivations.mockResolvedValue({
      scannedCount: 0,
      activatedCount: 0,
      results: [],
    });

    const response = await POST(
      buildRequest({
        cursor: { createdAt: '2026-04-01T09:02:00.000Z', id: 'not-a-uuid' },
      }),
    );

    expect(response.status).toBe(400);
    expect(mockSweepQueuedPayoutIntentActivations).not.toHaveBeenCalled();
  });

  it('forwards a valid cursor to the sweep with createdAt converted to a Date', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({
      user: { id: 'admin-1' },
      permissions: { canManageEvents: false, canAccessAdminArea: true, canViewStaffTools: true },
    });
    mockSweepQueuedPayoutIntentActivations.mockResolvedValue({
      scannedCount: 0,
      activatedCount: 0,
      results: [],
      nextCursor: null,
    });

    const cursorId = '11111111-1111-4111-8111-111111111111';
    const cursorCreatedAtIso = '2026-04-01T09:02:00.000Z';

    const response = await POST(
      buildRequest({
        cursor: { createdAt: cursorCreatedAtIso, id: cursorId },
      }),
    );

    expect(response.status).toBe(200);
    expect(mockSweepQueuedPayoutIntentActivations).toHaveBeenCalledWith(
      expect.objectContaining({
        cursor: { createdAt: new Date(cursorCreatedAtIso), id: cursorId },
      }),
    );
  });

  it('serializes nextCursor as an ISO string in the response body when the sweep returns one', async () => {
    mockRequireAuthenticatedUser.mockResolvedValue({
      user: { id: 'admin-1' },
      permissions: { canManageEvents: false, canAccessAdminArea: true, canViewStaffTools: true },
    });
    const nextCursorId = '22222222-2222-4222-8222-222222222222';
    const nextCursorCreatedAt = new Date('2026-04-01T09:02:00.000Z');
    mockSweepQueuedPayoutIntentActivations.mockResolvedValue({
      scannedCount: 0,
      activatedCount: 0,
      results: [],
      nextCursor: { createdAt: nextCursorCreatedAt, id: nextCursorId },
    });

    const response = await POST(buildRequest({}));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.nextCursor).toEqual({
      createdAt: nextCursorCreatedAt.toISOString(),
      id: nextCursorId,
    });
  });
});
