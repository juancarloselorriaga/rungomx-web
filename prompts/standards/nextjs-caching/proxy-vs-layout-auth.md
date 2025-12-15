# Proxy vs Layout Authentication

Summary: proxy/middleware is for UX (fast redirects), layouts are the real security boundary. Always keep both for defense-in-depth.

## Two-layer flow

```
Request → Proxy (optimistic redirect; not secure) → Protected Layout (real auth) → Page
```

### Layer 1: Proxy (UX optimization)

- Redirects early based on cookie/session check; improves perceived speed.
- Cookie-only checks are insecure; prefer `auth.api.getSession({ headers: request.headers })` when feasible.

```tsx
export async function proxy(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session && request.nextUrl.pathname.startsWith('/dashboard')) {
    return NextResponse.redirect(new URL('/sign-in', request.url));
  }
  return NextResponse.next();
}
```

### Layer 2: Protected Layout (real security)

- Validates session server-side using `headers()` on every request.
- Makes the route dynamic (disables Full Route Cache) but Data Cache still works.

```tsx
export default async function ProtectedLayout({ children }) {
  const session = await getSession(); // uses headers()
  if (!session) redirect('/sign-in');
  return <>{children}</>;
}
```

### Caching implications

- Proxy does not affect caching.
- Layout auth uses dynamic APIs → Full Route Cache disabled; Data Cache remains available via `'use cache: remote'` or `'use cache: private'`.

### Rules of thumb

1. Never rely on proxy alone for security.
2. Always validate in protected layouts.
3. Use proxy solely to avoid page flashes and wasted rendering.
4. Use React `cache()` for session helpers to dedupe validations per request.
