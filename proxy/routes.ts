export const protectedRoutes = ['/dashboard', '/settings', '/profile'];
export const authRoutes = ['/sign-in', '/sign-up'];

export const isProtectedRoute = (internalPath: string) =>
  protectedRoutes.some((route) => internalPath.startsWith(route));

export const isAuthRoute = (internalPath: string) =>
  authRoutes.some((route) => internalPath.startsWith(route));
