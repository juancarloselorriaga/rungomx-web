import { siteUrl } from '@/config/url';
import type { Metadata } from 'next';
import { createDefaultSeoMetadata } from './metadata';

/**
 * Generates alternate language metadata for SEO
 * @param locale - The current locale (es or en)
 */
export async function generateAlternateMetadata(
  locale: string
): Promise<Metadata> {
  const isSpanish = locale === 'es';
  const localeForOG = isSpanish ? 'es_MX' : 'en_US';
  const localePrefix = isSpanish ? '' : '/en';
  return createDefaultSeoMetadata(
    locale,
    (messages) => messages.SEO?.default,
    {
      url: `${siteUrl}${localePrefix}`,
      imagePath: '/og-image.jpg',
      localeOverride: localeForOG,
      alternates: {
        canonical: `${siteUrl}${localePrefix}`,
        languages: {
          'es-MX': siteUrl,
          es: siteUrl,
          en: `${siteUrl}/en`,
        },
      },
    }
  );
}
