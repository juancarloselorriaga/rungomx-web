import type { AuthContext } from '@/lib/auth/server';

const mockHeaders = jest.fn();
const mockCreateAuditLog = jest.fn(async (payload: unknown, tx: unknown) => {
  void payload;
  void tx;
  return { ok: true };
});
const mockGetRequestContext = jest.fn(async (headersValue: unknown) => {
  void headersValue;
  return { ipAddress: '127.0.0.1' };
});
const mockRequireProFeature = jest.fn();
const mockIsEventAiWizardEnabled = jest.fn();
const mockSafeUpdateTag = jest.fn();
const mockSafeRefresh = jest.fn();

let mockAuthContext: AuthContext | null = null;
let capturedInsertValues: Record<string, unknown> | null = null;

const mockDb = {
  query: {
    eventSeries: {
      findFirst: jest.fn(),
    },
    eventEditions: {
      findFirst: jest.fn(),
    },
    media: {
      findFirst: jest.fn(),
    },
  },
  transaction: jest.fn(),
};

jest.mock('next/headers', () => ({
  headers: (...args: unknown[]) => mockHeaders(...args),
}));

jest.mock('@/db', () => ({
  get db() {
    return mockDb;
  },
}));

jest.mock('@/lib/audit', () => ({
  createAuditLog: (payload: unknown, tx: unknown) => mockCreateAuditLog(payload, tx),
  getRequestContext: (headersValue: unknown) => mockGetRequestContext(headersValue),
}));

jest.mock('@/lib/auth/action-wrapper', () => ({
  withAuthenticatedUser: (options: { unauthenticated: () => unknown }) => {
    return (handler: (ctx: AuthContext, input: unknown) => Promise<unknown>) => {
      return async (input: unknown) => {
        if (!mockAuthContext) {
          return options.unauthenticated();
        }
        return handler(mockAuthContext, input);
      };
    };
  },
}));

jest.mock('@/lib/features/flags', () => ({
  isEventAiWizardEnabled: () => mockIsEventAiWizardEnabled(),
}));

jest.mock('@/lib/next-cache', () => ({
  safeRefresh: (value: unknown) => mockSafeRefresh(value),
  safeUpdateTag: (value: unknown) => mockSafeUpdateTag(value),
}));

jest.mock('@/lib/pro-features/server/guard', () => ({
  ProFeatureAccessError: class ProFeatureAccessError extends Error {},
  requireProFeature: (featureKey: unknown, authContext: unknown) =>
    mockRequireProFeature(featureKey, authContext),
}));

jest.mock('@/lib/pro-features/server/tracking', () => ({
  trackProFeatureEvent: jest.fn(),
}));

jest.mock('@/lib/organizations/permissions', () => ({
  canUserAccessSeries: jest.fn(),
  getOrgMembership: jest.fn(),
  requireOrgPermission: jest.fn(),
}));

jest.mock('@/lib/events/shared', () => ({
  checkEventsAccess: jest.fn(() => null),
  generatePublicCode: jest.fn(() => 'EVT123'),
  revalidatePublicEventByEditionId: jest.fn(),
}));

import { createEventEdition, updateEventEdition } from '@/lib/events/editions/actions';

