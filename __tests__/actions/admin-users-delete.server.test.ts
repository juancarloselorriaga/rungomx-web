import { deleteInternalUser } from '@/app/actions/admin-users-delete';

type MockAdminContext = {
  user: { id: string };
};

const mockRequireAdmin = jest.fn<Promise<MockAdminContext>, unknown[]>();
const mockVerifyUserCredentialPassword = jest.fn<
  Promise<{ ok: true } | { ok: false; error: 'NO_PASSWORD' | 'INVALID_PASSWORD' }>,
  unknown[]
>();
const mockDeleteUser = jest.fn<
  Promise<{ ok: true } | { ok: false; error: 'NOT_FOUND' | 'SERVER_ERROR' }>,
  unknown[]
>();

jest.mock('@/lib/auth/guards', () => ({
  requireAdminUser: (...args: unknown[]) => mockRequireAdmin(...args),
}));

jest.mock('@/lib/auth/credential-password', () => ({
  verifyUserCredentialPassword: (...args: unknown[]) => mockVerifyUserCredentialPassword(...args),
}));

jest.mock('@/lib/users/delete-user', () => ({
  deleteUser: (...args: unknown[]) => mockDeleteUser(...args),
}));

describe('deleteInternalUser', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireAdmin.mockReset();
    mockVerifyUserCredentialPassword.mockReset();
    mockDeleteUser.mockReset();
  });

  it('returns UNAUTHENTICATED when the admin guard rejects', async () => {
    mockRequireAdmin.mockRejectedValueOnce({ code: 'UNAUTHENTICATED' });

    const result = await deleteInternalUser({
      userId: '00000000-0000-0000-0000-000000000001',
      adminPassword: 'pw',
    });

    expect(result).toEqual({ ok: false, error: 'UNAUTHENTICATED' });
    expect(mockVerifyUserCredentialPassword).not.toHaveBeenCalled();
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it('returns FORBIDDEN when the admin guard blocks access', async () => {
    mockRequireAdmin.mockRejectedValueOnce({ code: 'FORBIDDEN' });

    const result = await deleteInternalUser({
      userId: '00000000-0000-0000-0000-000000000001',
      adminPassword: 'pw',
    });

    expect(result).toEqual({ ok: false, error: 'FORBIDDEN' });
    expect(mockVerifyUserCredentialPassword).not.toHaveBeenCalled();
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it('prevents deleting the current user', async () => {
    mockRequireAdmin.mockResolvedValue({ user: { id: '00000000-0000-0000-0000-000000000001' } });

    const result = await deleteInternalUser({
      userId: '00000000-0000-0000-0000-000000000001',
      adminPassword: 'pw',
    });

    expect(result).toEqual({ ok: false, error: 'CANNOT_DELETE_SELF' });
    expect(mockVerifyUserCredentialPassword).not.toHaveBeenCalled();
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it('returns INVALID_PASSWORD when admin password fails verification', async () => {
    mockRequireAdmin.mockResolvedValue({ user: { id: 'admin-1' } });
    mockVerifyUserCredentialPassword.mockResolvedValueOnce({ ok: false, error: 'INVALID_PASSWORD' });

    const result = await deleteInternalUser({ userId: 'user-1', adminPassword: 'wrong' });

    expect(result).toEqual({ ok: false, error: 'INVALID_PASSWORD' });
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it('returns NO_PASSWORD when the admin does not have a credential password', async () => {
    mockRequireAdmin.mockResolvedValue({ user: { id: 'admin-1' } });
    mockVerifyUserCredentialPassword.mockResolvedValueOnce({ ok: false, error: 'NO_PASSWORD' });

    const result = await deleteInternalUser({ userId: 'user-1', adminPassword: 'pw' });

    expect(result).toEqual({ ok: false, error: 'NO_PASSWORD' });
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it('returns NOT_FOUND when the target user does not exist', async () => {
    mockRequireAdmin.mockResolvedValue({ user: { id: 'admin-1' } });
    mockVerifyUserCredentialPassword.mockResolvedValueOnce({ ok: true });
    mockDeleteUser.mockResolvedValueOnce({ ok: false, error: 'NOT_FOUND' });

    const result = await deleteInternalUser({ userId: 'user-404', adminPassword: 'pw' });

    expect(result).toEqual({ ok: false, error: 'NOT_FOUND' });
  });

  it('returns ok when deletion succeeds', async () => {
    mockRequireAdmin.mockResolvedValue({ user: { id: 'admin-1' } });
    mockVerifyUserCredentialPassword.mockResolvedValueOnce({ ok: true });
    mockDeleteUser.mockResolvedValueOnce({ ok: true });

    const result = await deleteInternalUser({ userId: 'user-2', adminPassword: 'pw' });

    expect(result).toEqual({ ok: true });
  });

  it('returns SERVER_ERROR when the delete flow throws', async () => {
    mockRequireAdmin.mockResolvedValue({ user: { id: 'admin-1' } });
    mockVerifyUserCredentialPassword.mockResolvedValueOnce({ ok: true });
    mockDeleteUser.mockRejectedValueOnce(new Error('db failure'));

    const result = await deleteInternalUser({ userId: 'user-3', adminPassword: 'pw' });

    expect(result).toEqual({ ok: false, error: 'SERVER_ERROR' });
  });

  describe('Edge Cases', () => {
    it('returns SERVER_ERROR for empty userId', async () => {
      mockRequireAdmin.mockResolvedValue({ user: { id: 'admin-1' } });

      const result = await deleteInternalUser({ userId: '', adminPassword: 'pw' });

      expect(result).toEqual({ ok: false, error: 'SERVER_ERROR' });
      expect(mockVerifyUserCredentialPassword).not.toHaveBeenCalled();
      expect(mockDeleteUser).not.toHaveBeenCalled();
    });

    it('returns SERVER_ERROR for empty adminPassword', async () => {
      mockRequireAdmin.mockResolvedValue({ user: { id: 'admin-1' } });

      const result = await deleteInternalUser({ userId: 'user-1', adminPassword: '' });

      expect(result).toEqual({ ok: false, error: 'SERVER_ERROR' });
      expect(mockVerifyUserCredentialPassword).not.toHaveBeenCalled();
      expect(mockDeleteUser).not.toHaveBeenCalled();
    });

    it('verifies admin password (not target user password)', async () => {
      const adminId = 'admin-user-id';
      const targetId = 'target-user-id';
      mockRequireAdmin.mockResolvedValue({ user: { id: adminId } });
      mockVerifyUserCredentialPassword.mockResolvedValueOnce({ ok: true });
      mockDeleteUser.mockResolvedValueOnce({ ok: true });

      await deleteInternalUser({ userId: targetId, adminPassword: 'admin-pw' });

      // Password verification should use admin's ID, not target's ID
      expect(mockVerifyUserCredentialPassword).toHaveBeenCalledWith(adminId, 'admin-pw');
    });

    it('passes admin id as deletedByUserId to deleteUser', async () => {
      const adminId = 'admin-user-id';
      const targetId = 'target-user-id';
      mockRequireAdmin.mockResolvedValue({ user: { id: adminId } });
      mockVerifyUserCredentialPassword.mockResolvedValueOnce({ ok: true });
      mockDeleteUser.mockResolvedValueOnce({ ok: true });

      await deleteInternalUser({ userId: targetId, adminPassword: 'pw' });

      expect(mockDeleteUser).toHaveBeenCalledWith({
        targetUserId: targetId,
        deletedByUserId: adminId,
      });
    });
  });
});

