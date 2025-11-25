jest.mock('@/i18n/routing', () => ({
  routing: {
    locales: ['en', 'es'] as const,
    defaultLocale: 'en',
    localePrefix: 'as-needed',
    pathnames: {},
  },
  AppLocale: undefined as unknown as string,
}));

jest.mock('next/headers', () => ({
  headers: () => ({
    get: () => undefined,
  }),
}));

import { loadMessages, loadRouteMessages, ROUTE_MESSAGES_BYTE_LIMIT } from '@/i18n/utils';

type LoadedMessages = Awaited<ReturnType<typeof loadRouteMessages>>;

const getSize = (messages: unknown) => JSON.stringify(messages).length;

describe('route-based namespace loading', () => {
  it('loads only configured namespaces for a route', async () => {
    const messages = await loadRouteMessages('en', '/about');
    const pages = (messages as LoadedMessages).pages;

    expect(pages.about).toBeDefined();
    expect(pages.home).toBeUndefined();
  });

  it('keeps auth route payloads minimal', async () => {
    const messages = await loadRouteMessages('en', '/sign-in');
    const namespaces = messages as LoadedMessages;

    expect(namespaces.navigation).toBeUndefined();
    expect(namespaces.auth).toBeDefined();
    expect(namespaces.pages.signIn).toBeDefined();
  });

  it('omits footer for protected routes', async () => {
    const messages = await loadRouteMessages('en', '/dashboard');
    const components = (messages as LoadedMessages).components;

    expect(components?.footer).toBeUndefined();
    expect(components?.themeSwitcher).toBeDefined();
  });

  it('supports routes without page-specific namespaces (privacy/terms)', async () => {
    const privacy = await loadRouteMessages('en', '/privacy');
    const terms = await loadRouteMessages('en', '/terms');

    expect(privacy.pages).toBeUndefined();
    expect(terms.pages).toBeUndefined();
  });

  it('falls back to default selection for unmapped routes', async () => {
    const messages = await loadRouteMessages('en', '/unmapped');
    const namespaces = messages as LoadedMessages;

    expect(namespaces.common).toBeDefined();
    expect(namespaces.components?.footer).toBeDefined();
    expect(namespaces.pages).toBeUndefined();
  });

  it('enforces the payload size guardrail for route-scoped messages', async () => {
    const messages = await loadRouteMessages('en', '/about');
    const size = getSize(messages);

    expect(size).toBeLessThan(ROUTE_MESSAGES_BYTE_LIMIT);
  });

  it('detects when a full bundle would exceed the guardrail', async () => {
    const fullBundle = await loadMessages('en');
    const size = getSize(fullBundle);

    expect(size).toBeGreaterThan(ROUTE_MESSAGES_BYTE_LIMIT);
  });
});
