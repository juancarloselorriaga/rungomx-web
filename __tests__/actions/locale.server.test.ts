jest.mock('next-intl/routing', () => ({
  defineRouting: jest.fn(() => ({
    locales: ['es', 'en'] as const,
    defaultLocale: 'es',
    localePrefix: 'as-needed',
    pathnames: {},
  })),
}));

import { updateUserLocale } from '@/app/actions/locale';

// Mock the auth action wrapper
const mockAuthContext = {
  user: { id: 'user-123', email: 'test@example.com', name: 'Test User' },
  session: { id: 'session-123' },
  isInternal: false,
  permissions: {},
  canonicalRoles: [],
  roles: [],
  profile: null,
  profileRequirements: { fieldKeys: [], categories: [] },
  profileMetadata: { countries: [], requiredFieldKeys: [] },
  availableExternalRoles: [],
  needsRoleAssignment: false,
  profileStatus: { isComplete: false, missingFields: [] },
};

const mockWithAuthenticatedUser = jest.fn();
const mockUpsertProfile = jest.fn();
const mockGetSession = jest.fn();
const mockHeaders = jest.fn();

jest.mock('@/lib/auth/action-wrapper', () => ({
  withAuthenticatedUser: (options: { unauthenticated: () => unknown }) => {
    return (handler: (ctx: typeof mockAuthContext, locale: string) => Promise<unknown>) => {
      return async (locale: string) => {
        const mockResult = mockWithAuthenticatedUser();
        if (!mockResult) {
          return handler(mockAuthContext, locale);
        }
        if (mockResult.unauthenticated) {
          return options.unauthenticated();
        }
        return handler(mockResult.context ?? mockAuthContext, locale);
      };
    };
  },
}));

jest.mock('@/lib/profiles/repository', () => ({
  upsertProfile: (...args: unknown[]) => mockUpsertProfile(...args),
}));

jest.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
    },
  },
}));

jest.mock('next/headers', () => ({
  headers: () => mockHeaders(),
}));

describe('updateUserLocale Action', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWithAuthenticatedUser.mockReturnValue(null);
    mockUpsertProfile.mockResolvedValue({ locale: 'en' });
    mockGetSession.mockResolvedValue({});
    mockHeaders.mockResolvedValue(new Headers());
  });

  describe('Authentication', () => {
    it('returns UNAUTHENTICATED for unauthenticated users', async () => {
      mockWithAuthenticatedUser.mockReturnValue({ unauthenticated: true });

      const result = await updateUserLocale('en');

      expect(result).toEqual({ ok: false, error: 'UNAUTHENTICATED' });
    });
  });

  describe('Locale Validation', () => {
    it('returns INVALID_LOCALE for invalid locale', async () => {
      const result = await updateUserLocale('fr');

      expect(result).toEqual({ ok: false, error: 'INVALID_LOCALE' });
      expect(mockUpsertProfile).not.toHaveBeenCalled();
    });

    it('returns INVALID_LOCALE for empty string', async () => {
      const result = await updateUserLocale('');

      expect(result).toEqual({ ok: false, error: 'INVALID_LOCALE' });
      expect(mockUpsertProfile).not.toHaveBeenCalled();
    });

    it('returns INVALID_LOCALE for random string', async () => {
      const result = await updateUserLocale('xyz');

      expect(result).toEqual({ ok: false, error: 'INVALID_LOCALE' });
      expect(mockUpsertProfile).not.toHaveBeenCalled();
    });
  });

  describe('Successful Update', () => {
    it('persists valid en locale', async () => {
      mockUpsertProfile.mockResolvedValue({ locale: 'en' });

      const result = await updateUserLocale('en');

      expect(result).toEqual({ ok: true, locale: 'en' });
      expect(mockUpsertProfile).toHaveBeenCalledWith('user-123', { locale: 'en' });
    });

    it('persists valid es locale', async () => {
      mockUpsertProfile.mockResolvedValue({ locale: 'es' });

      const result = await updateUserLocale('es');

      expect(result).toEqual({ ok: true, locale: 'es' });
      expect(mockUpsertProfile).toHaveBeenCalledWith('user-123', { locale: 'es' });
    });

    it('refreshes session after update', async () => {
      await updateUserLocale('en');

      expect(mockGetSession).toHaveBeenCalledWith({
        headers: expect.anything(),
        query: { disableCookieCache: true },
      });
    });
  });

  describe('Error Handling', () => {
    it('returns SERVER_ERROR if upsertProfile throws', async () => {
      mockUpsertProfile.mockRejectedValue(new Error('Database error'));

      const result = await updateUserLocale('en');

      expect(result).toEqual({ ok: false, error: 'SERVER_ERROR' });
    });

    it('returns SERVER_ERROR if getSession throws', async () => {
      mockGetSession.mockRejectedValue(new Error('Session error'));

      const result = await updateUserLocale('en');

      expect(result).toEqual({ ok: false, error: 'SERVER_ERROR' });
    });
  });
});