describe('event edition AI gating', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedInsertValues = null;
    mockAuthContext = {
      user: {
        id: 'user-1',
        email: 'user@example.com',
        name: 'Test User',
        createdAt: new Date(),
        updatedAt: new Date(),
        emailVerified: true,
        isInternal: false,
        canonicalRoles: [],
        permissions: {
          canAccessAdminArea: false,
          canAccessUserArea: true,
          canManageUsers: false,
          canManageEvents: true,
          canViewStaffTools: false,
          canViewOrganizersDashboard: true,
          canViewAthleteDashboard: false,
        },
        needsRoleAssignment: false,
        profileRequirements: { fieldKeys: [], categories: [] },
        profileMetadata: {
          countries: [],
          requiredFieldKeys: [],
          shirtSizes: [],
          bloodTypes: [],
          genderOptions: [],
          requiredCategories: [],
        },
        profileStatus: { hasProfile: false, isComplete: false, mustCompleteProfile: false },
        profile: null,
        availableExternalRoles: [],
      },
      session: null,
      isInternal: false,
      roles: [],
      canonicalRoles: [],
      permissions: {
        canAccessAdminArea: false,
        canAccessUserArea: true,
        canManageUsers: false,
        canManageEvents: true,
        canViewStaffTools: false,
        canViewOrganizersDashboard: true,
        canViewAthleteDashboard: false,
      },
      needsRoleAssignment: false,
      profileRequirements: { fieldKeys: [], categories: [] },
      profileMetadata: {
        countries: [],
        requiredFieldKeys: [],
        shirtSizes: [],
        bloodTypes: [],
        genderOptions: [],
        requiredCategories: [],
      },
      profileStatus: { hasProfile: false, isComplete: false, mustCompleteProfile: false },
      profile: null,
      availableExternalRoles: [],
    } as unknown as AuthContext;
    mockHeaders.mockResolvedValue(new Headers());
    mockIsEventAiWizardEnabled.mockReturnValue(false);
    mockRequireProFeature.mockResolvedValue(undefined);
    mockDb.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        insert: jest.fn(() => ({
          values: jest.fn((values: Record<string, unknown>) => {
            capturedInsertValues = values;
            return {
              returning: jest.fn(async () => [
                {
                  id: '11111111-1111-4111-8111-111111111111',
                  publicCode: 'EVT123',
                  editionLabel: '2026',
                  slug: 'event-2026',
                  visibility: 'draft',
                  seriesId: '22222222-2222-4222-8222-222222222222',
                  organizerBrief: null,
                },
              ]),
            };
          }),
        })),
        update: jest.fn(),
      };

      return callback(tx);
    });
  });

  it('strips organizerBrief during event creation when AI is disabled', async () => {
    mockDb.query.eventSeries.findFirst.mockResolvedValue({
      id: '22222222-2222-4222-8222-222222222222',
      organizationId: 'org-1',
    });
    mockDb.query.eventEditions.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    const result = await createEventEdition({
      seriesId: '22222222-2222-4222-8222-222222222222',
      editionLabel: '2026',
      slug: 'event-2026',
      timezone: 'America/Mexico_City',
      country: 'MX',
      organizerBrief: 'Premium trail weekend',
    });

    expect(result).toEqual({
      ok: true,
      data: {
        id: '11111111-1111-4111-8111-111111111111',
        publicCode: 'EVT123',
        editionLabel: '2026',
        slug: 'event-2026',
        visibility: 'draft',
        seriesId: '22222222-2222-4222-8222-222222222222',
      },
    });
    expect(mockRequireProFeature).not.toHaveBeenCalled();
    expect(mockDb.transaction).toHaveBeenCalled();
    expect(mockCreateAuditLog).toHaveBeenCalled();
    expect(capturedInsertValues).toEqual(
      expect.objectContaining({
        organizerBrief: null,
      }),
    );
  });

  it('returns a no-op success for organizerBrief-only updates when AI is disabled', async () => {
    mockDb.query.eventEditions.findFirst.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      publicCode: 'EVT123',
      editionLabel: '2026',
      slug: 'event-2026',
      visibility: 'draft',
      seriesId: '22222222-2222-4222-8222-222222222222',
      series: {
        id: 'series-1',
        slug: 'trail-series',
        organizationId: 'org-1',
      },
    });

    const result = await updateEventEdition({
      editionId: '11111111-1111-4111-8111-111111111111',
      organizerBrief: 'Ignore this brief',
    });

    expect(result).toEqual({
      ok: true,
      data: {
        id: '11111111-1111-4111-8111-111111111111',
        publicCode: 'EVT123',
        editionLabel: '2026',
        slug: 'event-2026',
        visibility: 'draft',
        seriesId: '22222222-2222-4222-8222-222222222222',
      },
    });
    expect(mockRequireProFeature).not.toHaveBeenCalled();
    expect(mockDb.transaction).not.toHaveBeenCalled();
  });
});
