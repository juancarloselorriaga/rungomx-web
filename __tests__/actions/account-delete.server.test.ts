import { deleteOwnAccount } from '@/app/actions/account-delete';
import type { DeletedUserInfo } from '@/lib/users/delete-user';

type MockAuthContext = {
  user: { id: string; name?: string };
};

const mockRequireAuthenticated = jest.fn<Promise<MockAuthContext>, unknown[]>();
const mockVerifyUserCredentialPassword = jest.fn<
  Promise<{ ok: true } | { ok: false; error: 'NO_PASSWORD' | 'INVALID_PASSWORD' }>,
  unknown[]
>();
const mockDeleteUser = jest.fn<
  Promise<
    { ok: true; deletedUser: DeletedUserInfo } | { ok: false; error: 'NOT_FOUND' | 'SERVER_ERROR' }
  >,
  unknown[]
>();
const mockSignOut = jest.fn<Promise<{ success: boolean }>, unknown[]>();
const mockSendNotifications = jest.fn<Promise<void>, unknown[]>();
const mockGetUserPreferredLocale = jest.fn<string, unknown[]>();

jest.mock('next/headers', () => ({
  headers: async () => new Headers(),
}));

jest.mock('@/lib/auth/guards', () => ({
  requireAuthenticatedUser: (...args: unknown[]) => mockRequireAuthenticated(...args),
}));

jest.mock('@/lib/auth/credential-password', () => ({
  verifyUserCredentialPassword: (...args: unknown[]) => mockVerifyUserCredentialPassword(...args),
}));

jest.mock('@/lib/users/delete-user', () => ({
  deleteUser: (...args: unknown[]) => mockDeleteUser(...args),
}));

jest.mock('@/lib/users/email', () => ({
  sendUserDeletionNotifications: (...args: unknown[]) => mockSendNotifications(...args),
}));

jest.mock('@/lib/utils/locale', () => ({
  getUserPreferredLocale: (...args: unknown[]) => mockGetUserPreferredLocale(...args),
}));

jest.mock('@/lib/auth', () => ({
  auth: {
    api: {
      signOut: (...args: unknown[]) => mockSignOut(...args),
    },
  },
}));

