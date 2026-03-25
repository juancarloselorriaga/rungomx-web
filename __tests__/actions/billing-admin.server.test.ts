export {};

type MockAuthContext = {
  user: { id: string };
  permissions: { canManageUsers: boolean };
};

const defaultAuthContext: MockAuthContext = {
  user: { id: 'staff-user-1' },
  permissions: { canManageUsers: true },
};

const mockWithStaffUser = jest.fn();
const mockUsersFindFirst = jest.fn();
const mockBillingEventsFindMany = jest.fn();
const mockBillingPendingGrantsFindMany = jest.fn();
const mockBillingPromotionsFindMany = jest.fn();
const mockDbSelect = jest.fn();
const mockGetUserRolesWithInternalFlag = jest.fn();
const mockGetInternalRoleSourceNames = jest.fn();
const mockCreatePendingEntitlementGrant = jest.fn();
const mockCreatePromotion = jest.fn();
const mockDisablePendingEntitlementGrant = jest.fn();
const mockDisablePromotion = jest.fn();
const mockEnablePendingEntitlementGrant = jest.fn();
const mockEnablePromotion = jest.fn();
const mockExtendAdminOverride = jest.fn();
const mockGrantAdminOverride = jest.fn();
const mockRevokeAdminOverride = jest.fn();
const mockHashEmailAllVersions = jest.fn();
const mockGetBillingStatusForUser = jest.fn();
const mockSerializeBillingStatus = jest.fn();

let mockSelectWhereResult: unknown = [];

jest.mock('@/lib/auth/action-wrapper', () => ({
  withStaffUser:
    (options: { unauthenticated: () => unknown; forbidden: () => unknown }) =>
    (handler: (ctx: MockAuthContext, ...args: unknown[]) => Promise<unknown>) =>
    async (...args: unknown[]) => {
      const authResult = mockWithStaffUser();
      if (authResult?.unauthenticated) return options.unauthenticated();
      if (authResult?.forbidden) return options.forbidden();
      return handler(authResult?.context ?? defaultAuthContext, ...args);
    },
}));

jest.mock('@/db', () => ({
  db: {
    query: {
      users: {
        findFirst: (...args: unknown[]) => mockUsersFindFirst(...args),
      },
      billingEvents: {
        findMany: (...args: unknown[]) => mockBillingEventsFindMany(...args),
      },
      billingPendingEntitlementGrants: {
        findMany: (...args: unknown[]) => mockBillingPendingGrantsFindMany(...args),
      },
      billingPromotions: {
        findMany: (...args: unknown[]) => mockBillingPromotionsFindMany(...args),
      },
    },
    select: (...args: unknown[]) => mockDbSelect(...args),
  },
}));

jest.mock('@/lib/auth/roles', () => ({
  getUserRolesWithInternalFlag: (...args: unknown[]) => mockGetUserRolesWithInternalFlag(...args),
  getInternalRoleSourceNames: (...args: unknown[]) => mockGetInternalRoleSourceNames(...args),
}));

jest.mock('@/lib/billing/commands', () => ({
  createPendingEntitlementGrant: (...args: unknown[]) => mockCreatePendingEntitlementGrant(...args),
  createPromotion: (...args: unknown[]) => mockCreatePromotion(...args),
  disablePendingEntitlementGrant: (...args: unknown[]) => mockDisablePendingEntitlementGrant(...args),
  disablePromotion: (...args: unknown[]) => mockDisablePromotion(...args),
  enablePendingEntitlementGrant: (...args: unknown[]) => mockEnablePendingEntitlementGrant(...args),
  enablePromotion: (...args: unknown[]) => mockEnablePromotion(...args),
  extendAdminOverride: (...args: unknown[]) => mockExtendAdminOverride(...args),
  grantAdminOverride: (...args: unknown[]) => mockGrantAdminOverride(...args),
  revokeAdminOverride: (...args: unknown[]) => mockRevokeAdminOverride(...args),
}));

jest.mock('@/lib/billing/hash', () => ({
  hashEmailAllVersions: (...args: unknown[]) => mockHashEmailAllVersions(...args),
}));

jest.mock('@/lib/billing/queries', () => ({
  getBillingStatusForUser: (...args: unknown[]) => mockGetBillingStatusForUser(...args),
}));

jest.mock('@/lib/billing/serialization', () => ({
  serializeBillingStatus: (...args: unknown[]) => mockSerializeBillingStatus(...args),
}));

const billingAdmin = require('@/app/actions/billing-admin') as typeof import('@/app/actions/billing-admin');

function setOrderedSelectRows<T>(rows: T[]) {
  const limit = jest.fn().mockResolvedValue(rows);
  const orderBy = jest.fn(() => ({ limit }));
  mockSelectWhereResult = { orderBy };
  return { orderBy, limit };
}

