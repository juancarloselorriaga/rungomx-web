import { changePasswordAction } from '@/app/actions/account';
import { headers } from 'next/headers';

type ChangePasswordBody = {
  currentPassword: string;
  newPassword: string;
  revokeOtherSessions?: boolean;
};

const mockRequireAuth = jest.fn();
let mockChangePassword: jest.Mock;
let mockGetSession: jest.Mock;

function changePasswordProxy(...args: unknown[]) {
  return mockChangePassword(...args);
}

function getSessionProxy(...args: unknown[]) {
  return mockGetSession(...args);
}

jest.mock('@/lib/auth/guards', () => ({
  requireAuthenticatedUser: (...args: unknown[]) => mockRequireAuth(...args),
}));

jest.mock('next/headers', () => ({
  headers: jest.fn(async () => new Headers()),
}));

jest.mock('@/lib/auth', () => ({
  auth: {
    api: {
      changePassword: (...args: unknown[]) => changePasswordProxy(...args),
      getSession: (...args: unknown[]) => getSessionProxy(...args),
    },
  },
}));

const currentPasswordState = { value: 'old-password' };
const sessionState = { tokens: ['session-1', 'session-2'] as string[] };
const mockHeaders = headers as jest.MockedFunction<typeof headers>;

describe('Password Change Flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    currentPasswordState.value = 'old-password';
    sessionState.tokens = ['session-1', 'session-2'];
    mockRequireAuth.mockResolvedValue({ user: { id: 'user-1' } });
    mockChangePassword = jest.fn(async ({ body }: { body: ChangePasswordBody }) => {
      const { currentPassword, newPassword, revokeOtherSessions } = body;

      if (currentPassword !== currentPasswordState.value) {
        throw new Error('INVALID_PASSWORD');
      }

      if (newPassword.includes('pwned')) {
        throw new Error('PASSWORD_PWNED');
      }

      currentPasswordState.value = newPassword;

      if (revokeOtherSessions !== false) {
        sessionState.tokens = ['new-session'];
      } else {
        sessionState.tokens = [...sessionState.tokens, 'new-session'];
      }
    });
    mockGetSession = jest.fn(async () => ({ tokens: sessionState.tokens }));
  });

  it('returns a field error and keeps the old password when the current password is incorrect', async () => {
    const result = await changePasswordAction({
      currentPassword: 'wrong-password',
      newPassword: 'new-secure-password',
    });

    expect(result).toEqual({
      ok: false,
      error: 'INVALID_INPUT',
      fieldErrors: { currentPassword: ['INVALID_PASSWORD'] },
      message: 'INVALID_PASSWORD',
    });
    expect(currentPasswordState.value).toBe('old-password');
    expect(sessionState.tokens).toHaveLength(2);
  });

  it('rejects pwned passwords and does not update the store', async () => {
    const result = await changePasswordAction({
      currentPassword: 'old-password',
      newPassword: 'pwned-password',
    });

    expect(result).toEqual({
      ok: false,
      error: 'INVALID_INPUT',
      fieldErrors: { newPassword: ['PASSWORD_PWNED'] },
      message: 'PASSWORD_PWNED',
    });
    expect(currentPasswordState.value).toBe('old-password');
  });

  it('updates the password, refreshes the session, and revokes other sessions by default', async () => {
    const result = await changePasswordAction({
      currentPassword: 'old-password',
      newPassword: 'brand-new-password',
    });

    expect(result).toEqual({ ok: true, data: null });
    expect(currentPasswordState.value).toBe('brand-new-password');
    expect(sessionState.tokens).toEqual(['new-session']);
    expect(mockGetSession).toHaveBeenCalledWith({
      headers: await mockHeaders.mock.results[0].value,
      query: { disableCookieCache: true },
    });
  });

  it('can keep other sessions when revokeOtherSessions is false', async () => {
    const result = await changePasswordAction({
      currentPassword: 'old-password',
      newPassword: 'another-password',
      revokeOtherSessions: false,
    });

    expect(result.ok).toBe(true);
    expect(sessionState.tokens).toContain('session-1');
    expect(sessionState.tokens).toContain('session-2');
    expect(sessionState.tokens).toContain('new-session');
  });
});
