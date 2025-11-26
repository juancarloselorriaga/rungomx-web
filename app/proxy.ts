import { NextRequest } from 'next/server';
import { handleAuthRedirects } from '@/proxy/auth-guard';
import { handleI18nRouting } from '@/proxy/i18n';
import {
  buildRequestContext,
  getPreferredLocaleRedirect,
  getTrailingSlashRedirect,
} from '@/proxy/localization';

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

export async function proxy(req: NextRequest) {
  const trailingSlashRedirect = getTrailingSlashRedirect(req);
  if (trailingSlashRedirect) return trailingSlashRedirect;

  const preferredLocaleRedirect = getPreferredLocaleRedirect(req);
  if (preferredLocaleRedirect) return preferredLocaleRedirect;

  const context = buildRequestContext(req);
  const i18nResponse = handleI18nRouting(req);

  const authRedirect = await handleAuthRedirects(req, context);
  if (authRedirect) return authRedirect;

  return i18nResponse;
}
