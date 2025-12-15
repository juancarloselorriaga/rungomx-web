import { changePasswordAction, updateAccountNameAction } from '@/app/actions/account';
import * as dbModule from '@/db';
import { headers } from 'next/headers';

type MockAuthContext = { user: { id: string } };

type UpdateCall = { table: unknown; values: unknown; condition: unknown };

type MockDbModule = {
  db: { update: jest.Mock };
  __getUpdateCalls: () => UpdateCall[];
  __reset: () => void;
  __setUpdateError: (error: Error | null) => void;
};

const mockRequireAuth = jest.fn<Promise<MockAuthContext>, unknown[]>();
const mockChangePassword = jest.fn<Promise<void>, unknown[]>();
const mockGetSession = jest.fn<Promise<void>, unknown[]>();
const eqMock = jest.fn((...args: unknown[]) => ({ type: 'eq', args }));

jest.mock('@/lib/auth/guards', () => ({
  requireAuthenticatedUser: (...args: unknown[]) => mockRequireAuth(...args),
}));

jest.mock('drizzle-orm', () => ({
  eq: (...args: unknown[]) => eqMock(...args),
}));

jest.mock('@/db', () => {
  const state = {
    updateCalls: [] as UpdateCall[],
    error: null as Error | null,
  };

  const update = jest.fn((table: unknown) => ({
    set: jest.fn((values: unknown) => ({
      where: jest.fn(async (condition: unknown) => {
        if (state.error) throw state.error;
        state.updateCalls.push({ table, values, condition });
        return undefined;
      }),
    })),
  }));

  const __reset = () => {
    state.updateCalls = [];
    state.error = null;
    update.mockClear();
  };

  const __setUpdateError = (error: Error | null) => {
    state.error = error;
  };

  return {
    db: { update },
    __getUpdateCalls: () => state.updateCalls,
    __reset,
    __setUpdateError,
  };
});

jest.mock('next/headers', () => ({
  headers: jest.fn(async () => new Headers()),
}));

jest.mock('@/lib/auth', () => ({
  auth: {
    api: {
      changePassword: (...args: unknown[]) => mockChangePassword(...args),
      getSession: (...args: unknown[]) => mockGetSession(...args),
    },
  },
}));

const { __getUpdateCalls, __reset, __setUpdateError } = dbModule as unknown as MockDbModule;
const mockHeaders = headers as jest.MockedFunction<typeof headers>;

describe('updateAccountNameAction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __reset();
    mockRequireAuth.mockResolvedValue({ user: { id: 'user-1' } });
  });

  it('returns UNAUTHENTICATED when the user is not logged in', async () => {
    mockRequireAuth.mockRejectedValueOnce({ code: 'UNAUTHENTICATED' });

    const result = await updateAccountNameAction({ name: 'Alice' });

    expect(result).toEqual({
      ok: false,
      error: 'UNAUTHENTICATED',
      message: 'UNAUTHENTICATED',
    });
    expect(__getUpdateCalls()).toHaveLength(0);
  });

  it('rejects empty names with field errors', async () => {
    const result = await updateAccountNameAction({ name: '' });

    expect(result).toEqual({
      ok: false,
      error: 'INVALID_INPUT',
      fieldErrors: { name: ['REQUIRED'] },
      message: 'Validation failed',
    });
    expect(__getUpdateCalls()).toHaveLength(0);
  });

  it('rejects names longer than 255 characters', async () => {
    const result = await updateAccountNameAction({ name: 'a'.repeat(256) });

    expect(result).toEqual({
      ok: false,
      error: 'INVALID_INPUT',
      fieldErrors: { name: ['TOO_LONG'] },
      message: 'Validation failed',
    });
    expect(__getUpdateCalls()).toHaveLength(0);
  });

  it('updates only the authenticated user and refreshes the session', async () => {
    const result = await updateAccountNameAction({ name: '  New Name  ' });

    expect(result).toEqual({ ok: true, data: { name: 'New Name' } });
    const updateCalls = __getUpdateCalls();
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].values).toEqual(
      expect.objectContaining({
        name: 'New Name',
        updatedAt: expect.any(Date),
      }),
    );
    expect(eqMock).toHaveBeenCalledWith(expect.anything(), 'user-1');
    expect(mockGetSession).toHaveBeenCalledWith({
      headers: await mockHeaders.mock.results[0].value,
      query: { disableCookieCache: true },
    });
  });

  it('returns SERVER_ERROR and logs when the database update fails', async () => {
    const error = new Error('db down');
    __setUpdateError(error);
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = await updateAccountNameAction({ name: 'Bob' });

    expect(result).toEqual({
      ok: false,
      error: 'SERVER_ERROR',
      message: 'SERVER_ERROR',
    });
    expect(consoleSpy).toHaveBeenCalledWith('[account] Failed to update account name', error);

    consoleSpy.mockRestore();
  });
});

