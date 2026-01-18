import { type AppLocale, routing } from '@/i18n/routing';
import { isValidLocale } from '@/i18n/utils';
import { NextRequest, NextResponse } from 'next/server';

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

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildPathMatcher = (localizedPath: string) => {
  if (localizedPath === '/') {
    return { matcher: /^\/$/, paramNames: [] as string[] };
  }

  const segments = localizedPath.split('/').filter(Boolean);
  const paramNames: string[] = [];
  const pattern = segments
    .map((segment) => {
      if (segment.startsWith('[') && segment.endsWith(']')) {
        paramNames.push(segment.slice(1, -1));
        return '([^/]+)';
      }
      return escapeRegex(segment);
    })
    .join('/');

  // Capture any remaining path so broad entries like `/dashboard` can still
  // map `/tablero/...` to `/dashboard/...` when a more specific entry isn't declared.
  return {
    matcher: new RegExp(`^/${pattern}((?:/.*)?)$`),
    paramNames,
  };
};

const toInternalPath = (pathname: string, locale: AppLocale) => {
  if (pathname === '/') return '/';

  // Prefer the most specific matching route (e.g. `/dashboard/events/[eventId]/registrations`)
  // over broad prefixes like `/dashboard`. This is important for correct auth guards and
  // callback URLs on localized routes.
  const entries = Object.entries(routing.pathnames ?? {})
    .map(([internal, localized]) => {
      const localizedPath = typeof localized === 'string' ? localized : localized[locale];
      return localizedPath ? ({ internal, localizedPath } as const) : null;
    })
    .filter(
      (entry): entry is NonNullable<typeof entry> => entry !== null,
    )
    .sort((a, b) => b.localizedPath.length - a.localizedPath.length);

  for (const entry of entries) {
    const { matcher, paramNames } = buildPathMatcher(entry.localizedPath);
    const match = matcher.exec(pathname);
    if (match) {
      let resolved = entry.internal;
      for (const [index, name] of paramNames.entries()) {
        resolved = resolved.replace(`[${name}]`, match[index + 1]);
      }

      const rest = match[paramNames.length + 1] ?? '';
      return `${resolved}${rest}` || '/';
    }
  }

  return pathname;
};

export const buildRedirectUrl = (
  req: NextRequest,
  targetInternalPath: string,
  locale: AppLocale,
) => {
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