describe('billing admin actions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWithStaffUser.mockReturnValue(null);
    mockSelectWhereResult = [];
    mockDbSelect.mockImplementation(() => ({
      from: jest.fn(() => ({
        where: jest.fn(() => mockSelectWhereResult),
      })),
    }));
    mockGetInternalRoleSourceNames.mockReturnValue(['internal.admin']);
    mockHashEmailAllVersions.mockReturnValue([{ hash: 'hash-v1' }]);
    mockSerializeBillingStatus.mockImplementation((status) => status);
  });

  it('exports the expected public billing-admin action boundary', () => {
    const expectedExports = [
      'lookupBillingUserAction',
      'createPromotionAction',
      'disablePromotionAction',
      'enablePromotionAction',
      'listPromotions',
      'searchPromotionOptionsAction',
      'searchUserEmailOptionsAction',
      'createPendingGrantAction',
      'disablePendingGrantAction',
      'enablePendingGrantAction',
      'searchPendingGrantOptionsAction',
      'grantOverrideAction',
      'extendOverrideAction',
      'revokeOverrideAction',
    ] as const;

    expectedExports.forEach((exportName) => {
      expect(billingAdmin[exportName]).toEqual(expect.any(Function));
    });
  });

  it('returns UNAUTHENTICATED for lookup when the staff wrapper blocks access', async () => {
    mockWithStaffUser.mockReturnValue({ unauthenticated: true });

    const result = await billingAdmin.lookupBillingUserAction({ email: 'user@example.com' });

    expect(result).toEqual({
      ok: false,
      error: 'UNAUTHENTICATED',
      message: 'UNAUTHENTICATED',
    });
    expect(mockUsersFindFirst).not.toHaveBeenCalled();
  });

  it('returns FORBIDDEN with the listPromotions boundary shape when the staff wrapper blocks access', async () => {
    mockWithStaffUser.mockReturnValue({ forbidden: true });

    const result = await billingAdmin.listPromotions();

    expect(result).toEqual({
      ok: false,
      error: 'FORBIDDEN',
    });
  });

  it('keeps duration-or-fixed-end validation parity for promotions', async () => {
    const result = await billingAdmin.createPromotionAction({
      name: 'Promo',
      description: 'Promo description',
      grantDurationDays: null,
      grantFixedEndsAt: null,
      validFrom: null,
      validTo: null,
      maxRedemptions: 10,
      isActive: true,
    });

    expect(result).toEqual({
      ok: false,
      error: 'INVALID_INPUT',
      message: 'Validation failed',
      fieldErrors: {
        grantDurationDays: ['Grant duration or fixed end is required'],
        grantFixedEndsAt: ['Grant duration or fixed end is required'],
      },
    });
    expect(mockCreatePromotion).not.toHaveBeenCalled();
  });

  it('parses local datetimes without timezone as UTC for promotions and preserves success shape', async () => {
    mockCreatePromotion.mockResolvedValue({
      ok: true,
      data: { code: 'PROMO-123' },
    });

    const result = await billingAdmin.createPromotionAction({
      name: 'Promo',
      description: 'Promo description',
      grantDurationDays: null,
      grantFixedEndsAt: '2026-03-01T12:30:00',
      validFrom: '2026-03-02T10:15:00',
      validTo: null,
      maxRedemptions: 50,
      isActive: true,
    });

    expect(result).toEqual({ ok: true, data: { code: 'PROMO-123' } });
    expect(mockCreatePromotion).toHaveBeenCalledWith(
      expect.objectContaining({
        createdByUserId: 'staff-user-1',
        grantDurationDays: null,
        maxRedemptions: 50,
        isActive: true,
      }),
    );

    const callInput = mockCreatePromotion.mock.calls[0][0];
    expect(callInput.grantFixedEndsAt.toISOString()).toBe('2026-03-01T12:30:00.000Z');
    expect(callInput.validFrom.toISOString()).toBe('2026-03-02T10:15:00.000Z');
    expect(callInput.validTo).toBeNull();
  });

  it('preserves promotions domain result conversion on failure', async () => {
    mockCreatePromotion.mockResolvedValue({
      ok: false,
      code: 'PROMOTION_CONFLICT',
      error: 'PROMOTION_CONFLICT',
    });

    const result = await billingAdmin.createPromotionAction({
      name: 'Promo',
      description: null,
      grantDurationDays: 7,
      grantFixedEndsAt: null,
      validFrom: null,
      validTo: null,
      maxRedemptions: null,
      isActive: true,
    });

    expect(result).toEqual({
      ok: false,
      error: 'PROMOTION_CONFLICT',
      message: 'PROMOTION_CONFLICT',
    });
  });

  it('parses UTC and null datetimes for pending grants and preserves success shape', async () => {
    mockCreatePendingEntitlementGrant.mockResolvedValue({
      ok: true,
      data: { pendingGrantId: 'grant-1' },
    });

    const result = await billingAdmin.createPendingGrantAction({
      email: 'user@example.com',
      grantDurationDays: null,
      grantFixedEndsAt: '2026-03-03T12:30:00Z',
      claimValidFrom: null,
      claimValidTo: '2026-03-04T08:15:00Z',
      isActive: false,
    });

    expect(result).toEqual({ ok: true, data: { pendingGrantId: 'grant-1' } });

    const callInput = mockCreatePendingEntitlementGrant.mock.calls[0][0];
    expect(callInput.email).toBe('user@example.com');
    expect(callInput.grantFixedEndsAt.toISOString()).toBe('2026-03-03T12:30:00.000Z');
    expect(callInput.claimValidFrom).toBeNull();
    expect(callInput.claimValidTo.toISOString()).toBe('2026-03-04T08:15:00.000Z');
    expect(callInput.isActive).toBe(false);
  });

  it('preserves pending grant domain result conversion on failure', async () => {
    mockCreatePendingEntitlementGrant.mockResolvedValue({
      ok: false,
      code: 'PENDING_GRANT_CONFLICT',
      error: 'PENDING_GRANT_CONFLICT',
    });

    const result = await billingAdmin.createPendingGrantAction({
      email: 'user@example.com',
      grantDurationDays: 14,
      grantFixedEndsAt: null,
      claimValidFrom: null,
      claimValidTo: null,
      isActive: true,
    });

    expect(result).toEqual({
      ok: false,
      error: 'PENDING_GRANT_CONFLICT',
      message: 'PENDING_GRANT_CONFLICT',
    });
  });

  it('preserves the current invalid-input boundary for offset override datetimes', async () => {
    const result = await billingAdmin.grantOverrideAction({
      userId: '7280d916-94e3-49df-9e0d-f72b7828fe91',
      reason: 'Manual grant',
      grantDurationDays: null,
      grantFixedEndsAt: '2026-03-05T12:00:00+02:00',
    });

    expect(result).toEqual({
      ok: false,
      error: 'INVALID_INPUT',
      message: 'Validation failed',
      fieldErrors: {
        grantFixedEndsAt: ['Invalid ISO datetime'],
      },
    });
    expect(mockGrantAdminOverride).not.toHaveBeenCalled();
  });

  it('preserves overrides domain result conversion on failure', async () => {
    mockGrantAdminOverride.mockResolvedValue({
      ok: false,
      code: 'OVERRIDE_CONFLICT',
      error: 'OVERRIDE_CONFLICT',
    });

    const result = await billingAdmin.grantOverrideAction({
      userId: '7280d916-94e3-49df-9e0d-f72b7828fe91',
      reason: 'Manual grant',
      grantDurationDays: 3,
      grantFixedEndsAt: null,
    });

    expect(result).toEqual({
      ok: false,
      error: 'OVERRIDE_CONFLICT',
      message: 'OVERRIDE_CONFLICT',
    });
  });

  it('returns NOT_FOUND for internal lookup targets when staff cannot manage users', async () => {
    mockWithStaffUser.mockReturnValue({
      context: {
        user: { id: 'staff-user-2' },
        permissions: { canManageUsers: false },
      },
    });
    mockUsersFindFirst.mockResolvedValue({
      id: 'user-1',
      name: 'Internal User',
      email: 'internal@example.com',
      emailVerified: true,
      createdAt: new Date('2026-03-05T12:00:00.000Z'),
    });
    mockGetUserRolesWithInternalFlag.mockResolvedValue({ isInternal: true });

    const result = await billingAdmin.lookupBillingUserAction({ email: 'internal@example.com' });

    expect(result).toEqual({
      ok: false,
      error: 'NOT_FOUND',
      message: 'NOT_FOUND',
    });
    expect(mockGetBillingStatusForUser).not.toHaveBeenCalled();
    expect(mockBillingEventsFindMany).not.toHaveBeenCalled();
  });

  it('hides billing event actors when staff cannot manage users', async () => {
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_777_777_777_000);
    mockWithStaffUser.mockReturnValue({
      context: {
        user: { id: 'staff-user-2' },
        permissions: { canManageUsers: false },
      },
    });
    mockUsersFindFirst.mockResolvedValue({
      id: 'user-1',
      name: 'Athlete User',
      email: 'athlete@example.com',
      emailVerified: true,
      createdAt: new Date('2026-03-05T12:00:00.000Z'),
    });
    mockGetUserRolesWithInternalFlag.mockResolvedValue({ isInternal: false });
    mockGetBillingStatusForUser.mockResolvedValue({ raw: 'status' });
    mockSerializeBillingStatus.mockReturnValue({ tier: 'pro', sources: [] });
    mockBillingEventsFindMany.mockResolvedValue([
      {
        id: 'event-1',
        type: 'entitlement_granted',
        source: 'admin_override',
        provider: null,
        externalEventId: null,
        entityType: 'billing_entitlement_override',
        entityId: 'override-1',
        payloadJson: { grantedByUserId: 'actor-1' },
        createdAt: new Date('2026-03-06T09:00:00.000Z'),
      },
    ]);

    const result = await billingAdmin.lookupBillingUserAction({ email: 'athlete@example.com' });

    expect(result).toEqual({
      ok: true,
      data: {
        serverTimeMs: 1_777_777_777_000,
        user: {
          id: 'user-1',
          name: 'Athlete User',
          email: 'athlete@example.com',
          emailVerified: true,
          createdAt: '2026-03-05T12:00:00.000Z',
          isInternal: false,
        },
        status: { tier: 'pro', sources: [] },
        events: [
          {
            actor: null,
            id: 'event-1',
            type: 'entitlement_granted',
            source: 'admin_override',
            provider: null,
            externalEventId: null,
            entityType: 'billing_entitlement_override',
            entityId: 'override-1',
            payload: { grantedByUserId: 'actor-1' },
            createdAt: '2026-03-06T09:00:00.000Z',
          },
        ],
      },
    });
    expect(mockDbSelect).not.toHaveBeenCalled();
    nowSpy.mockRestore();
  });

  it('includes billing event actors when staff can manage users', async () => {
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_888_888_888_000);
    mockUsersFindFirst.mockResolvedValue({
      id: 'user-1',
      name: 'Athlete User',
      email: 'athlete@example.com',
      emailVerified: false,
      createdAt: new Date('2026-03-05T12:00:00.000Z'),
    });
    mockGetUserRolesWithInternalFlag.mockResolvedValue({ isInternal: false });
    mockGetBillingStatusForUser.mockResolvedValue({ raw: 'status' });
    mockSerializeBillingStatus.mockReturnValue({ tier: 'free', sources: [] });
    mockBillingEventsFindMany.mockResolvedValue([
      {
        id: 'event-1',
        type: 'entitlement_revoked',
        source: 'admin_override',
        provider: null,
        externalEventId: null,
        entityType: 'billing_entitlement_override',
        entityId: 'override-2',
        payloadJson: { revokedByUserId: 'actor-1' },
        createdAt: new Date('2026-03-07T10:00:00.000Z'),
      },
    ]);
    mockSelectWhereResult = [
      {
        id: 'actor-1',
        name: 'Admin User',
        email: 'admin@example.com',
      },
    ];

    const result = await billingAdmin.lookupBillingUserAction({ email: 'athlete@example.com' });

    expect(result).toEqual({
      ok: true,
      data: {
        serverTimeMs: 1_888_888_888_000,
        user: {
          id: 'user-1',
          name: 'Athlete User',
          email: 'athlete@example.com',
          emailVerified: false,
          createdAt: '2026-03-05T12:00:00.000Z',
          isInternal: false,
        },
        status: { tier: 'free', sources: [] },
        events: [
          {
            actor: {
              id: 'actor-1',
              name: 'Admin User',
              email: 'admin@example.com',
            },
            id: 'event-1',
            type: 'entitlement_revoked',
            source: 'admin_override',
            provider: null,
            externalEventId: null,
            entityType: 'billing_entitlement_override',
            entityId: 'override-2',
            payload: { revokedByUserId: 'actor-1' },
            createdAt: '2026-03-07T10:00:00.000Z',
          },
        ],
      },
    });
    expect(mockDbSelect).toHaveBeenCalledTimes(1);
    nowSpy.mockRestore();
  });

  it('returns serialized user-email search options with the current public shape', async () => {
    setOrderedSelectRows([
      {
        id: 'user-1',
        email: 'person@example.com',
        name: 'Person Example',
        createdAt: new Date('2026-03-08T08:45:00.000Z'),
      },
    ]);

    const result = await billingAdmin.searchUserEmailOptionsAction({
      query: 'person@example.com',
      limit: 5,
    });

    expect(result).toEqual({
      ok: true,
      data: {
        options: [
          {
            id: 'user-1',
            email: 'person@example.com',
            name: 'Person Example',
            createdAt: '2026-03-08T08:45:00.000Z',
          },
        ],
      },
    });
  });
});
