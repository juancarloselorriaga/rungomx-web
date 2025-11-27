import { routing } from '@/i18n/routing';

/**
 * Extracts the locale from a Better Auth request object.
 * This is used in Better Auth callbacks where next-intl's context is not available.
 *
 * @param request - The Better Auth request object
 * @returns The extracted locale or the default locale
 */
export function extractLocaleFromRequest(request?: Request | { url?: string; headers?: Headers }): string {
  if (!request) {
    return routing.defaultLocale;
  }

  // Try to extract locale from the URL path (e.g., /es/sign-up)
  const urlMatch = request.url?.match(/\/([a-z]{2})\//);
  if (urlMatch && urlMatch[1]) {
    const locale = urlMatch[1];
    // Validate it's a supported locale
    if (routing.locales.includes(locale as any)) {
      return locale;
    }
  }

  // Fallback to Accept-Language header
  if (request.headers) {
    const acceptLanguage = request.headers.get?.('accept-language');
    if (acceptLanguage) {
      const primaryLang = acceptLanguage.split(',')[0].split('-')[0];
      // Validate it's a supported locale
      if (routing.locales.includes(primaryLang as any)) {
        return primaryLang;
      }
    }
  }

  // Final fallback to default locale
  return routing.defaultLocale;
}
