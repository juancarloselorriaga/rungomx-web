import type { AuthContext } from '@/lib/auth/server';

const mockHeaders = jest.fn();
const mockCreateAuditLog = jest.fn(async (payload: unknown, tx: unknown) => {
  void payload;
  void tx;
  return { ok: true };
});
const mockGetRequestContext = jest.fn(async (requestHeaders: unknown) => {
  void requestHeaders;
  return { ipAddress: '127.0.0.1' };
});
const mockCanUserAccessEvent = jest.fn();
const mockRequireOrgPermission = jest.fn();
const mockRevalidateTag = jest.fn();

let mockAuthContext: AuthContext | null = null;
let mockQueryState: {
  eventEdition: Record<string, unknown> | null;
  distance: Record<string, unknown> | null;
  addOn: Record<string, unknown> | null;
  option: Record<string, unknown> | null;
} = {
  eventEdition: null,
  distance: null,
  addOn: null,
  option: null,
};
let transactionState: {
  addOnInsertRow: Record<string, unknown> | null;
  addOnUpdateRows: Array<Record<string, unknown>>;
  optionUpdateRows: Array<Record<string, unknown>>;
  updateCalls: Array<{ table: unknown; values: Record<string, unknown> }>;
  insertValues: Record<string, unknown> | null;
} = {
  addOnInsertRow: null,
  addOnUpdateRows: [],
  optionUpdateRows: [],
  updateCalls: [],
  insertValues: null,
};

jest.mock('next/headers', () => ({
  headers: (...args: unknown[]) => mockHeaders(...args),
}));

jest.mock('next/cache', () => ({
  revalidateTag: (...args: unknown[]) => mockRevalidateTag(...args),
}));

