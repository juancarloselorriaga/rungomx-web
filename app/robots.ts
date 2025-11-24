import { MetadataRoute } from 'next';
import { siteUrl } from '@/config/url';
import { routing } from '@/i18n/routing';

export default function robots(): MetadataRoute.Robots {
  // Define base paths that should be disallowed (using the pathname keys)
  const disallowedPaths = ['/dashboard', '/settings', '/profile'] as const;

  // Generate all locale-specific variations
  const disallowedUrls: string[] = [];

  disallowedPaths.forEach((pathname) => {
    routing.locales.forEach((locale) => {
      // Get the localized pathname
      const localizedPath = routing.pathnames[pathname]?.[locale] || pathname;

      if (locale === routing.defaultLocale) {
        // Default locale without a prefix (due to 'as-needed')
        disallowedUrls.push(localizedPath, `${localizedPath}/`);
      } else {
        // Non-default locales with prefix
        disallowedUrls.push(`/${locale}${localizedPath}`, `/${locale}${localizedPath}/`);
      }
    });
  });

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: disallowedUrls,
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
