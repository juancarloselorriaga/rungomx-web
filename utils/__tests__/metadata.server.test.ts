import {
  createBasicMetadata,
  createDefaultSeoMetadata,
  createNotFoundMetadata,
  createPageMetadata,
} from '../metadata';
import { PartialMetadataMessages } from '../staticMessages';

jest.mock('@/config/url', () => ({
  siteUrl: 'https://example.com',
}));

const mockMessages: PartialMetadataMessages = {
  Pages: {
    Home: {
      metadata: {
        title: 'Home title',
        description: 'Home description',
        keywords: ['one', null, undefined, 'two'] as unknown as string[],
        openGraph: {
          title: 'OG Home',
          description: 'OG Description',
          imageAlt: 'OG Alt',
        },
      },
    },
  },
  SEO: {
    default: {
      title: 'Default Title',
      description: 'Default Description',
      openGraph: {
        title: 'OG Default Title',
        description: 'OG Default Description',
        imageAlt: 'Default OG Alt',
      },
      twitter: {
        title: 'Twitter Title',
        description: 'Twitter Description',
      },
      applicationName: 'RunGoMX',
    },
  },
  Components: {
    ErrorBoundary: {
      notFound: {
        code: '404',
        title: 'Not Found',
        description: 'Try searching again.',
      },
    },
  },
};

jest.mock('../staticMessages', () => ({
  getMetadataMessages: jest.fn(() => mockMessages),
}));

const selectHome = (messages: PartialMetadataMessages) => messages.Pages?.Home?.metadata;
const selectDefault = (messages: PartialMetadataMessages) => messages.SEO?.default;
const selectNotFound = (messages: PartialMetadataMessages) =>
  messages.Components?.ErrorBoundary?.notFound;

describe('metadata helpers', () => {
  it('creates page metadata with sanitized keywords and open graph image', () => {
    const metadata = createPageMetadata('en', selectHome, {
      url: 'https://example.com/home',
      imagePath: '/custom-og.png',
      robots: { index: true },
    });

    expect(metadata.title).toBe('Home title');
    expect(metadata.description).toBe('Home description');
    expect(metadata.keywords).toEqual(['one', 'two']);
    expect(metadata.openGraph).toMatchObject({
      url: 'https://example.com/home',
      title: 'OG Home',
      description: 'OG Description',
      images: [
        {
          url: 'https://example.com/custom-og.png',
          alt: 'OG Alt',
          width: 1200,
          height: 630,
        },
      ],
    });
    expect(metadata.robots).toEqual({ index: true });
  });

  it('applies locale override to open graph metadata when provided', () => {
    const metadata = createPageMetadata('en', selectHome, {
      url: 'https://example.com/home',
      localeOverride: 'es_MX',
    });

    expect(metadata.openGraph).toMatchObject({
      url: 'https://example.com/home',
      locale: 'es_MX',
    });
  });

  it('returns empty metadata when selector yields nothing', () => {
    const metadata = createPageMetadata('en', () => undefined);
    expect(metadata).toEqual({});
  });

  it('creates default SEO metadata with defaults and overrides', () => {
    const metadata = createDefaultSeoMetadata('en', selectDefault, {
      url: 'https://example.com/about',
      imagePath: '/default-og.png',
      localeOverride: 'es_MX',
    });

    expect(metadata.metadataBase?.toString()).toBe('https://example.com/');
    expect(metadata.alternates).toEqual({ canonical: 'https://example.com/about' });
    expect(metadata.robots).toEqual(
      expect.objectContaining({
        index: true,
        follow: true,
      }),
    );
    expect(metadata.openGraph).toMatchObject({
      type: 'website',
      locale: 'es_MX',
      url: 'https://example.com/about',
      siteName: 'Default Title',
      images: [
        {
          url: 'https://example.com/default-og.png',
          alt: 'Default OG Alt',
          width: 1200,
          height: 630,
        },
      ],
    });
    expect(metadata.twitter).toMatchObject({
      card: 'summary_large_image',
      images: ['https://example.com/default-og.png'],
    });
    expect(metadata.other).toEqual({
      'application-name': 'RunGoMX',
      'apple-mobile-web-app-title': 'RunGoMX',
    });
  });

  it('prefers provided robots for default SEO metadata', () => {
    const metadata = createDefaultSeoMetadata('en', selectDefault, {
      robots: { index: false, follow: false },
    });

    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it('creates not found metadata combining code and title', () => {
    const metadata = createNotFoundMetadata('en', selectNotFound);
    expect(metadata.title).toBe('404 - Not Found');
    expect(metadata.description).toBe('Try searching again.');
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it('creates not found metadata with sane defaults when messages missing', () => {
    const metadata = createNotFoundMetadata('en', () => undefined);
    expect(metadata).toEqual({ robots: { index: false, follow: false } });
  });

  it('creates basic metadata with only provided fields', () => {
    const metadata = createBasicMetadata({
      title: 'Basic title',
      description: 'Basic description',
    });

    expect(metadata).toEqual({
      title: 'Basic title',
      description: 'Basic description',
    });
  });
});
