import enMetadata from '@/messages/metadata/en.json';
import { routing } from '@/i18n/routing';
import {
  createDefaultSeoMetadata,
  createPageMetadata,
  type PageMetaSelector,
} from '@/utils/metadata';
import type { PartialMetadataMessages } from '@/utils/staticMessages';
import { generateAlternateMetadata, generateRootMetadata, createLocalizedPageMetadata } from '@/utils/seo';

jest.mock('@/config/url', () => ({
  siteUrl: 'https://example.com',
}));

jest.mock('@/utils/metadata', () => {
  const actual = jest.requireActual<typeof import('@/utils/metadata')>('@/utils/metadata');
  return {
    ...actual,
    createDefaultSeoMetadata: jest.fn((...args: Parameters<typeof actual.createDefaultSeoMetadata>) =>
      actual.createDefaultSeoMetadata(...args)
    ),
    createPageMetadata: jest.fn((...args: Parameters<typeof actual.createPageMetadata>) =>
      actual.createPageMetadata(...args)
    ),
  };
});

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
    expect(call[2]?.localeOverride).toBe('es_MX');
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
    expect(call[2]?.localeOverride).toBe('en_US');
  });

  it('pulls page metadata from metadata dictionaries', async () => {
    const metadata = await createLocalizedPageMetadata(
      'en',
      '/about',
      (messages) => messages.Pages?.About?.metadata,
      { imagePath: '/og-about.jpg' }
    );

    expect(metadata.title).toBe(enMetadata.Pages.About.metadata.title);
    expect(metadata.description).toBe(enMetadata.Pages.About.metadata.description);
    expect(metadata.openGraph?.title).toBe(enMetadata.Pages.About.metadata.openGraph?.title);
    // @ts-expect-error - testing optional chaining
    expect(metadata.openGraph?.images?.[0]?.alt).toBe(enMetadata.Pages.About.metadata.openGraph?.imageAlt);
  });
});
