import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

// Define protected and auth-only routes
const protectedRoutes = ['/dashboard', '/settings', '/profile', '/team'];
const authRoutes = ['/sign-in', '/sign-up'];

export async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;

  // Check if the current route is protected or auth-only
  const isProtectedRoute = protectedRoutes.some(route => path.startsWith(route));
  const isAuthRoute = authRoutes.some(route => path.startsWith(route));

  // Get session from cookies
  // TODO: Implement proper session decryption when authentication is set up
  const cookieStore = await cookies();
  const session = cookieStore.get('session')?.value;

  // For now, we'll treat any session cookie as authenticated
  // Replace this with proper session validation when auth is implemented
  const isAuthenticated = !!session;

  // Redirect unauthenticated users trying to access protected routes
  if (isProtectedRoute && !isAuthenticated) {
    return NextResponse.redirect(new URL('/sign-in', req.nextUrl));
  }

  // Redirect authenticated users trying to access auth pages
  if (isAuthRoute && isAuthenticated) {
    return NextResponse.redirect(new URL('/dashboard', req.nextUrl));
  }

  return NextResponse.next();
}

// Configure which routes the middleware should run on
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (images, etc.)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
