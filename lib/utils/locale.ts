import { AppLocale, routing } from '@/i18n/routing';

/**
 * Extracts the locale from a Better Auth request object.
 * This is used in Better Auth callbacks where next-intl's context is not available.
 *
 * @param request - The Better Auth request object
 * @returns The extracted locale or the default locale
 */
export function extractLocaleFromRequest(request?: Request | { url?: string; headers?: Headers }): AppLocale {
  console.log('Request', request)
 if (!request) {
    return routing.defaultLocale;
  }

  const headers = request.headers;

  // Check for explicit locale cookie set by next-intl
  const cookieHeader = headers?.get?.('cookie');
  if (cookieHeader) {
    const localeCookie = cookieHeader
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith('NEXT_LOCALE='));

    if (localeCookie) {
      const locale = decodeURIComponent(localeCookie.split('=')[1] || '') as AppLocale;
      if (routing.locales.includes(locale)) {
        return locale;
      }
    }
  }

  // Try to extract locale from the URL path (e.g., /es/sign-up)
  const urlMatch = request.url?.match(/\/([a-z]{2})\//);
  if (urlMatch && urlMatch[1]) {
    const locale = urlMatch[1] as AppLocale;
    // Validate it's a supported locale
    if (routing.locales.includes(locale)) {
      return locale;
    }
  }

  // Fallback to Accept-Language header
  if (headers) {
    const acceptLanguage = headers.get?.('accept-language');
    if (acceptLanguage) {
      const primaryLang = acceptLanguage.split(',')[0].split('-')[0] as AppLocale;
      // Validate it's a supported locale
      if (routing.locales.includes(primaryLang)) {
        return primaryLang;
      }
    }
  }

  // Final fallback to default locale
  return routing.defaultLocale;
}
