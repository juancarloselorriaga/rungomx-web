import { siteUrl } from '@/config/url';
import type { Metadata } from 'next';
import { routing, AppLocale } from '@/i18n/routing';
import { createDefaultSeoMetadata, createPageMetadata, type PageMetaSelector } from './metadata';

type PageMetadataOptions = {
  url?: string;
  imagePath?: string;
  alternates?: Metadata['alternates'];
  robots?: Metadata['robots'];
};

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

type BuildAlternatesOptions = {
  locale: string;
  pathname?: string;
  params?: Record<string, string | number>;
};

const normalizePath = (path: string) =>
  path.startsWith('/') ? path : `/${path}`;

const resolvePrefix = (locale: AppLocale) => {
  const prefixSetting =
    routing.localePrefix as
      | 'always'
      | 'as-needed'
      | 'never'
      | {
          mode?: 'always' | 'as-needed' | 'never';
          prefixes?: Partial<Record<AppLocale, string>>;
        };

  if (typeof prefixSetting === 'object') {
    const mode = prefixSetting.mode ?? 'always';
    if (mode === 'never') return '';
    if (mode === 'as-needed' && locale === routing.defaultLocale) return '';
    const custom = prefixSetting.prefixes?.[locale];
    return custom ?? `/${locale}`;
  }

  if (prefixSetting === 'as-needed') {
    return locale === routing.defaultLocale ? '' : `/${locale}`;
  }

  if (prefixSetting === 'never') return '';

  // Default: always prefix
  return `/${locale}`;
};

const applyParams = (path: string, params?: Record<string, string | number>) =>
  path.replace(/\[\.{3}?([\w-]+)]|\[([\w-]+)]/g, (_, catchAll, single) => {
    const key = catchAll || single;
    const value = params?.[key as string];
    return value !== undefined ? String(value) : `[${key}]`;
  });

function resolveExternalPathname(
  locale: AppLocale,
  pathname: string
): string {
  const entry = routing.pathnames?.[
    pathname as keyof typeof routing.pathnames
  ];

  if (!entry) return pathname;
  if (typeof entry === 'string') return entry;

  return (
    entry[
      locale as keyof typeof entry
    ] ?? pathname
  );
}

function buildLanguages({
  pathname = '/',
  params,
}: Pick<BuildAlternatesOptions, 'pathname' | 'params'>) {
  const languages: Record<string, string> = {};

  routing.locales.forEach((loc) => {
    const cfg = localeConfig[loc];
    const externalPath = resolveExternalPathname(loc, pathname);
    const localizedPath = applyParams(normalizePath(externalPath), params);
    const href = `${siteUrl}${resolvePrefix(loc)}${localizedPath === '/' ? '' : localizedPath}`;
    const tags = cfg?.hreflangTags ?? [loc];

    tags.forEach((tag) => {
      languages[tag] = href;
    });
  });

  return languages;
}

type AlternateMetadataResult = {
  canonical: string;
  languages: Record<string, string>;
  openGraphLocale: string;
};

/**
 * Generates alternate language metadata for SEO
 * @param locale - The current locale (validated against i18n routing)
 * @param pathname - The internal pathname (shared) for the current route, e.g. "/about"
 * @param params - Optional route params for dynamic segments
 * @returns Structured data containing canonical URL, language alternates, and Open Graph locale
 */
export async function generateAlternateMetadata(
  locale: string,
  pathname: string = '/',
  params?: Record<string, string | number>
): Promise<AlternateMetadataResult> {
  const resolvedLocale = isKnownLocale(locale) ? locale : routing.defaultLocale;
  const cfg = localeConfig[resolvedLocale];
  const languages = buildLanguages({ pathname, params });
  const canonical =
    languages[resolvedLocale] ??
    `${siteUrl}${resolvePrefix(resolvedLocale)}${normalizePath(pathname)}`;

  return {
    canonical,
    languages,
    openGraphLocale: cfg?.openGraphLocale ?? 'en_US',
  };
}

/**
 * Creates localized page metadata with SEO alternates in one call
 * @param locale - The current locale
 * @param pathname - The internal pathname for the route, e.g. "/about"
 * @param select - Function to select page metadata from translation messages
 * @param options - Optional configuration (params, imagePath, robots)
 * @returns Complete Next.js Metadata object with localized SEO
 */
export async function createLocalizedPageMetadata(
  locale: string,
  pathname: string,
  select: PageMetaSelector,
  options?: {
    params?: Record<string, string | number>;
    imagePath?: string;
    robots?: Metadata['robots'];
  }
): Promise<Metadata> {
  const { canonical, languages } = await generateAlternateMetadata(
    locale,
    pathname,
    options?.params
  );

  return createPageMetadata(locale, select, {
    url: canonical,
    imagePath: options?.imagePath,
    alternates: { canonical, languages },
    robots: options?.robots,
  });
}

/**
 * Generates complete root layout metadata with SEO defaults
 * @param locale - The current locale
 * @param pathname - The internal pathname (default: "/")
 * @param params - Optional route params for dynamic segments
 * @returns Complete Next.js Metadata object for root layout
 */
export async function generateRootMetadata(
  locale: string,
  pathname: string = '/',
  params?: Record<string, string | number>
): Promise<Metadata> {
  const resolvedLocale = isKnownLocale(locale) ? locale : routing.defaultLocale;
  const cfg = localeConfig[resolvedLocale];
  const languages = buildLanguages({ pathname, params });
  const canonical =
    languages[resolvedLocale] ??
    `${siteUrl}${resolvePrefix(resolvedLocale)}${normalizePath(pathname)}`;

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
