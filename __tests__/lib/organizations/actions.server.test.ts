export {};

type MockAuthContext = {
  user: { id: string };
  permissions: {
    canManageEvents: boolean;
    canViewOrganizersDashboard: boolean;
  };
};

const defaultAuthContext: MockAuthContext = {
  user: { id: 'c19c0e13-2691-4ad8-9fba-fc2f2cdce6d1' },
  permissions: {
    canManageEvents: false,
    canViewOrganizersDashboard: true,
  },
};

const mockWithAuthenticatedUser = jest.fn();
const mockHeaders = jest.fn();
const mockGetRequestContext = jest.fn();
const mockCreateAuditLog = jest.fn();
const mockSafeRevalidateTag = jest.fn();
const mockFindOrganization = jest.fn();
const mockFindMembership = jest.fn();
const mockGetOrgMembership = jest.fn();

jest.mock('drizzle-orm', () => ({
  and: (...args: unknown[]) => args,
  eq: (...args: unknown[]) => args,
  isNull: (...args: unknown[]) => args,
}));

jest.mock('@/lib/auth/action-wrapper', () => ({
  withAuthenticatedUser: (options: { unauthenticated: () => unknown }) =>
    (handler: (ctx: MockAuthContext, ...args: unknown[]) => Promise<unknown>) =>
      async (...args: unknown[]) => {
        const next = mockWithAuthenticatedUser();
        if (next?.unauthenticated) return options.unauthenticated();
        return handler(next?.context ?? defaultAuthContext, ...args);
      },
}));

jest.mock('next/headers', () => ({
  headers: () => mockHeaders(),
}));

jest.mock('@/lib/audit', () => ({
  createAuditLog: (...args: unknown[]) => mockCreateAuditLog(...args),
  getRequestContext: (...args: unknown[]) => mockGetRequestContext(...args),
}));

jest.mock('@/lib/next-cache', () => ({
  safeRevalidateTag: (...args: unknown[]) => mockSafeRevalidateTag(...args),
}));

jest.mock('@/db/schema', () => ({
  organizations: 'organizations',
  organizationMemberships: 'organizationMemberships',
  eventSeries: 'eventSeries',
}));

const createdOrganization = {
  id: 'org-new-1',
  name: 'New Org',
  slug: 'new-org',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
};

const createdMembership = {
  id: 'membership-1',
  organizationId: 'f5d9dc95-163f-4e0b-bdd0-114af6339d4e',
  userId: '8d5d74d7-2d5c-4ca8-a5f0-520f31ef52c9',
  role: 'admin',
};

jest.mock('@/db', () => ({
  db: {
    query: {
      organizations: {
        findFirst: (...args: unknown[]) => mockFindOrganization(...args),
      },
      organizationMemberships: {
        findFirst: (...args: unknown[]) => mockFindMembership(...args),
        findMany: jest.fn(async () => []),
      },
      eventSeries: {
        findMany: jest.fn(async () => []),
      },
    },
    transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        insert: (table: string) => ({
          values: () => {
            if (table === 'organizations') {
              return {
                returning: async () => [createdOrganization],
              };
            }
            return {
              returning: async () => [createdMembership],
            };
          },
        }),
        update: () => ({
          set: () => ({
            where: () => ({
              returning: async () => [createdOrganization],
            }),
          }),
        }),
      };
      return callback(tx);
    },
  },
}));

jest.mock('@/lib/organizations/permissions', () => ({
  getOrgMembership: (...args: unknown[]) => mockGetOrgMembership(...args),
  requireOrgPermission: () => undefined,
}));

const { createOrganization, addOrgMember } =
  require('@/lib/organizations/actions') as typeof import('@/lib/organizations/actions');

describe('organizations actions cache invalidation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWithAuthenticatedUser.mockReturnValue(null);
    mockHeaders.mockResolvedValue(new Headers());
    mockGetRequestContext.mockResolvedValue({
      ipAddress: '127.0.0.1',
      userAgent: 'jest',
      requestId: 'req-1',
    });
    mockCreateAuditLog.mockResolvedValue({ ok: true });
    mockFindOrganization.mockResolvedValue(null);
    mockFindMembership.mockResolvedValue(null);
    mockGetOrgMembership.mockResolvedValue({ role: 'owner' });
  });

  it('revalidates organization tags after creating an organization', async () => {
    const result = await createOrganization({
      name: 'New Org',
      slug: 'new-org',
    });

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
      }),
    );
    expect(mockSafeRevalidateTag).toHaveBeenCalledWith('organizations:all', { expire: 0 });
    expect(mockSafeRevalidateTag).toHaveBeenCalledWith('organization:org-new-1', { expire: 0 });
    expect(mockSafeRevalidateTag).toHaveBeenCalledWith('organization-members:org-new-1', {
      expire: 0,
    });
    expect(mockSafeRevalidateTag).toHaveBeenCalledWith(
      'user-organizations:c19c0e13-2691-4ad8-9fba-fc2f2cdce6d1',
      { expire: 0 },
    );
  });

  it('revalidates member and user-org tags after adding an org member', async () => {
    const result = await addOrgMember({
      organizationId: 'f5d9dc95-163f-4e0b-bdd0-114af6339d4e',
      userId: '8d5d74d7-2d5c-4ca8-a5f0-520f31ef52c9',
      role: 'admin',
    });

    expect(result).toEqual({
      ok: true,
      data: { membershipId: 'membership-1' },
    });
    expect(mockSafeRevalidateTag).toHaveBeenCalledWith('organizations:all', { expire: 0 });
    expect(mockSafeRevalidateTag).toHaveBeenCalledWith(
      'organization:f5d9dc95-163f-4e0b-bdd0-114af6339d4e',
      { expire: 0 },
    );
    expect(mockSafeRevalidateTag).toHaveBeenCalledWith(
      'organization-members:f5d9dc95-163f-4e0b-bdd0-114af6339d4e',
      {
        expire: 0,
      },
    );
    expect(mockSafeRevalidateTag).toHaveBeenCalledWith(
      'user-organizations:c19c0e13-2691-4ad8-9fba-fc2f2cdce6d1',
      {
        expire: 0,
      },
    );
    expect(mockSafeRevalidateTag).toHaveBeenCalledWith(
      'user-organizations:8d5d74d7-2d5c-4ca8-a5f0-520f31ef52c9',
      {
        expire: 0,
      },
    );
  });

  it('deduplicates actor and member user-org invalidation when ids match', async () => {
    const result = await addOrgMember({
      organizationId: 'f5d9dc95-163f-4e0b-bdd0-114af6339d4e',
      userId: 'c19c0e13-2691-4ad8-9fba-fc2f2cdce6d1',
      role: 'admin',
    });

    expect(result).toEqual({
      ok: true,
      data: { membershipId: 'membership-1' },
    });

    const actorTagCalls = mockSafeRevalidateTag.mock.calls.filter(
      ([tag]) => tag === 'user-organizations:c19c0e13-2691-4ad8-9fba-fc2f2cdce6d1',
    );
    expect(actorTagCalls).toHaveLength(1);
  });
});
