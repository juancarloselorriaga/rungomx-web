jest.mock('@/config/url', () => ({
  siteUrl: 'https://example.com',
}));

jest.mock('@/i18n/navigation', () => ({
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@/utils/config-page-locale', () => ({
  configPageLocale: jest.fn(),
}));

jest.mock('@/i18n/routing', () => {
  const routing = {
    locales: ['es', 'en'] as const,
    defaultLocale: 'es',
    localePrefix: 'as-needed' as const,
    pathnames: {},
  };

  type AppLocale = (typeof routing)['locales'][number];

  return {
    __esModule: true,
    routing,
    DEFAULT_TIMEZONE: 'America/Mexico_City',
    AppLocale: undefined as unknown as AppLocale,
  };
});

jest.mock('next-intl/server', () => ({
  getMessages: jest.fn(),
}));

import { generateMetadata as generatePrivacyMetadata } from '@/app/[locale]/(public)/privacy/page';
import { generateMetadata as generateTermsMetadata } from '@/app/[locale]/(public)/terms/page';

describe('public legal page metadata', () => {
  it('keeps privacy canonicalized, localized, and indexable', async () => {
    const metadata = await generatePrivacyMetadata({
      params: Promise.resolve({ locale: 'es' }),
    });

    expect(metadata.robots).toBeUndefined();
    expect(metadata.alternates?.canonical).toBe('https://example.com/privacy');
    expect(metadata.alternates?.languages).toEqual(
      expect.objectContaining({
        es: 'https://example.com/privacy',
        'es-MX': 'https://example.com/privacy',
        en: 'https://example.com/en/privacy',
      }),
    );
  });

  it('keeps terms canonicalized, localized, and indexable', async () => {
    const metadata = await generateTermsMetadata({
      params: Promise.resolve({ locale: 'en' }),
    });

    expect(metadata.robots).toBeUndefined();
    expect(metadata.alternates?.canonical).toBe('https://example.com/en/terms');
    expect(metadata.alternates?.languages).toEqual(
      expect.objectContaining({
        es: 'https://example.com/terms',
        'es-MX': 'https://example.com/terms',
        en: 'https://example.com/en/terms',
      }),
    );
  });
});
