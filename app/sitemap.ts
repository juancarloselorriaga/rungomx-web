import { siteUrl } from '@/config/url';
import { type AppLocale, routing } from '@/i18n/routing';
import { getPublishedEventRoutesForSitemap } from '@/lib/events/queries';
import { MetadataRoute } from 'next';

// Capture timestamp once at module load for deterministic lastModified
const buildTimestamp = new Date();

// Define all your static routes (internal pathnames)
// Protected routes like /dashboard, /settings, /profile are excluded from sitemap
const staticRoutes = [
  '/',
  '/about',
  '/contact',
  '/help',
  '/privacy',
  '/terms',
  '/results',
  '/news',
  '/events',
];

function resolveExternalPathname(locale: AppLocale, pathname: string): string {
  const entry = routing.pathnames?.[pathname as keyof typeof routing.pathnames];
  if (!entry) return pathname;
  if (typeof entry === 'string') return entry;
  return entry[locale] ?? pathname;
}

function resolvePrefix(locale: AppLocale): string {
  const prefixSetting = routing.localePrefix as
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
}

const applyParams = (path: string, params: Record<string, string>) =>
  path.replace(/\[\.{3}?([\w-]+)]|\[([\w-]+)]/g, (_, catchAll, single) => {
    const key = (catchAll || single) as string;
    return params[key] ?? `[${key}]`;
  });

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const sitemapEntries: MetadataRoute.Sitemap = [];

  staticRoutes.forEach((pathname) => {
    routing.locales.forEach((locale) => {
      const externalPath = resolveExternalPathname(locale, pathname);
      const prefix = resolvePrefix(locale);
      const url = `${siteUrl}${prefix}${externalPath === '/' ? '' : externalPath}`;

      sitemapEntries.push({
        url,
        lastModified: buildTimestamp,
        changeFrequency: pathname === '/' ? 'daily' : 'weekly',
        priority: pathname === '/' ? 1.0 : 0.8,
      });
    });
  });

  const publishedEvents = await getPublishedEventRoutesForSitemap();
  const eventPathname = '/events/[seriesSlug]/[editionSlug]';

  publishedEvents.forEach((event) => {
    const alternates: Record<string, string> = {};

    routing.locales.forEach((locale) => {
      const externalPath = resolveExternalPathname(locale, eventPathname);
      const localizedPath = applyParams(externalPath, {
        seriesSlug: event.seriesSlug,
        editionSlug: event.editionSlug,
      });
      const prefix = resolvePrefix(locale);
      alternates[locale] = `${siteUrl}${prefix}${localizedPath === '/' ? '' : localizedPath}`;
    });

    const canonicalLocale = routing.defaultLocale;
    const canonicalPath = applyParams(
      resolveExternalPathname(canonicalLocale, eventPathname),
      { seriesSlug: event.seriesSlug, editionSlug: event.editionSlug },
    );
    const canonicalUrl = `${siteUrl}${resolvePrefix(canonicalLocale)}${canonicalPath === '/' ? '' : canonicalPath}`;

    sitemapEntries.push({
      url: canonicalUrl,
      lastModified: event.updatedAt ?? buildTimestamp,
      alternates: { languages: alternates },
      changeFrequency: 'weekly',
      priority: 0.7,
    });
  });

  return sitemapEntries;
}
