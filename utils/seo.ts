import { siteUrl } from '@/config/url';
import type { Metadata } from 'next';
import { routing, AppLocale } from '@/i18n/routing';
import { createDefaultSeoMetadata } from './metadata';

type LocaleConfig = {
  openGraphLocale: string;
  hreflangTags: string[];
};

const localeConfig: Record<AppLocale, LocaleConfig> = {
  es: { openGraphLocale: 'es_MX', hreflangTags: ['es', 'es-MX'] },
  en: { openGraphLocale: 'en_US', hreflangTags: ['en'] },
};

const isKnownLocale = (locale: string): locale is AppLocale =>
  routing.locales.includes(locale as AppLocale);

const localePrefix = (locale: AppLocale) =>
  routing.localePrefix === 'as-needed' && locale === routing.defaultLocale
    ? ''
    : `/${locale}`;

function buildLanguages() {
  const languages: Record<string, string> = {};

  routing.locales.forEach((loc) => {
    const cfg = localeConfig[loc];
    const href = `${siteUrl}${localePrefix(loc)}`;
    const tags = cfg?.hreflangTags ?? [loc];

    tags.forEach((tag) => {
      languages[tag] = href;
    });
  });

  return languages;
}

/**
 * Generates alternate language metadata for SEO
 * @param locale - The current locale (validated against i18n routing)
 */
export async function generateAlternateMetadata(
  locale: string
): Promise<Metadata> {
  const resolvedLocale = isKnownLocale(locale) ? locale : routing.defaultLocale;
  const cfg = localeConfig[resolvedLocale];
  const languages = buildLanguages();
  const canonical = `${siteUrl}${localePrefix(resolvedLocale)}`;

  return createDefaultSeoMetadata(
    resolvedLocale,
    (messages) => messages.SEO?.default,
    {
      url: canonical,
      imagePath: '/og-image.jpg',
      localeOverride: cfg?.openGraphLocale,
      alternates: { canonical, languages },
    }
  );
}
