import { siteUrl } from '@/config/url';
import { getPathname } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  // Define base paths that should be disallowed (using internal pathnames)
  const disallowedPaths = [
    '/dashboard',
    '/settings',
    '/settings/profile',
    '/settings/account',
    '/profile',
    '/admin',
    '/admin/users',
    '/admin/users/internal',
    '/admin/users/self-signup',
    '/admin/users/pro-access',
    '/admin/users/pro-access/overrides',
    '/admin/users/pro-access/promo-codes',
    '/admin/users/pro-access/email-grants',
    '/admin/account',
  ] as const;

  // Generate all locale-specific variations using next-intl's getPathname utility
  const disallowedUrls: string[] = [];

  disallowedPaths.forEach((pathname) => {
    routing.locales.forEach((locale) => {
      // Use next-intl's getPathname to get the localized path with proper prefix handling
      const localizedPath = getPathname({ locale, href: pathname });

      // Add both with and without trailing slash
      disallowedUrls.push(localizedPath, `${localizedPath}/`);
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
