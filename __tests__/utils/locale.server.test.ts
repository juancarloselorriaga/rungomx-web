jest.mock('next-intl/routing', () => ({
  defineRouting: jest.fn(() => ({
    locales: ['es', 'en'] as const,
    defaultLocale: 'es',
    localePrefix: 'as-needed',
    pathnames: {},
  })),
}));

import { extractLocaleFromCallbackURL, extractLocaleFromRequest } from '@/lib/utils/locale';

describe('extractLocaleFromRequest', () => {
  it('prefers NEXT_LOCALE cookie over Accept-Language', () => {
    const request = {
      url: 'http://localhost:3000/api/auth/sign-up/email',
      headers: new Headers({
        cookie: 'sprintmx-theme=dark; NEXT_LOCALE=es; other=value',
        'accept-language': 'en-US,en;q=0.9',
      }),
    };

    expect(extractLocaleFromRequest(request)).toBe('es');
  });

  it('falls back to Accept-Language when cookie is missing', () => {
    const request = {
      url: 'http://localhost:3000/api/auth/sign-up/email',
      headers: new Headers({
        'accept-language': 'en-US,en;q=0.9',
      }),
    };

    expect(extractLocaleFromRequest(request)).toBe('en');
  });
});

describe('extractLocaleFromCallbackURL', () => {
  describe('with full URLs', () => {
    it('extracts locale from English full URL', () => {
      const callbackURL = 'http://localhost:3000/en/reset-password';
      expect(extractLocaleFromCallbackURL(callbackURL)).toBe('en');
    });

    it('extracts locale from Spanish full URL', () => {
      const callbackURL = 'http://localhost:3000/es/restablecer-contrasena';
      expect(extractLocaleFromCallbackURL(callbackURL)).toBe('es');
    });

    it('extracts locale from full URL with different domain', () => {
      const callbackURL = 'https://example.com/en/verify-email';
      expect(extractLocaleFromCallbackURL(callbackURL)).toBe('en');
    });

    it('extracts locale from full URL with query parameters', () => {
      const callbackURL = 'http://localhost:3000/en/reset-password?token=abc123';
      expect(extractLocaleFromCallbackURL(callbackURL)).toBe('en');
    });

    it('extracts locale from full URL with hash', () => {
      const callbackURL = 'http://localhost:3000/en/reset-password#section';
      expect(extractLocaleFromCallbackURL(callbackURL)).toBe('en');
    });
  });

  describe('with path-only URLs', () => {
    it('extracts locale from English path', () => {
      const callbackURL = '/en/reset-password';
      expect(extractLocaleFromCallbackURL(callbackURL)).toBe('en');
    });

    it('extracts locale from Spanish path', () => {
      const callbackURL = '/es/restablecer-contrasena';
      expect(extractLocaleFromCallbackURL(callbackURL)).toBe('es');
    });

    it('extracts locale from path with query parameters', () => {
      const callbackURL = '/en/reset-password?token=abc123';
      expect(extractLocaleFromCallbackURL(callbackURL)).toBe('en');
    });

    it('extracts locale from nested path', () => {
      const callbackURL = '/en/auth/reset-password';
      expect(extractLocaleFromCallbackURL(callbackURL)).toBe('en');
    });
  });

  describe('fallback behavior', () => {
    it('falls back to default locale when URL has no locale prefix', () => {
      const callbackURL = '/reset-password';
      expect(extractLocaleFromCallbackURL(callbackURL)).toBe('es'); // default locale
    });

    it('falls back to default locale when URL has invalid locale', () => {
      const callbackURL = '/fr/reset-password'; // 'fr' is not in our locales
      expect(extractLocaleFromCallbackURL(callbackURL)).toBe('es'); // default locale
    });

    it('falls back to request locale when callback URL has no locale', () => {
      const callbackURL = '/reset-password';
      const fallbackRequest = {
        url: 'http://localhost:3000/api/auth/request-password-reset',
        headers: new Headers({
          cookie: 'NEXT_LOCALE=en',
        }),
      };
      expect(extractLocaleFromCallbackURL(callbackURL, fallbackRequest)).toBe('en');
    });

    it('prefers callback URL locale over request locale', () => {
      const callbackURL = 'http://localhost:3000/en/reset-password';
      const fallbackRequest = {
        url: 'http://localhost:3000/api/auth/request-password-reset',
        headers: new Headers({
          cookie: 'NEXT_LOCALE=es', // Spanish in cookie
        }),
      };
      expect(extractLocaleFromCallbackURL(callbackURL, fallbackRequest)).toBe('en'); // English from URL takes precedence
    });
  });

  describe('edge cases', () => {
    it('handles empty callback URL', () => {
      expect(extractLocaleFromCallbackURL('')).toBe('es'); // default locale
    });

    it('handles empty callback URL with fallback request', () => {
      const fallbackRequest = {
        url: 'http://localhost:3000/api/auth/request-password-reset',
        headers: new Headers({
          cookie: 'NEXT_LOCALE=en',
        }),
      };
      expect(extractLocaleFromCallbackURL('', fallbackRequest)).toBe('en');
    });

    it('handles URL without leading slash', () => {
      const callbackURL = 'en/reset-password';
      expect(extractLocaleFromCallbackURL(callbackURL)).toBe('es'); // can't match without leading slash
    });

    it('handles root path with locale', () => {
      const callbackURL = '/en/';
      expect(extractLocaleFromCallbackURL(callbackURL)).toBe('en');
    });

    it('handles URL with port number', () => {
      const callbackURL = 'http://localhost:3000/en/reset-password';
      expect(extractLocaleFromCallbackURL(callbackURL)).toBe('en');
    });

    it('handles HTTPS URLs', () => {
      const callbackURL = 'https://example.com/en/reset-password';
      expect(extractLocaleFromCallbackURL(callbackURL)).toBe('en');
    });
  });

  describe('real-world scenarios', () => {
    it('handles password reset flow for English user', () => {
      const callbackURL = 'http://localhost:3000/en/reset-password';
      const request = {
        url: 'http://localhost:3000/api/auth/request-password-reset',
        headers: new Headers({
          cookie: 'NEXT_LOCALE=es', // Cookie might have stale value
        }),
      };
      // Should prefer the explicit locale in the callback URL
      expect(extractLocaleFromCallbackURL(callbackURL, request)).toBe('en');
    });

    it('handles email verification flow for Spanish user', () => {
      const callbackURL = 'http://localhost:3000/es/verificar-email-exitoso';
      const request = {
        url: 'http://localhost:3000/api/auth/verify-email',
        headers: new Headers({
          cookie: 'NEXT_LOCALE=es',
        }),
      };
      expect(extractLocaleFromCallbackURL(callbackURL, request)).toBe('es');
    });

    it('handles production URL scenario', () => {
      const callbackURL = 'https://myapp.com/en/reset-password';
      expect(extractLocaleFromCallbackURL(callbackURL)).toBe('en');
    });
  });
});
