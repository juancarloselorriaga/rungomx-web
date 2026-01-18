import { handleAuthRedirects } from '@/proxy/auth-guard';
import { handleI18nRouting } from '@/proxy/i18n';
import {
  buildRequestContext,
  getPreferredLocaleRedirect,
  getTrailingSlashRedirect,
} from '@/proxy/localization';
import { routing } from '@/i18n/routing';
import { NextRequest, NextResponse } from 'next/server';

const INTERNAL_REWRITE_HEADER = 'x-rungomx-internal-rewrite';

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
    '/((?!api|trpc|_next|_vercel|.*\\..*).*)',
  ],
};

export async function proxy(req: NextRequest) {
  // Avoid infinite loops when the middleware rewrite triggers an internal subrequest.
  // https://nextjs.org/docs/app/building-your-application/routing/middleware#avoiding-infinite-loops
  if (req.headers.has('x-middleware-subrequest')) {
    return NextResponse.next();
  }

  const trailingSlashRedirect = getTrailingSlashRedirect(req);
  if (trailingSlashRedirect) return trailingSlashRedirect;

  const preferredLocaleRedirect = getPreferredLocaleRedirect(req);
  if (preferredLocaleRedirect) return preferredLocaleRedirect;

  const context = buildRequestContext(req);
  const hasExplicitLocalePrefix = new RegExp(`^/(${routing.locales.join('|')})(?=/|$)`).test(
    req.nextUrl.pathname,
  );

  // If the user has a non-default locale cookie but is on an unprefixed URL, redirect
  // them to the locale-prefixed equivalent. This mirrors next-intl behavior for
  // `localePrefix: 'as-needed'` without relying on next-intl's redirect handling.
  const nextLocaleCookie = req.cookies.get('NEXT_LOCALE')?.value;
  if (
    !hasExplicitLocalePrefix &&
    nextLocaleCookie &&
    routing.locales.includes(nextLocaleCookie as (typeof routing.locales)[number]) &&
    nextLocaleCookie !== routing.defaultLocale
  ) {
    const target = new URL(req.url);
    target.pathname =
      context.internalPath === '/'
        ? `/${nextLocaleCookie}`
        : `/${nextLocaleCookie}${context.internalPath}`;
    return NextResponse.redirect(target, 307);
  }

  const authRedirect = await handleAuthRedirects(req, context);
  if (authRedirect) return authRedirect;

  // Serve the default locale from unprefixed URLs (localePrefix: 'as-needed') while
  // still routing into `app/[locale]/*` (which requires an internal locale segment).
  //
  // We intentionally bypass `next-intl` here because, under Next 16 Proxy, it can
  // respond with a self-redirect (307 to the same URL) for default-locale routes.
  if (!hasExplicitLocalePrefix && context.locale === routing.defaultLocale) {
    const target = new URL(req.url);
    target.pathname =
      context.internalPath === '/'
        ? `/${routing.defaultLocale}`
        : `/${routing.defaultLocale}${context.internalPath}`;
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set(INTERNAL_REWRITE_HEADER, '1');
    return NextResponse.rewrite(target, { request: { headers: requestHeaders } });
  }

  // next-intl will redirect away a superfluous default-locale prefix (e.g. `/es/...` → `/...`) when
  // `localePrefix: 'as-needed'`. That behavior is correct for user-facing URLs, but it breaks our
  // internal rewrites for default-locale, unprefixed routes by turning them into browser-visible
  // self-redirects (`Location: /iniciar-sesion`).
  //
  // For default-locale, locale-prefixed paths, we bypass next-intl and let the App Router resolve
  // `app/[locale]/*` directly.
  if (
    hasExplicitLocalePrefix &&
    context.locale === routing.defaultLocale &&
    req.headers.get(INTERNAL_REWRITE_HEADER) === '1'
  ) {
    return NextResponse.next();
  }

  return handleI18nRouting(req);
}
