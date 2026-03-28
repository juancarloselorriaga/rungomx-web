import type { AuthContext } from '@/lib/auth/server';
import type { EventEditionDetail } from '@/lib/events/queries';

const mockHeaders = jest.fn();
const mockCreateAuditLog = jest.fn<Promise<{ ok: boolean }>, [unknown, unknown]>(
  async (...args) => {
    void args;
    return { ok: true };
  },
);
const mockGetRequestContext = jest.fn<Promise<{ ipAddress: string }>, [unknown]>(
  async (...args) => {
    void args;
    return {
      ipAddress: '127.0.0.1',
    };
  },
);
const mockSafeUpdateTag = jest.fn();
const mockSafeRefresh = jest.fn();
const mockGetEventEditionDetail = jest.fn();
const mockGetAddOnsForEdition = jest.fn();
const mockGetWebsiteContentsForEdition = jest.fn();

let mockAuthContext: AuthContext | null = null;

const mockDb = {
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

jest.mock('@/lib/next-cache', () => ({
  safeRefresh: (...args: unknown[]) => mockSafeRefresh(...args),
  safeUpdateTag: (...args: unknown[]) => mockSafeUpdateTag(...args),
}));

jest.mock('@/lib/pro-features/server/guard', () => ({
  ProFeatureAccessError: class ProFeatureAccessError extends Error {},
  requireProFeature: jest.fn(),
}));

jest.mock('@/lib/pro-features/server/tracking', () => ({
  trackProFeatureEvent: jest.fn(),
}));

jest.mock('@/lib/organizations/permissions', () => ({
  canUserAccessSeries: jest.fn(),
  getOrgMembership: jest.fn(),
  requireOrgPermission: jest.fn(),
}));

jest.mock('@/lib/events/add-ons/queries', () => ({
  getAddOnsForEdition: (...args: unknown[]) => mockGetAddOnsForEdition(...args),
}));

jest.mock('@/lib/events/editions/queries', () => ({
  getEventEditionDetailForMutation: (...args: unknown[]) => mockGetEventEditionDetail(...args),
}));

jest.mock('@/lib/events/shared', () => ({
  checkEventsAccess: jest.fn(() => null),
  generatePublicCode: jest.fn(() => 'EVT123'),
  revalidatePublicEventByEditionId: jest.fn(),
}));

jest.mock('@/lib/events/website/queries', () => ({
  getWebsiteContentsForEdition: (...args: unknown[]) => mockGetWebsiteContentsForEdition(...args),
}));

import { updateEventVisibility } from '@/lib/events/editions/actions';

function buildEvent(overrides?: Partial<EventEditionDetail>): EventEditionDetail {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    publicCode: 'EVT123',
    slug: 'event-2026',
    editionLabel: '2026',
    visibility: 'draft',
    description: 'Trail race in the city.',
    organizerBrief: null,
    startsAt: new Date('2026-03-15T13:00:00.000Z'),
    endsAt: new Date('2026-03-15T17:00:00.000Z'),
    timezone: 'America/Mexico_City',
    registrationOpensAt: null,
    registrationClosesAt: null,
    isRegistrationPaused: false,
    sharedCapacity: null,
    locationDisplay: 'Ciudad de México, México',
    address: null,
    city: 'Ciudad de México',
    state: 'Ciudad de México',
    country: 'MX',
    latitude: '19.4326',
    longitude: '-99.1332',
    externalUrl: null,
    heroImageMediaId: null,
    heroImageUrl: null,
    seriesId: '22222222-2222-4222-8222-222222222222',
    seriesName: 'Trail Series',
    seriesSlug: 'trail-series',
    sportType: 'trail_running',
    organizationId: 'org-1',
    organizationName: 'Org',
    organizationSlug: 'org',
    distances: [
      {
        id: '33333333-3333-4333-8333-333333333333',
        label: '10K',
        distanceValue: '10',
        distanceUnit: 'km',
        kind: 'distance',
        startTimeLocal: null,
        timeLimitMinutes: null,
        terrain: null,
        isVirtual: false,
        capacity: null,
        capacityScope: 'per_distance',
        sortOrder: 0,
        priceCents: 35000,
        currency: 'MXN',
        hasPricingTier: true,
        pricingTierCount: 1,
        hasBoundedPricingTier: false,
        registrationCount: 0,
      },
    ],
    faqItems: [],
    waivers: [],
    policyConfig: null,
    ...overrides,
  };
}

describe('updateEventVisibility publish readiness', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthContext = {
      user: {
        id: 'user-1',
      },
      permissions: {
        canManageEvents: true,
      },
    } as unknown as AuthContext;
    mockHeaders.mockResolvedValue(new Headers());
    mockGetAddOnsForEdition.mockResolvedValue([]);
    mockGetWebsiteContentsForEdition.mockResolvedValue([]);
    mockDb.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        update: jest.fn(() => ({
          set: jest.fn(() => ({
            where: jest.fn(async () => undefined),
          })),
        })),
      };

      return callback(tx);
    });
  });

  it('blocks publish when required basics are still missing', async () => {
    mockGetEventEditionDetail.mockResolvedValue(
      buildEvent({
        startsAt: null,
      }),
    );

    const result = await updateEventVisibility({
      editionId: '11111111-1111-4111-8111-111111111111',
      visibility: 'published',
    });

    expect(result).toEqual({
      ok: false,
      error: 'Event is not ready to publish',
      code: 'MISSING_EVENT_DATE',
    });
    expect(mockDb.transaction).not.toHaveBeenCalled();
  });

  it('blocks publish when an active add-on has no active options', async () => {
    mockGetEventEditionDetail.mockResolvedValue(buildEvent());
    mockGetAddOnsForEdition.mockResolvedValue([
      {
        isActive: true,
        options: [],
      },
    ]);

    const result = await updateEventVisibility({
      editionId: '11111111-1111-4111-8111-111111111111',
      visibility: 'published',
    });

    expect(result).toEqual({
      ok: false,
      error: 'Event is not ready to publish',
      code: 'ACTIVE_ADD_ON_WITHOUT_OPTIONS',
    });
    expect(mockDb.transaction).not.toHaveBeenCalled();
  });

  it('publishes when readiness checks pass', async () => {
    mockGetEventEditionDetail.mockResolvedValue(buildEvent());

    const result = await updateEventVisibility({
      editionId: '11111111-1111-4111-8111-111111111111',
      visibility: 'published',
    });

    expect(result).toEqual({
      ok: true,
      data: { visibility: 'published' },
    });
    expect(mockDb.transaction).toHaveBeenCalledTimes(1);
    expect(mockCreateAuditLog).toHaveBeenCalledTimes(1);
  });
});
