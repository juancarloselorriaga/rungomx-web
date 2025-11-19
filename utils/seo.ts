import { siteUrl } from '@/config/url';
import type { Metadata } from 'next';
import { getStaticTranslation } from './staticMessages';

type SeoDefaultMessages = {
  title: string;
  description: string;
  openGraph: {
    title: string;
    description: string;
    imageAlt: string;
  };
  twitter: {
    title: string;
    description: string;
  };
  applicationName: string;
};

/**
 * Generates alternate language metadata for SEO
 * @param locale - The current locale (es or en)
 */
export async function generateAlternateMetadata(
  locale: string
): Promise<Metadata> {
  const seoMessages = getStaticTranslation<SeoDefaultMessages>(
    locale,
    'SEO.default'
  );
  const isSpanish = locale === 'es';
  const localeForOG = isSpanish ? 'es_MX' : 'en_US';
  const localePrefix = isSpanish ? '' : '/en';

  if (!seoMessages) {
    return {};
  }

  return {
    title: seoMessages.title,
    description: seoMessages.description,
    metadataBase: new URL(siteUrl),
    alternates: {
      canonical: `${siteUrl}${localePrefix}`,
      languages: {
        'es-MX': siteUrl,
        es: siteUrl,
        en: `${siteUrl}/en`,
      },
    },
    openGraph: {
      type: 'website',
      locale: localeForOG,
      url: `${siteUrl}${localePrefix}`,
      siteName: seoMessages.title,
      title: seoMessages.openGraph.title,
      description: seoMessages.openGraph.description,
      images: [
        {
          url: `${siteUrl}/og-image.jpg`,
          width: 1200,
          height: 630,
          alt: seoMessages.openGraph.imageAlt,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: seoMessages.twitter.title,
      description: seoMessages.twitter.description,
      images: [`${siteUrl}/og-image.jpg`],
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        'max-snippet': -1,
        'max-image-preview': 'large',
        'max-video-preview': -1,
      },
    },
    other: {
      'application-name': seoMessages.applicationName,
      'apple-mobile-web-app-title': seoMessages.applicationName,
    },
  };
}
