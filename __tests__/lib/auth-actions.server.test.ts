jest.mock('next/headers', () => ({
  cookies: jest.fn(() => ({
    get: jest.fn(() => undefined),
  })),
}));

import { requestPasswordReset, resetPasswordWithToken } from '@/lib/auth/actions';
import { cookies } from 'next/headers';

describe('auth actions - password reset', () => {
  const originalFetch = global.fetch;
  const mockCookies = cookies as unknown as jest.Mock;

  beforeEach(() => {
    global.fetch = jest.fn() as jest.MockedFunction<typeof fetch>;
    mockCookies.mockReturnValue({
      get: jest.fn(() => undefined),
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  describe('requestPasswordReset', () => {
    it('returns data when the API call succeeds', async () => {
      const apiResponse = { ok: true };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(apiResponse),
      });

      const result = await requestPasswordReset(
        'user@example.com',
        'https://app.example.com/reset-password',
      );

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/auth/request-password-reset'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Origin: expect.any(String),
          }),
          cache: 'no-store',
          body: JSON.stringify({
            email: 'user@example.com',
            redirectTo: 'https://app.example.com/reset-password',
          }),
        }),
      );

      expect(result).toEqual({
        data: apiResponse,
        error: null,
      });
    });

    it('returns a structured error when API responds with an error message', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        json: jest.fn().mockResolvedValue({ message: 'Token expired' }),
      });

      const result = await requestPasswordReset(
        'user@example.com',
        'https://app.example.com/reset-password',
      );

      expect(result).toEqual({
        data: null,
        error: { message: 'Token expired' },
      });
    });

    it('falls back to a generic error message when API error message is missing', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        json: jest.fn().mockResolvedValue({}),
      });

      const result = await requestPasswordReset(
        'user@example.com',
        'https://app.example.com/reset-password',
      );

      expect(result).toEqual({
        data: null,
        error: { message: 'Failed to send password reset email' },
      });
    });

    it('returns a network error message when fetch throws', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network down'));

      const result = await requestPasswordReset(
        'user@example.com',
        'https://app.example.com/reset-password',
      );

      expect(result).toEqual({
        data: null,
        error: { message: 'Network error. Please try again.' },
      });
    });
  });

  describe('resetPasswordWithToken', () => {
    it('returns data when the API call succeeds', async () => {
      const apiResponse = { ok: true };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(apiResponse),
      });

      const result = await resetPasswordWithToken('new-password-123', 'reset-token');

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/auth/reset-password'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Origin: expect.any(String),
          }),
          cache: 'no-store',
          body: JSON.stringify({
            newPassword: 'new-password-123',
            token: 'reset-token',
          }),
        }),
      );

      expect(result).toEqual({
        data: apiResponse,
        error: null,
      });
    });

    it('returns a structured error when API responds with an error message', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        json: jest.fn().mockResolvedValue({ message: 'Invalid token' }),
      });

      const result = await resetPasswordWithToken('new-password-123', 'reset-token');

      expect(result).toEqual({
        data: null,
        error: { message: 'Invalid token' },
      });
    });

    it('falls back to a generic error message when API error message is missing', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        json: jest.fn().mockResolvedValue({}),
      });

      const result = await resetPasswordWithToken('new-password-123', 'reset-token');

      expect(result).toEqual({
        data: null,
        error: { message: 'Failed to reset password' },
      });
    });

    it('returns a network error message when fetch throws', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network down'));

      const result = await resetPasswordWithToken('new-password-123', 'reset-token');

      expect(result).toEqual({
        data: null,
        error: { message: 'Network error. Please try again.' },
      });
    });

    it.each([['en'], ['es']])('includes NEXT_LOCALE cookie when present (%s)', async (locale) => {
      const getMock = jest.fn(() => ({ value: locale as string }));
      mockCookies.mockReturnValue({
        get: getMock,
      });

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ ok: true }),
      });

      await requestPasswordReset('user@example.com', 'https://app.example.com/reset-password');

      expect(getMock).toHaveBeenCalledWith('NEXT_LOCALE');

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/auth/request-password-reset'),
        expect.objectContaining({
          headers: expect.objectContaining({
            Cookie: `NEXT_LOCALE=${locale}`,
          }),
        }),
      );
    });
  });
});
