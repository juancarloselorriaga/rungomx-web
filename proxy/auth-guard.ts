import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { buildRedirectUrl, type RequestContext } from './localization';
import { isAuthRoute, isProtectedRoute } from './routes';

export const handleAuthRedirects = async (req: NextRequest, context: RequestContext) => {
  const session = await auth.api.getSession({
    headers: req.headers,
  });
  const isAuthenticated = !!session;

  if (isProtectedRoute(context.internalPath) && !isAuthenticated) {
    return NextResponse.redirect(buildRedirectUrl(req, '/sign-in', context.locale));
  }

  if (isAuthRoute(context.internalPath) && isAuthenticated) {
    return NextResponse.redirect(buildRedirectUrl(req, '/dashboard', context.locale));
  }

  return null;
};
