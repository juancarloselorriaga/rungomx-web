import { assignExternalRoles } from '@/app/actions/roles';

type MockAuthContext = {
  isInternal: boolean;
  user?: { id: string };
};

const mockRequireAuth = jest.fn<Promise<MockAuthContext>, unknown[]>();
const mockUpdateRoles = jest.fn<Promise<void>, unknown[]>();
const mockResolveContext = jest.fn<
  Promise<{
    canonicalRoles: string[];
    permissions: Record<string, unknown>;
    needsRoleAssignment: boolean;
    profileStatus: { hasProfile: boolean; isComplete: boolean; mustCompleteProfile: boolean };
    profileRequirements: { categories: string[]; fieldKeys: string[] };
    profileMetadata: {
      shirtSizes: string[];
      requiredCategories: string[];
      requiredFieldKeys: string[];
    };
  }>,
  unknown[]
>();
const mockGetSession = jest.fn<Promise<null>, unknown[]>();

jest.mock('@/lib/auth/guards', () => ({
  requireAuthenticatedUser: (...args: unknown[]) => mockRequireAuth(...args),
}));

jest.mock('@/lib/auth/roles', () => ({
  getSelectableExternalRoles: () => [
    'external.organizer',
    'external.athlete',
    'external.volunteer',
  ],
  updateUserExternalRoles: (...args: unknown[]) => mockUpdateRoles(...args),
}));

jest.mock('@/lib/auth/user-context', () => ({
  resolveUserContext: (...args: unknown[]) => mockResolveContext(...args),
}));

jest.mock('next/headers', () => ({
  headers: jest.fn(async () => new Headers()),
}));

jest.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
    },
  },
}));

describe('assignExternalRoles', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns UNAUTHENTICATED when guard throws', async () => {
    mockRequireAuth.mockRejectedValueOnce({ code: 'UNAUTHENTICATED' });

    const result = await assignExternalRoles({ roles: ['external.organizer'] });

    expect(result).toEqual({ ok: false, error: 'UNAUTHENTICATED' });
  });

  it('returns FORBIDDEN for internal users', async () => {
    mockRequireAuth.mockResolvedValueOnce({ isInternal: true });

    const result = await assignExternalRoles({ roles: ['external.organizer'] });

    expect(result).toEqual({ ok: false, error: 'FORBIDDEN' });
    expect(mockUpdateRoles).not.toHaveBeenCalled();
  });

  it('returns INVALID_INPUT for empty or non-selectable roles', async () => {
    mockRequireAuth.mockResolvedValue({ isInternal: false });

    const empty = await assignExternalRoles({ roles: [] });
    expect(empty).toEqual({ ok: false, error: 'INVALID_INPUT', details: expect.anything() });

    const invalid = await assignExternalRoles({ roles: ['external.unknown'] });
    expect(invalid).toEqual({ ok: false, error: 'INVALID_INPUT', details: expect.anything() });
    expect(mockUpdateRoles).not.toHaveBeenCalled();
  });

  it('updates roles and returns refreshed context on success', async () => {
    mockRequireAuth.mockResolvedValue({
      isInternal: false,
      user: { id: 'user-123' },
    });
    mockResolveContext.mockResolvedValue({
      canonicalRoles: ['external.organizer'],
      permissions: { canAccessUserArea: true },
      needsRoleAssignment: false,
      profileStatus: { hasProfile: true, isComplete: true, mustCompleteProfile: false },
      profileRequirements: { categories: ['basicContact'], fieldKeys: ['phone', 'city'] },
      profileMetadata: {
        shirtSizes: ['s', 'm'],
        requiredCategories: ['basicContact'],
        requiredFieldKeys: ['phone', 'city'],
      },
    });
    mockGetSession.mockResolvedValue(null);

    const result = await assignExternalRoles({ roles: ['external.organizer'] });

    expect(mockUpdateRoles).toHaveBeenCalledWith('user-123', ['external.organizer']);
    expect(result.ok).toBe(true);
    expect(result).toEqual(
      expect.objectContaining({
        needsRoleAssignment: false,
        canonicalRoles: ['external.organizer'],
      }),
    );
  });
});
