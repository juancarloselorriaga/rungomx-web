import { getSessionCookie } from 'better-auth/cookies';
import { NextRequest, NextResponse } from 'next/server';
import { buildRedirectUrl, type RequestContext } from './localization';
import { isAuthRoute, isProtectedRoute } from './routes';

export const handleAuthRedirects = async (req: NextRequest, context: RequestContext) => {
  const sessionCookie = getSessionCookie(req);
  // Optimistic check only; protected routes must still call auth.api.getSession()
  const hasSessionCookie = Boolean(sessionCookie);

  if (isProtectedRoute(context.internalPath) && !hasSessionCookie) {
    const redirectUrl = buildRedirectUrl(req, '/sign-in', context.locale);
    // Preserve the originally requested path (without locale prefix) so the client router can
    // re-apply the current locale and navigate back correctly after authentication.
    // Using `internalPath` here would include template segments like `[eventId]`, which breaks
    // redirects after sign-in and can lead to redirect loops.
    redirectUrl.searchParams.set('callbackURL', `${context.pathnameWithoutLocale}${req.nextUrl.search}`);
    return NextResponse.redirect(redirectUrl);
  }

  if (isAuthRoute(context.internalPath) && hasSessionCookie) {
    return NextResponse.redirect(buildRedirectUrl(req, '/dashboard', context.locale));
  }

  return null;
};
