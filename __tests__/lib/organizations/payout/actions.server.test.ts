export {};

type MockAuthContext = {
  user: { id: string };
  permissions: {
    canManageEvents: boolean;
    canViewOrganizersDashboard: boolean;
  };
};

const mockWithAuthenticatedUser = jest.fn();
const mockFindOrganization = jest.fn();
const mockGetOrgMembership = jest.fn();

jest.mock('@/lib/auth/action-wrapper', () => ({
  withAuthenticatedUser: (options: { unauthenticated: () => unknown }) =>
    (handler: (ctx: MockAuthContext, ...args: unknown[]) => Promise<unknown>) =>
      async (...args: unknown[]) => {
        const next = mockWithAuthenticatedUser();
        if (next?.unauthenticated) return options.unauthenticated();
        return handler(
          next?.context ?? {
            user: { id: 'user-1' },
            permissions: {
              canManageEvents: false,
              canViewOrganizersDashboard: true,
            },
          },
          ...args,
        );
      },
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

jest.mock('@/lib/organizations/permissions', () => ({
  getOrgMembership: (...args: unknown[]) => mockGetOrgMembership(...args),
}));

const { updatePayoutProfile } =
  require('@/lib/organizations/payout/actions') as typeof import('@/lib/organizations/payout/actions');

describe('updatePayoutProfile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWithAuthenticatedUser.mockReturnValue(null);
    mockFindOrganization.mockResolvedValue({
      id: 'org-1',
    });
    mockGetOrgMembership.mockResolvedValue({
      role: 'owner',
    });
  });

  it('returns structured fieldErrors for RFC/CLABE validation failures', async () => {
    const result = await updatePayoutProfile({
      organizationId: 'd7a2f0dc-0168-4d90-a08e-63b4a90d14f3',
      legalName: 'Legal Name',
      rfc: 'INVALID',
      payoutDestination: {
        clabe: '123',
      },
    });

    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        error: 'INVALID_INPUT',
        message: 'PAYOUT_PROFILE_INVALID_RFC',
        fieldErrors: expect.objectContaining({
          rfc: ['PAYOUT_PROFILE_INVALID_RFC'],
          clabe: ['PAYOUT_PROFILE_INVALID_CLABE'],
        }),
      }),
    );
    expect(mockFindOrganization).not.toHaveBeenCalled();
  });

  it('returns FORBIDDEN when membership lacks owner/admin role', async () => {
    mockGetOrgMembership.mockResolvedValue({ role: 'viewer' });

    const result = await updatePayoutProfile({
      organizationId: 'd7a2f0dc-0168-4d90-a08e-63b4a90d14f3',
      legalName: 'Legal Name',
      rfc: 'ABC123456T12',
      payoutDestination: null,
    });

    expect(result).toEqual({
      ok: false,
      error: 'FORBIDDEN',
      message: 'Permission denied. Only owners and admins can update payout settings.',
    });
  });
});