describe('deleteOwnAccount', () => {
  const defaultDeletedUser: DeletedUserInfo = {
    email: 'test@example.com',
    name: 'Test User',
    locale: 'en',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireAuthenticated.mockReset();
    mockVerifyUserCredentialPassword.mockReset();
    mockDeleteUser.mockReset();
    mockSignOut.mockReset();
    mockSendNotifications.mockReset();
    mockGetUserPreferredLocale.mockReset();
    mockGetUserPreferredLocale.mockReturnValue('en');
    mockSendNotifications.mockResolvedValue(undefined);
  });

  it('returns UNAUTHENTICATED when no session exists', async () => {
    mockRequireAuthenticated.mockRejectedValueOnce({ code: 'UNAUTHENTICATED' });

    const result = await deleteOwnAccount({ password: 'pw' });

    expect(result).toEqual({ ok: false, error: 'UNAUTHENTICATED' });
    expect(mockVerifyUserCredentialPassword).not.toHaveBeenCalled();
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it('returns INVALID_PASSWORD when password verification fails', async () => {
    mockRequireAuthenticated.mockResolvedValueOnce({ user: { id: 'user-1' } });
    mockVerifyUserCredentialPassword.mockResolvedValueOnce({ ok: false, error: 'INVALID_PASSWORD' });

    const result = await deleteOwnAccount({ password: 'wrong' });

    expect(result).toEqual({ ok: false, error: 'INVALID_PASSWORD' });
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it('returns NO_PASSWORD when user has no credential password', async () => {
    mockRequireAuthenticated.mockResolvedValueOnce({ user: { id: 'user-1' } });
    mockVerifyUserCredentialPassword.mockResolvedValueOnce({ ok: false, error: 'NO_PASSWORD' });

    const result = await deleteOwnAccount({ password: 'pw' });

    expect(result).toEqual({ ok: false, error: 'NO_PASSWORD' });
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it('deletes the user and signs out on success', async () => {
    mockRequireAuthenticated.mockResolvedValueOnce({ user: { id: 'user-1', name: 'Test User' } });
    mockVerifyUserCredentialPassword.mockResolvedValueOnce({ ok: true });
    mockDeleteUser.mockResolvedValueOnce({ ok: true, deletedUser: defaultDeletedUser });
    mockSignOut.mockResolvedValueOnce({ success: true });

    const result = await deleteOwnAccount({ password: 'pw' });

    expect(result).toEqual({ ok: true });
    expect(mockSignOut).toHaveBeenCalled();
  });

  it('sends deletion notifications on success', async () => {
    mockRequireAuthenticated.mockResolvedValueOnce({ user: { id: 'user-1', name: 'Test User' } });
    mockVerifyUserCredentialPassword.mockResolvedValueOnce({ ok: true });
    mockDeleteUser.mockResolvedValueOnce({ ok: true, deletedUser: defaultDeletedUser });
    mockSignOut.mockResolvedValueOnce({ success: true });

    await deleteOwnAccount({ password: 'pw' });

    expect(mockSendNotifications).toHaveBeenCalledWith(
      expect.objectContaining({
        deletedUser: defaultDeletedUser,
        isSelfDeletion: true,
      }),
    );
  });

  it('succeeds even if notifications fail', async () => {
    mockRequireAuthenticated.mockResolvedValueOnce({ user: { id: 'user-1', name: 'Test User' } });
    mockVerifyUserCredentialPassword.mockResolvedValueOnce({ ok: true });
    mockDeleteUser.mockResolvedValueOnce({ ok: true, deletedUser: defaultDeletedUser });
    mockSignOut.mockResolvedValueOnce({ success: true });
    mockSendNotifications.mockRejectedValueOnce(new Error('SMTP down'));

    const result = await deleteOwnAccount({ password: 'pw' });

    expect(result).toEqual({ ok: true });
  });

  it('treats NOT_FOUND as success (idempotent) and signs out', async () => {
    mockRequireAuthenticated.mockResolvedValueOnce({ user: { id: 'user-1' } });
    mockVerifyUserCredentialPassword.mockResolvedValueOnce({ ok: true });
    mockDeleteUser.mockResolvedValueOnce({ ok: false, error: 'NOT_FOUND' });
    mockSignOut.mockResolvedValueOnce({ success: true });

    const result = await deleteOwnAccount({ password: 'pw' });

    expect(result).toEqual({ ok: true });
    expect(mockSignOut).toHaveBeenCalled();
  });

  describe('Edge Cases', () => {
    it('returns SERVER_ERROR for empty password string', async () => {
      mockRequireAuthenticated.mockResolvedValueOnce({ user: { id: 'user-1' } });

      const result = await deleteOwnAccount({ password: '' });

      expect(result).toEqual({ ok: false, error: 'SERVER_ERROR' });
      expect(mockVerifyUserCredentialPassword).not.toHaveBeenCalled();
      expect(mockDeleteUser).not.toHaveBeenCalled();
    });

    it('returns SERVER_ERROR for missing password field', async () => {
      mockRequireAuthenticated.mockResolvedValueOnce({ user: { id: 'user-1' } });

      const result = await deleteOwnAccount({});

      expect(result).toEqual({ ok: false, error: 'SERVER_ERROR' });
      expect(mockVerifyUserCredentialPassword).not.toHaveBeenCalled();
    });

    it('returns SERVER_ERROR when deleteUser returns SERVER_ERROR', async () => {
      mockRequireAuthenticated.mockResolvedValueOnce({ user: { id: 'user-1' } });
      mockVerifyUserCredentialPassword.mockResolvedValueOnce({ ok: true });
      mockSignOut.mockResolvedValueOnce({ success: true });
      mockDeleteUser.mockResolvedValueOnce({ ok: false, error: 'SERVER_ERROR' });

      const result = await deleteOwnAccount({ password: 'pw' });

      expect(result).toEqual({ ok: false, error: 'SERVER_ERROR' });
      // Sign out is called BEFORE deletion attempt (to clear cookies while session is valid)
      expect(mockSignOut).toHaveBeenCalled();
    });

    it('succeeds even if signOut throws (graceful degradation)', async () => {
      mockRequireAuthenticated.mockResolvedValueOnce({ user: { id: 'user-1', name: 'Test User' } });
      mockVerifyUserCredentialPassword.mockResolvedValueOnce({ ok: true });
      mockDeleteUser.mockResolvedValueOnce({ ok: true, deletedUser: defaultDeletedUser });
      mockSignOut.mockRejectedValueOnce(new Error('Sign out failed'));

      const result = await deleteOwnAccount({ password: 'pw' });

      expect(result).toEqual({ ok: true });
    });

    it('verifies password using the authenticated user id', async () => {
      const userId = 'specific-user-id';
      mockRequireAuthenticated.mockResolvedValueOnce({ user: { id: userId, name: 'Test User' } });
      mockVerifyUserCredentialPassword.mockResolvedValueOnce({ ok: true });
      mockDeleteUser.mockResolvedValueOnce({ ok: true, deletedUser: defaultDeletedUser });
      mockSignOut.mockResolvedValueOnce({ success: true });

      await deleteOwnAccount({ password: 'pw' });

      expect(mockVerifyUserCredentialPassword).toHaveBeenCalledWith(userId, 'pw');
    });

    it('does not send notifications when deletion returns NOT_FOUND', async () => {
      mockRequireAuthenticated.mockResolvedValueOnce({ user: { id: 'user-1', name: 'Test User' } });
      mockVerifyUserCredentialPassword.mockResolvedValueOnce({ ok: true });
      mockDeleteUser.mockResolvedValueOnce({ ok: false, error: 'NOT_FOUND' });
      mockSignOut.mockResolvedValueOnce({ success: true });

      await deleteOwnAccount({ password: 'pw' });

      expect(mockSendNotifications).not.toHaveBeenCalled();
    });
  });
});
