jest.mock('better-auth/cookies', () => ({
  getSessionCookie: jest.fn(() => undefined),
}));

jest.mock('@/proxy/localization', () => ({
  buildRedirectUrl: jest.fn((_req: unknown, _targetInternalPath: string, locale: string) => {
    return new URL(`https://example.com/${locale}/sign-in`);
  }),
}));

import { handleAuthRedirects } from '@/proxy/auth-guard';

describe('proxy/auth-guard handleAuthRedirects', () => {
  it('preserves locale prefix in callbackURL for non-default locale paths', async () => {
    const req = {
      nextUrl: new URL('https://example.com/en/dashboard/events?from=claim'),
    } as unknown as import('next/server').NextRequest;

    const context = {
      locale: 'en',
      pathname: '/en/dashboard/events',
      pathnameWithoutLocale: '/dashboard/events',
      internalPath: '/dashboard/events',
    };

    const response = await handleAuthRedirects(req, context as never);
    expect(response).toBeTruthy();

    const location = response?.headers.get('Location');
    expect(location).toBeTruthy();

    const redirected = new URL(location!);
    expect(redirected.searchParams.get('callbackURL')).toBe('/en/dashboard/events?from=claim');
  });

  it('preserves unprefixed default-locale paths in callbackURL', async () => {
    const req = {
      nextUrl: new URL('https://example.com/tablero'),
    } as unknown as import('next/server').NextRequest;

    const context = {
      locale: 'es',
      pathname: '/tablero',
      pathnameWithoutLocale: '/tablero',
      internalPath: '/dashboard',
    };

    const response = await handleAuthRedirects(req, context as never);
    expect(response).toBeTruthy();

    const location = response?.headers.get('Location');
    expect(location).toBeTruthy();

    const redirected = new URL(location!);
    expect(redirected.searchParams.get('callbackURL')).toBe('/tablero');
  });
});

