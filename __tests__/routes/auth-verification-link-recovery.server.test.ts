jest.mock('next-intl/routing', () => ({
  defineRouting: jest.fn(() => ({
    locales: ['es', 'en'] as const,
    defaultLocale: 'es',
    localePrefix: 'as-needed',
    pathnames: {},
  })),
}));

jest.mock('better-auth/api', () => {
  class APIError extends Error {
    status: number | string;

    constructor(message: string, options: { status?: number | string } = {}) {
      super(message);
      this.name = 'APIError';
      this.status = options.status ?? 400;
    }
  }

  return { APIError };
});

jest.mock('@/lib/auth', () => ({
  auth: { handler: {} },
}));

jest.mock('better-auth/next-js', () => {
  // Use the mocked APIError class so instanceof checks in the route work
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { APIError } = require('better-auth/api') as { APIError: new (...args: any[]) => Error };

  return {
    toNextJsHandler: jest.fn(() => ({
      GET: jest.fn(async () => {
        // Simulate Better Auth throwing for an invalid/expired verification token
        throw new APIError('Token expired', { status: 400 });
      }),
      POST: jest.fn(),
      PATCH: jest.fn(),
      PUT: jest.fn(),
      DELETE: jest.fn(),
    })),
  };
});

describe('Auth route verification link recovery', () => {
  it('redirects invalid verification links to verify-email with nested callback and email (full URL callback)', async () => {
    // Require the handler after mocks are in place
    const { GET } = require('@/app/api/auth/[...all]/route');
    const { siteUrl } = require('@/config/url');

    const nestedCallbackPath = '/en/dashboard';
    const successURL = `${siteUrl}/en/verify-email-success?callbackURL=${encodeURIComponent(
      nestedCallbackPath,
    )}`;

    const request = {
      method: 'GET',
      url: `${siteUrl}/api/auth/verify-email?token=expired-token&callbackURL=${encodeURIComponent(
        successURL,
      )}&email=user@example.com`,
      headers: new Headers(),
    } as unknown as Request;

    const response = await GET(request);

    expect(response.status).toBe(302);
    const location = response.headers.get('Location');
    expect(location).toBe(
      `${siteUrl}/en/verify-email?callbackURL=%2Fen%2Fdashboard&email=user%40example.com`,
    );
  });

  it('redirects invalid verification links when callbackURL is a path-only success URL', async () => {
    const { GET } = require('@/app/api/auth/[...all]/route');
    const { siteUrl } = require('@/config/url');

    const nestedCallbackPath = '/en/dashboard';
    const successPath = `/en/verify-email-success?callbackURL=${encodeURIComponent(nestedCallbackPath)}`;

    const request = {
      method: 'GET',
      url: `${siteUrl}/api/auth/verify-email?token=expired-token&callbackURL=${encodeURIComponent(
        successPath,
      )}&email=user@example.com`,
      headers: new Headers(),
    } as unknown as Request;

    const response = await GET(request);

    expect(response.status).toBe(302);
    const location = response.headers.get('Location');
    expect(location).toBe(
      `${siteUrl}/en/verify-email?callbackURL=%2Fen%2Fdashboard&email=user%40example.com`,
    );
  });
});
