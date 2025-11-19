import { siteUrl } from '@/config/url';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

/**
 * Generates alternate language metadata for SEO
 * @param locale - The current locale (es or en)
 */
export async function generateAlternateMetadata(
  locale: string
): Promise<Metadata> {
  const t = await getTranslations('SEO.default');
  const isSpanish = locale === 'es';
  const localeForOG = isSpanish ? 'es_MX' : 'en_US';
  const localePrefix = isSpanish ? '' : '/en';

  return {
    title: t('title'),
    description: t('description'),
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
      siteName: t('title'),
      title: t('openGraph.title'),
      description: t('openGraph.description'),
      images: [
        {
          url: `${siteUrl}/og-image.jpg`,
          width: 1200,
          height: 630,
          alt: t('openGraph.imageAlt'),
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: t('twitter.title'),
      description: t('twitter.description'),
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
      'application-name': t('applicationName'),
      'apple-mobile-web-app-title': t('applicationName'),
    },
  };
}
