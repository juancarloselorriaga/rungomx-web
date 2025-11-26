import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import createMiddleware from 'next-intl/middleware';
import { routing, type AppLocale } from './i18n/routing';
import { isValidLocale } from './i18n/utils';

// Create i18n routing handler
const handleI18nRouting = createMiddleware(routing);

// Define protected and auth-only routes (internal pathnames)
const protectedRoutes = ['/dashboard', '/settings', '/profile'];
const authRoutes = ['/sign-in', '/sign-up'];

const localesPattern = routing.locales.join('|');
const localePrefixRegex = new RegExp(`^/(${localesPattern})(?=/|$)`);

const resolvePrefix = (locale: AppLocale) => {
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
  const entry = routing.pathnames?.[
    internalPathname as keyof typeof routing.pathnames
  ];

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

const buildRedirectUrl = (req: NextRequest, targetInternalPath: string, locale: AppLocale) => {
  const localizedPath = getLocalizedPathname(targetInternalPath, locale);
  const prefix = resolvePrefix(locale);
  const normalizedPath = localizedPath === '/' ? '' : localizedPath;
  return new URL(`${prefix}${normalizedPath}`, req.nextUrl);
};

/**
 * Detects preferred locale from Accept-Language header
 */
const detectPreferredLocale = (acceptLanguage: string | null): AppLocale => {
  if (!acceptLanguage) return routing.defaultLocale;

  // Parse Accept-Language header (e.g., "en-US,en;q=0.9,es;q=0.8")
  const languages = acceptLanguage
    .split(',')
    .map(lang => {
      const [code, qValue] = lang.trim().split(';');
      const quality = qValue ? parseFloat(qValue.split('=')[1]) : 1.0;
      return { code: code.split('-')[0].toLowerCase(), quality };
    })
    .sort((a, b) => b.quality - a.quality);

  // Find first matching locale
  for (const { code } of languages) {
    if (code === 'en') return 'en';
    if (code === 'es') return 'es';
  }

  return routing.defaultLocale;
};

export async function proxy(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  // Remove trailing slashes (except root)
  if (pathname.length > 1 && pathname.endsWith('/')) {
    const url = req.nextUrl.clone();
    url.pathname = pathname.slice(0, -1);
    return NextResponse.redirect(url, 308);
  }

  // Locale detection: Redirect root path to preferred locale if not default
  // Only apply auto-detection if user hasn't explicitly chosen a locale (no NEXT_LOCALE cookie)
  if (pathname === '/') {
    const nextLocaleCookie = req.cookies.get('NEXT_LOCALE');

    // Only auto-detect if user hasn't made an explicit choice via language switcher
    if (!nextLocaleCookie) {
      const acceptLanguage = req.headers.get('accept-language');
      const preferredLocale = detectPreferredLocale(acceptLanguage);

      // Only redirect if preferred locale is not the default (to avoid unnecessary redirects)
      if (preferredLocale !== routing.defaultLocale) {
        const url = req.nextUrl.clone();
        url.pathname = `/${preferredLocale}`;
        return NextResponse.redirect(url, 307); // Temporary redirect
      }
    }
  }

  // Handle i18n routing
  const i18nResponse = handleI18nRouting(req);

  const locale = getLocaleFromPath(pathname);
  const pathnameWithoutLocale = stripLocalePrefix(pathname);
  const internalPath = toInternalPath(pathnameWithoutLocale, locale);

  // Check if the current route is protected or auth-only using internal pathnames
  const isProtectedRoute = protectedRoutes.some(route => internalPath.startsWith(route));
  const isAuthRoute = authRoutes.some(route => internalPath.startsWith(route));

  // Validate session via Better Auth (requires Node.js runtime in Next.js 16)
  const session = await auth.api.getSession({
    headers: req.headers
  });
  const isAuthenticated = !!session;

  // Redirect unauthenticated users trying to access protected routes
  if (isProtectedRoute && !isAuthenticated) {
    return NextResponse.redirect(
      buildRedirectUrl(req, '/sign-in', locale)
    );
  }

  // Redirect authenticated users trying to access auth pages
  if (isAuthRoute && isAuthenticated) {
    return NextResponse.redirect(
      buildRedirectUrl(req, '/dashboard', locale)
    );
  }

  return i18nResponse;
}

// Configure which routes the proxy should run on
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - trpc (tRPC routes)
     * - _next (Next.js internals)
     * - _vercel (Vercel internals)
     * - Static files (containing a dot)
     */
    '/((?!api|trpc|_next|_vercel|.*\\..*).*)'
  ],
  runtime: 'nodejs'
};
