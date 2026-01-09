import { AppLocale, routing } from '@/i18n/routing';

export function isValidLocale(locale: string): locale is AppLocale {
  return routing.locales.includes(locale as AppLocale);
}

function extractLocaleFromCookie(cookieHeader: string): AppLocale | null {
  const localeCookie = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('NEXT_LOCALE='));

  if (!localeCookie) return null;

  const locale = decodeURIComponent(localeCookie.split('=')[1] || '');
  return isValidLocale(locale) ? locale : null;
}

function extractLocaleFromUrl(url?: string): AppLocale | null {
  if (!url) return null;

  const urlMatch = url.match(/\/([a-z]{2})\//);
  if (!urlMatch?.[1]) return null;

  return isValidLocale(urlMatch[1]) ? urlMatch[1] : null;
}

function extractLocaleFromAcceptLanguage(acceptLanguage: string): AppLocale | null {
  const primaryLang = acceptLanguage.split(',')[0].split('-')[0];
  return isValidLocale(primaryLang) ? primaryLang : null;
}

/**
 * Extracts the locale from a Better Auth request object.
 * This is used in Better Auth callbacks where next-intl's context is not available.
 *
 * Priority order:
 * 1. NEXT_LOCALE cookie
 * 2. URL path (e.g., /es/sign-up)
 * 3. Accept-Language header
 * 4. Default locale
 *
 * @param request - The Better Auth request object
 * @returns The extracted locale or the default locale
 */
export function extractLocaleFromRequest(
  request?: Request | { url?: string; headers?: Headers },
): AppLocale {
  if (!request) return routing.defaultLocale;

  const headers = request.headers;
  const cookieHeader = headers?.get?.('cookie');

  // 1. Check cookie
  if (cookieHeader) {
    const locale = extractLocaleFromCookie(cookieHeader);
    if (locale) return locale;
  }

  // 2. Check URL
  const urlLocale = extractLocaleFromUrl(request.url);
  if (urlLocale) return urlLocale;

  // 3. Check Accept-Language header
  if (headers) {
    const acceptLanguage = headers.get?.('accept-language');
    if (acceptLanguage) {
      const locale = extractLocaleFromAcceptLanguage(acceptLanguage);
      if (locale) return locale;
    }
  }

  // 4. Default fallback
  return routing.defaultLocale;
}

/**
 * Extracts the locale from a callback URL used in Better Auth email flows.
 * This function handles both full URLs and path-only URLs.
 *
 * @param callbackURL - The callback URL that may contain a locale prefix (e.g., /en/reset-password or http://localhost:3000/en/reset-password)
 * @param fallbackRequest - Optional request object to extract locale from if callback URL doesn't contain locale
 * @returns The extracted locale or the default locale
 *
 * @example
 * extractLocaleFromCallbackURL('/en/reset-password') // 'en'
 * extractLocaleFromCallbackURL('http://localhost:3000/es/verificar-email') // 'es'
 * extractLocaleFromCallbackURL('/some-page', request) // Falls back to extractLocaleFromRequest
 */
export function extractLocaleFromCallbackURL(
  callbackURL: string,
  fallbackRequest?: Request | { url?: string; headers?: Headers },
): AppLocale {
  if (!callbackURL) {
    return fallbackRequest ? extractLocaleFromRequest(fallbackRequest) : routing.defaultLocale;
  }

  // Extract the pathname from callbackURL if it's a full URL
  let callbackPath = callbackURL;
  try {
    const callbackUrlObj = new URL(callbackURL);
    callbackPath = callbackUrlObj.pathname;
  } catch {
    // callbackURL is already a path, not a full URL
  }

  // Try to match locale from the path (e.g., /en/reset-password)
  const callbackLocaleMatch = callbackPath.match(/^\/([a-z]{2})\//);
  if (callbackLocaleMatch?.[1] && isValidLocale(callbackLocaleMatch[1])) {
    return callbackLocaleMatch[1];
  }

  // If no locale found in callback URL, fall back to request-based extraction
  return fallbackRequest ? extractLocaleFromRequest(fallbackRequest) : routing.defaultLocale;
}

/**
 * Gets the user's preferred locale with fallbacks.
 * Priority: DB profile locale > request extraction > default
 *
 * @param profileLocale - The locale stored in the user's profile (if any)
 * @param fallbackRequest - Optional request object to extract locale from if profile has no locale
 * @returns The preferred locale
 */
export function getUserPreferredLocale(
  profileLocale: string | null | undefined,
  fallbackRequest?: Request | { url?: string; headers?: Headers },
): AppLocale {
  // 1. Check DB profile locale
  if (profileLocale && isValidLocale(profileLocale)) {
    return profileLocale;
  }

  // 2. Fall back to request-based extraction
  return extractLocaleFromRequest(fallbackRequest);
}
