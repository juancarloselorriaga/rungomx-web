import { createAdminUser, createStaffUser } from '@/app/actions/admin-users';

type MockAdminContext = {
  user: { id: string };
};

const mockRequireAdmin = jest.fn<Promise<MockAdminContext>, unknown[]>();
const mockSignUpEmail = jest.fn<
  Promise<{ user?: { id: string; email: string; name?: string } }>,
  unknown[]
>();
const mockUpdateInternalRoles = jest.fn<Promise<void>, unknown[]>();
const mockResolveUserContext = jest.fn<
  Promise<{
    canonicalRoles: string[];
    permissions: Record<string, unknown>;
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

jest.mock('@/lib/auth/guards', () => ({
  requireAdminUser: (...args: unknown[]) => mockRequireAdmin(...args),
}));

jest.mock('@/lib/auth', () => ({
  auth: {
    api: {
      signUpEmail: (...args: unknown[]) => mockSignUpEmail(...args),
    },
  },
}));

jest.mock('@/lib/auth/roles', () => ({
  updateUserInternalRoles: (...args: unknown[]) => mockUpdateInternalRoles(...args),
}));

jest.mock('@/lib/auth/user-context', () => ({
  resolveUserContext: (...args: unknown[]) => mockResolveUserContext(...args),
}));

describe('admin internal user actions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns UNAUTHENTICATED when admin guard throws for createAdminUser', async () => {
    mockRequireAdmin.mockRejectedValueOnce({ code: 'UNAUTHENTICATED' });

    const result = await createAdminUser({
      email: 'new-admin@example.com',
      name: 'New Admin',
      password: 'TempPassword123!',
    });

    expect(result).toEqual({ ok: false, error: 'UNAUTHENTICATED' });
    expect(mockSignUpEmail).not.toHaveBeenCalled();
    expect(mockUpdateInternalRoles).not.toHaveBeenCalled();
  });

  it('returns FORBIDDEN when admin guard throws for createStaffUser', async () => {
    mockRequireAdmin.mockRejectedValueOnce({ code: 'FORBIDDEN' });

    const result = await createStaffUser({
      email: 'staff@example.com',
      name: 'Staff',
      password: 'TempPassword123!',
    });

    expect(result).toEqual({ ok: false, error: 'FORBIDDEN' });
    expect(mockSignUpEmail).not.toHaveBeenCalled();
    expect(mockUpdateInternalRoles).not.toHaveBeenCalled();
  });

  it('returns INVALID_INPUT when payload is invalid', async () => {
    mockRequireAdmin.mockResolvedValue({ user: { id: 'admin-1' } });

    const result = await createAdminUser({
      email: 'not-an-email',
      name: '',
      password: 'short',
    });

    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        error: 'INVALID_INPUT',
        details: expect.anything(),
      }),
    );
    expect(mockSignUpEmail).not.toHaveBeenCalled();
    expect(mockUpdateInternalRoles).not.toHaveBeenCalled();
  });

  it('creates an admin user and attaches internal.admin role on success', async () => {
    mockRequireAdmin.mockResolvedValue({ user: { id: 'admin-1' } });
    mockSignUpEmail.mockResolvedValue({
      user: {
        id: 'user-123',
        email: 'new-admin@example.com',
        name: 'New Admin',
      },
    });
    mockResolveUserContext.mockResolvedValue({
      canonicalRoles: ['internal.admin'],
      permissions: { canAccessAdminArea: true },
      profileStatus: { hasProfile: false, isComplete: false, mustCompleteProfile: false },
      profileRequirements: { categories: [], fieldKeys: [] },
      profileMetadata: {
        shirtSizes: [],
        requiredCategories: [],
        requiredFieldKeys: [],
      },
    });

    const result = await createAdminUser({
      email: 'new-admin@example.com',
      name: 'New Admin',
      password: 'TempPassword123!',
    });

    expect(mockSignUpEmail).toHaveBeenCalledWith({
      body: {
        email: 'new-admin@example.com',
        name: 'New Admin',
        password: 'TempPassword123!',
      },
    });
    expect(mockUpdateInternalRoles).toHaveBeenCalledWith('user-123', ['internal.admin']);
    expect(result.ok).toBe(true);
    expect(result).toEqual(
      expect.objectContaining({
        userId: 'user-123',
        canonicalRoles: ['internal.admin'],
      }),
    );
  });

  it('creates a staff user and attaches internal.staff role on success', async () => {
    mockRequireAdmin.mockResolvedValue({ user: { id: 'admin-1' } });
    mockSignUpEmail.mockResolvedValue({
      user: {
        id: 'user-456',
        email: 'staff@example.com',
        name: 'Staff User',
      },
    });
    mockResolveUserContext.mockResolvedValue({
      canonicalRoles: ['internal.staff'],
      permissions: { canAccessAdminArea: true },
      profileStatus: { hasProfile: false, isComplete: false, mustCompleteProfile: false },
      profileRequirements: { categories: [], fieldKeys: [] },
      profileMetadata: {
        shirtSizes: [],
        requiredCategories: [],
        requiredFieldKeys: [],
      },
    });

    const result = await createStaffUser({
      email: 'staff@example.com',
      name: 'Staff User',
      password: 'TempPassword123!',
    });

    expect(mockSignUpEmail).toHaveBeenCalledWith({
      body: {
        email: 'staff@example.com',
        name: 'Staff User',
        password: 'TempPassword123!',
      },
    });
    expect(mockUpdateInternalRoles).toHaveBeenCalledWith('user-456', ['internal.staff']);
    expect(result.ok).toBe(true);
    expect(result).toEqual(
      expect.objectContaining({
        userId: 'user-456',
        canonicalRoles: ['internal.staff'],
      }),
    );
  });

  it('returns SERVER_ERROR if signUpEmail throws', async () => {
    mockRequireAdmin.mockResolvedValue({ user: { id: 'admin-1' } });
    mockSignUpEmail.mockRejectedValueOnce(new Error('signup failed'));

    const result = await createAdminUser({
      email: 'new-admin@example.com',
      name: 'New Admin',
      password: 'TempPassword123!',
    });

    expect(result).toEqual({ ok: false, error: 'SERVER_ERROR' });
    expect(mockUpdateInternalRoles).not.toHaveBeenCalled();
  });

  it('returns SERVER_ERROR if signUpEmail returns without user', async () => {
    mockRequireAdmin.mockResolvedValue({ user: { id: 'admin-1' } });
    mockSignUpEmail.mockResolvedValue({});

    const result = await createStaffUser({
      email: 'staff@example.com',
      name: 'Staff User',
      password: 'TempPassword123!',
    });

    expect(result).toEqual({ ok: false, error: 'SERVER_ERROR' });
    expect(mockUpdateInternalRoles).not.toHaveBeenCalled();
  });
});
