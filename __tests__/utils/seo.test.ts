import { generateAlternateMetadata, generateRootMetadata, createLocalizedPageMetadata } from '@/utils/seo';
import { routing } from '@/i18n/routing';
import { createDefaultSeoMetadata, createPageMetadata, type PageMetaSelector } from '@/utils/metadata';
import type { PartialMetadataMessages } from '@/utils/staticMessages';

jest.mock('@/config/url', () => ({
  siteUrl: 'https://example.com',
}));

jest.mock('@/utils/metadata', () => ({
  createDefaultSeoMetadata: jest.fn((locale, _select, options) => ({
    locale,
    options,
  })),
  createPageMetadata: jest.fn((locale, _select, options) => ({
    locale,
    options,
  })),
}));

jest.mock('@/i18n/routing', () => {
  const routing = {
    locales: ['es', 'en'] as const,
    defaultLocale: 'es',
    localePrefix: 'as-needed' as const,
    pathnames: {
      '/': '/',
      '/about': { es: '/acerca', en: '/about' },
      '/news/[slug]': { es: '/noticias/[slug]', en: '/news/[slug]' },
    },
  };

  type AppLocale = (typeof routing)['locales'][number];

  return {
    __esModule: true,
    routing,
    AppLocale: undefined as unknown as AppLocale,
  };
});

const createDefaultSeoMetadataMock = jest.mocked(createDefaultSeoMetadata);
const createPageMetadataMock = jest.mocked(createPageMetadata);

describe('generateAlternateMetadata', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    routing.localePrefix = 'as-needed';
  });

  it('returns structured data with localized paths and as-needed prefix', async () => {
    const result = await generateAlternateMetadata('es', '/about');

    expect(result).toEqual({
      canonical: 'https://example.com/acerca',
      languages: {
        es: 'https://example.com/acerca',
        'es-MX': 'https://example.com/acerca',
        en: 'https://example.com/en/about',
      },
      openGraphLocale: 'es_MX',
    });
  });

  it('replaces dynamic params for localized pathnames', async () => {
    const result = await generateAlternateMetadata('en', '/news/[slug]', { slug: 'hola' });

    expect(result).toEqual({
      canonical: 'https://example.com/en/news/hola',
      languages: {
        es: 'https://example.com/noticias/hola',
        'es-MX': 'https://example.com/noticias/hola',
        en: 'https://example.com/en/news/hola',
      },
      openGraphLocale: 'en_US',
    });
  });

  it('falls back to default locale when an unknown locale is provided', async () => {
    const result = await generateAlternateMetadata('fr', '/about');

    expect(result.canonical).toBe('https://example.com/acerca');
    expect(result.languages.es).toBe('https://example.com/acerca');
    expect(result.openGraphLocale).toBe('es_MX');
  });

  it('omits locale prefix when localePrefix is set to never', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    routing.localePrefix = { mode: 'never' } as any;

    const result = await generateAlternateMetadata('en', '/about');

    expect(result).toEqual({
      canonical: 'https://example.com/about',
      languages: {
        es: 'https://example.com/acerca',
        'es-MX': 'https://example.com/acerca',
        en: 'https://example.com/about',
      },
      openGraphLocale: 'en_US',
    });
  });
});

describe('generateRootMetadata', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    routing.localePrefix = 'as-needed';
  });

  it('generates complete metadata for root layout', async () => {
    await generateRootMetadata('es');

    expect(createDefaultSeoMetadataMock).toHaveBeenCalledTimes(1);
    const call = createDefaultSeoMetadataMock.mock.calls[0];
    const options = call[2];

    expect(options?.alternates?.languages).toEqual({
      es: 'https://example.com',
      'es-MX': 'https://example.com',
      en: 'https://example.com/en',
    });
    expect(options?.alternates?.canonical).toBe('https://example.com');
    expect(options?.url).toBe('https://example.com');
    expect(options?.localeOverride).toBe('es_MX');
  });
});

describe('createLocalizedPageMetadata', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    routing.localePrefix = 'as-needed';
  });

  it('creates page metadata with alternates in one call', async () => {
    const selector: PageMetaSelector = (messages: PartialMetadataMessages) => messages.Pages?.About?.metadata;
    await createLocalizedPageMetadata('es', '/about', selector, {
      imagePath: '/og-about.jpg',
    });

    expect(createPageMetadataMock).toHaveBeenCalledTimes(1);
    const call = createPageMetadataMock.mock.calls[0];

    expect(call[0]).toBe('es');
    expect(call[1]).toBe(selector);
    expect(call[2]?.url).toBe('https://example.com/acerca');
    expect(call[2]?.imagePath).toBe('/og-about.jpg');
    expect(call[2]?.alternates?.canonical).toBe('https://example.com/acerca');
    expect(call[2]?.alternates?.languages).toEqual({
      es: 'https://example.com/acerca',
      'es-MX': 'https://example.com/acerca',
      en: 'https://example.com/en/about',
    });
  });

  it('handles dynamic params correctly', async () => {
    const selector: PageMetaSelector = (messages: PartialMetadataMessages) => messages.Pages?.About?.metadata;
    await createLocalizedPageMetadata('en', '/news/[slug]', selector, {
      params: { slug: 'test-article' },
    });

    const call = createPageMetadataMock.mock.calls[0];

    expect(call[2]?.url).toBe('https://example.com/en/news/test-article');
    expect(call[2]?.alternates?.languages).toEqual({
      es: 'https://example.com/noticias/test-article',
      'es-MX': 'https://example.com/noticias/test-article',
      en: 'https://example.com/en/news/test-article',
    });
  });
});