describe('changePasswordAction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireAuth.mockResolvedValue({ user: { id: 'user-1' } });
  });

  it('returns UNAUTHENTICATED when the guard rejects', async () => {
    mockRequireAuth.mockRejectedValueOnce({ code: 'UNAUTHENTICATED' });

    const result = await changePasswordAction({
      currentPassword: 'old-pass',
      newPassword: 'new-password',
    });

    expect(result).toEqual({
      ok: false,
      error: 'UNAUTHENTICATED',
      message: 'UNAUTHENTICATED',
    });
    expect(mockChangePassword).not.toHaveBeenCalled();
  });

  it('validates password length before calling Better Auth', async () => {
    const result = await changePasswordAction({
      currentPassword: 'old-pass',
      newPassword: 'short7',
    });

    expect(result).toEqual({
      ok: false,
      error: 'INVALID_INPUT',
      fieldErrors: { newPassword: ['REQUIRED'] },
      message: 'INVALID_INPUT',
    });
    expect(mockChangePassword).not.toHaveBeenCalled();
  });

  it('maps incorrect current password errors to field errors', async () => {
    mockChangePassword.mockRejectedValueOnce(new Error('INVALID_PASSWORD'));

    const result = await changePasswordAction({
      currentPassword: 'wrong-pass',
      newPassword: 'new-password',
    });

    expect(result).toEqual({
      ok: false,
      error: 'INVALID_INPUT',
      fieldErrors: { currentPassword: ['INVALID_PASSWORD'] },
      message: 'INVALID_PASSWORD',
    });
  });

  it('maps Better Auth password policy errors', async () => {
    mockChangePassword.mockRejectedValueOnce(new Error('PASSWORD_TOO_SHORT'));

    const result = await changePasswordAction({
      currentPassword: 'correct-pass',
      newPassword: 'long-enough',
    });

    expect(result).toEqual({
      ok: false,
      error: 'INVALID_INPUT',
      fieldErrors: { newPassword: ['PASSWORD_TOO_SHORT'] },
      message: 'PASSWORD_TOO_SHORT',
    });
  });

  it('returns a field error when the password is pwned', async () => {
    mockChangePassword.mockRejectedValueOnce(new Error('PWNED_PASSWORD'));

    const result = await changePasswordAction({
      currentPassword: 'correct-pass',
      newPassword: 'pwned-password',
    });

    expect(result).toEqual({
      ok: false,
      error: 'INVALID_INPUT',
      fieldErrors: { newPassword: ['PASSWORD_PWNED'] },
      message: 'PASSWORD_PWNED',
    });
  });

  it('calls Better Auth with revokeOtherSessions defaulting to true and refreshes session', async () => {
    const result = await changePasswordAction({
      currentPassword: 'old-pass',
      newPassword: 'new-password',
    });

    expect(result).toEqual({ ok: true, data: null });
    expect(mockChangePassword).toHaveBeenCalledWith({
      headers: await mockHeaders.mock.results[0].value,
      body: {
        currentPassword: 'old-pass',
        newPassword: 'new-password',
        revokeOtherSessions: true,
      },
    });
    expect(mockGetSession).toHaveBeenCalledWith({
      headers: await mockHeaders.mock.results[0].value,
      query: { disableCookieCache: true },
    });
  });

  it('returns SERVER_ERROR for unknown Better Auth failures', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockChangePassword.mockRejectedValueOnce(new Error('unexpected'));

    const result = await changePasswordAction({
      currentPassword: 'old-pass',
      newPassword: 'new-password',
    });

    expect(result).toEqual({
      ok: false,
      error: 'SERVER_ERROR',
      message: 'SERVER_ERROR',
    });
    expect(consoleSpy).toHaveBeenCalledWith(
      '[account] Failed to change password',
      expect.any(Error),
    );

    consoleSpy.mockRestore();
  });
});
