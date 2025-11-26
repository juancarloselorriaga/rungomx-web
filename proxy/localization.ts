import { NextRequest, NextResponse } from 'next/server';
import { routing, type AppLocale } from '@/i18n/routing';
import { isValidLocale } from '@/i18n/utils';

const localesPattern = routing.locales.join('|');
const localePrefixRegex = new RegExp(`^/(${localesPattern})(?=/|$)`);

type LocalePrefixSetting =
  | 'always'
  | 'as-needed'
  | 'never'
  | {
      mode?: 'always' | 'as-needed' | 'never';
      prefixes?: Partial<Record<AppLocale, string>>;
    };

const resolvePrefix = (locale: AppLocale, prefixSetting: LocalePrefixSetting) => {
  if (typeof prefixSetting === 'object') {
    const mode = prefixSetting.mode ?? 'always';
    if (mode === 'never') return '';
    if (mode === 'as-needed' && locale === routing.defaultLocale) return '';
    const custom = prefixSetting.prefixes?.[locale];
    return custom ?? `/${locale}`;
  }

  if (prefixSetting === 'never') return '';
  if (prefixSetting === 'as-needed') {
    return locale === routing.defaultLocale ? '' : `/${locale}`;
  }

  return `/${locale}`;
};

const getLocaleFromPath = (pathname: string): AppLocale => {
  const match = pathname.match(localePrefixRegex);
  if (match && isValidLocale(match[1])) return match[1];
  return routing.defaultLocale;
};

const stripLocalePrefix = (pathname: string) => pathname.replace(localePrefixRegex, '') || '/';

const getLocalizedPathname = (internalPathname: string, locale: AppLocale) => {
  const entry = routing.pathnames?.[internalPathname as keyof typeof routing.pathnames];

  if (!entry) return internalPathname;
  if (typeof entry === 'string') return entry;
  return entry[locale] ?? internalPathname;
};

const toInternalPath = (pathname: string, locale: AppLocale) => {
  if (pathname === '/') return '/';

  const entries = Object.entries(routing.pathnames ?? {});
  for (const [internal, localized] of entries) {
    const localizedPath = typeof localized === 'string' ? localized : localized[locale];
    if (!localizedPath) continue;

    if (pathname === localizedPath || pathname.startsWith(`${localizedPath}/`)) {
      return internal;
    }
  }

  return pathname;
};

export const buildRedirectUrl = (req: NextRequest, targetInternalPath: string, locale: AppLocale) => {
  const localizedPath = getLocalizedPathname(targetInternalPath, locale);
  const prefix = resolvePrefix(locale, routing.localePrefix || 'as-needed');
  const normalizedPath = localizedPath === '/' ? '' : localizedPath;
  return new URL(`${prefix}${normalizedPath}`, req.nextUrl);
};

export type RequestContext = {
  locale: AppLocale;
  pathname: string;
  pathnameWithoutLocale: string;
  internalPath: string;
};

export const buildRequestContext = (req: NextRequest): RequestContext => {
  const pathname = req.nextUrl.pathname;
  const locale = getLocaleFromPath(pathname);
  const pathnameWithoutLocale = stripLocalePrefix(pathname);
  const internalPath = toInternalPath(pathnameWithoutLocale, locale);

  return { locale, pathname, pathnameWithoutLocale, internalPath };
};

/**
 * Detects preferred locale from Accept-Language header.
 */
export const detectPreferredLocale = (acceptLanguage: string | null): AppLocale => {
  if (!acceptLanguage) return routing.defaultLocale;

  const languages = acceptLanguage
    .split(',')
    .map((lang) => {
      const [code, qValue] = lang.trim().split(';');
      const quality = qValue ? parseFloat(qValue.split('=')[1]) : 1.0;
      return { code: code.split('-')[0].toLowerCase(), quality };
    })
    .sort((a, b) => b.quality - a.quality);

  for (const { code } of languages) {
    if (code === 'en') return 'en';
    if (code === 'es') return 'es';
  }

  return routing.defaultLocale;
};

export const getTrailingSlashRedirect = (req: NextRequest) => {
  const { pathname } = req.nextUrl;
  if (pathname.length > 1 && pathname.endsWith('/')) {
    const url = req.nextUrl.clone();
    url.pathname = pathname.slice(0, -1);
    return NextResponse.redirect(url, 308);
  }

  return null;
};

export const getPreferredLocaleRedirect = (req: NextRequest) => {
  const pathname = req.nextUrl.pathname;
  if (pathname !== '/') return null;

  const nextLocaleCookie = req.cookies.get('NEXT_LOCALE');
  if (nextLocaleCookie) return null;

  const acceptLanguage = req.headers.get('accept-language');
  const preferredLocale = detectPreferredLocale(acceptLanguage);
  if (preferredLocale === routing.defaultLocale) return null;

  const url = req.nextUrl.clone();
  url.pathname = `/${preferredLocale}`;
  return NextResponse.redirect(url, 307);
};
