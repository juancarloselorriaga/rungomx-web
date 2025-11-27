jest.mock('next-intl/routing', () => ({
  defineRouting: jest.fn(() => ({
    locales: ['es', 'en'] as const,
    defaultLocale: 'es',
    localePrefix: 'as-needed',
    pathnames: {},
  })),
}));

import { extractLocaleFromRequest } from '@/lib/utils/locale';

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