jest.mock('@/lib/audit', () => ({
  createAuditLog: (payload: unknown, tx: unknown) => mockCreateAuditLog(payload, tx),
  getRequestContext: (requestHeaders: unknown) => mockGetRequestContext(requestHeaders),
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

jest.mock('@/lib/organizations/permissions', () => ({
  canUserAccessEvent: (...args: unknown[]) => mockCanUserAccessEvent(...args),
  requireOrgPermission: (...args: unknown[]) => mockRequireOrgPermission(...args),
}));

jest.mock('@/db', () => ({
  db: {
    query: {
      eventEditions: {
        findFirst: jest.fn(async () => mockQueryState.eventEdition),
      },
      eventDistances: {
        findFirst: jest.fn(async () => mockQueryState.distance),
      },
      addOns: {
        findFirst: jest.fn(async () => mockQueryState.addOn),
      },
      addOnOptions: {
        findFirst: jest.fn(async () => mockQueryState.option),
      },
    },
    transaction: jest.fn(async (callback: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        insert: jest.fn((table: unknown) => ({
          values: jest.fn((values: Record<string, unknown>) => {
            transactionState.insertValues = values;

            return {
              returning: jest.fn(async () => {
                if (table && transactionState.addOnInsertRow) {
                  return [transactionState.addOnInsertRow];
                }

                throw new Error('Unexpected insert returning call');
              }),
            };
          }),
        })),
        update: jest.fn((table: unknown) => ({
          set: jest.fn((values: Record<string, unknown>) => {
            transactionState.updateCalls.push({ table, values });

            return {
              where: jest.fn(() => ({
                returning: jest.fn(async () => {
                  if (transactionState.addOnUpdateRows.length > 0) {
                    return [transactionState.addOnUpdateRows.shift()];
                  }

                  if (transactionState.optionUpdateRows.length > 0) {
                    return [transactionState.optionUpdateRows.shift()];
                  }

                  throw new Error('Unexpected update returning call');
                }),
              })),
            };
          }),
        })),
      };

      return callback(tx);
    }),
  },
}));

import { addOnOptions, addOns } from '@/db/schema';
import {
  createAddOn,
  deleteAddOnOption,
  updateAddOn,
  updateAddOnOption,
} from '@/lib/events/add-ons/actions';

function buildAuthContext(): AuthContext {
  return {
    user: {
      id: 'user-1',
      email: 'organizer@example.com',
      name: 'Organizer',
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
      profileStatus: { hasProfile: true, isComplete: true, mustCompleteProfile: false },
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
    profileStatus: { hasProfile: true, isComplete: true, mustCompleteProfile: false },
    profile: null,
    availableExternalRoles: [],
  } as AuthContext;
}

describe('add-on actions invariant', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthContext = buildAuthContext();
    mockHeaders.mockResolvedValue(new Headers());
    mockCanUserAccessEvent.mockResolvedValue({ role: 'owner' });
    mockRequireOrgPermission.mockReturnValue(undefined);
    mockQueryState = {
      eventEdition: {
        id: '11111111-1111-4111-8111-111111111111',
        series: { organizationId: 'org-1' },
      },
      distance: null,
      addOn: null,
      option: null,
    };
    transactionState = {
      addOnInsertRow: null,
      addOnUpdateRows: [],
      optionUpdateRows: [],
      updateCalls: [],
      insertValues: null,
    };
  });

  it('creates new add-ons as inactive until they have active options', async () => {
    transactionState.addOnInsertRow = {
      id: '22222222-2222-4222-8222-222222222222',
      editionId: '11111111-1111-4111-8111-111111111111',
      distanceId: null,
      title: 'Event T-Shirt',
      description: null,
      type: 'merch',
      deliveryMethod: 'pickup',
      isActive: false,
      sortOrder: 0,
    };

    const result = await createAddOn({
      editionId: '11111111-1111-4111-8111-111111111111',
      title: 'Event T-Shirt',
      description: null,
      type: 'merch',
      deliveryMethod: 'pickup',
      distanceId: null,
      isActive: true,
      sortOrder: 0,
    });

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        data: expect.objectContaining({ isActive: false }),
      }),
    );
    expect(transactionState.insertValues).toEqual(
      expect.objectContaining({
        isActive: false,
      }),
    );
  });

  it('cannot reactivate an add-on that still has zero active options', async () => {
    mockQueryState.addOn = {
      id: '33333333-3333-4333-8333-333333333333',
      editionId: '11111111-1111-4111-8111-111111111111',
      title: 'Donation',
      description: null,
      type: 'donation',
      deliveryMethod: 'none',
      isActive: false,
      edition: { series: { organizationId: 'org-1' } },
      options: [],
    };
    transactionState.addOnUpdateRows = [
      {
        id: '33333333-3333-4333-8333-333333333333',
        editionId: '11111111-1111-4111-8111-111111111111',
        distanceId: null,
        title: 'Donation',
        description: null,
        type: 'donation',
        deliveryMethod: 'none',
        isActive: false,
        sortOrder: 0,
      },
    ];

    const result = await updateAddOn({
      addOnId: '33333333-3333-4333-8333-333333333333',
      isActive: true,
    });

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        data: expect.objectContaining({ isActive: false }),
      }),
    );
    expect(transactionState.updateCalls[0]?.table).toBe(addOns);
    expect(transactionState.updateCalls[0]?.values).toEqual(
      expect.objectContaining({
        isActive: false,
      }),
    );
  });

  it('deactivating the last active option also deactivates the parent add-on', async () => {
    mockQueryState.option = {
      id: '44444444-4444-4444-8444-444444444444',
      addOnId: '33333333-3333-4333-8333-333333333333',
      label: 'Medium',
      priceCents: 25000,
      maxQtyPerOrder: 5,
      isActive: true,
      addOn: {
        id: '33333333-3333-4333-8333-333333333333',
        editionId: '11111111-1111-4111-8111-111111111111',
        isActive: true,
        edition: { series: { organizationId: 'org-1' } },
        options: [
          {
            id: '44444444-4444-4444-8444-444444444444',
            isActive: true,
            deletedAt: null,
          },
        ],
      },
    };
    transactionState.optionUpdateRows = [
      {
        id: '44444444-4444-4444-8444-444444444444',
        addOnId: '33333333-3333-4333-8333-333333333333',
        label: 'Medium',
        priceCents: 25000,
        maxQtyPerOrder: 5,
        optionMeta: null,
        isActive: false,
        sortOrder: 0,
      },
    ];

    const result = await updateAddOnOption({
      optionId: '44444444-4444-4444-8444-444444444444',
      isActive: false,
    });

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        data: expect.objectContaining({ isActive: false }),
      }),
    );
    expect(transactionState.updateCalls.map((call) => call.table)).toEqual([
      addOnOptions,
      addOns,
    ]);
    expect(transactionState.updateCalls[1]?.values).toEqual(
      expect.objectContaining({
        isActive: false,
      }),
    );
  });

  it('deleting the last active option also deactivates the parent add-on', async () => {
    mockQueryState.option = {
      id: '55555555-5555-4555-8555-555555555555',
      addOnId: '33333333-3333-4333-8333-333333333333',
      label: 'Large',
      priceCents: 25000,
      maxQtyPerOrder: 5,
      isActive: true,
      addOn: {
        id: '33333333-3333-4333-8333-333333333333',
        editionId: '11111111-1111-4111-8111-111111111111',
        isActive: true,
        edition: { series: { organizationId: 'org-1' } },
        options: [
          {
            id: '55555555-5555-4555-8555-555555555555',
            isActive: true,
            deletedAt: null,
          },
        ],
      },
    };

    const result = await deleteAddOnOption({
      optionId: '55555555-5555-4555-8555-555555555555',
    });

    expect(result).toEqual({ ok: true, data: undefined });
    expect(transactionState.updateCalls.map((call) => call.table)).toEqual([
      addOnOptions,
      addOns,
    ]);
    expect(transactionState.updateCalls[1]?.values).toEqual(
      expect.objectContaining({
        isActive: false,
      }),
    );
  });
});
