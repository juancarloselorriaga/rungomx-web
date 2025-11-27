# Verification Checklist

Summary: quick review list to validate caching choices.

## General
- Identify cache type needed: Request Memoization, Data Cache, Full Route Cache, Router Cache.
- Check for dynamic APIs (`headers()`, `cookies()`, `searchParams`).
- Pick correct directive (`'use cache'`, `'use cache: remote'`, `'use cache: private'`).
- Set appropriate `cacheLife`; tag cached data; verify sharing scope.

## Protected routes
- Layout auth present (makes route dynamic).
- Shared data uses `'use cache: remote'`; personalized uses `'use cache: private'`.
- Avoid double-caching mistakes; use `<Suspense>` for progressive rendering.

## Authentication security
- Two-layer auth (proxy + layout) is intentional.
- Proxy is UX only; layout validates with `auth.api.getSession()` + `headers()`.
- Use React `cache()` for session helpers; never rely on proxy alone.

## Data fetching
- `fetch()` uses `next.revalidate` and `next.tags` when appropriate.
- Database queries/expensive computations wrapped in the right cache directive.

## Cache invalidation
- Tags defined with sensible granularity.
- Mutations call `revalidateTag`/`revalidatePath` correctly.
- Strategy chosen: time-based, on-demand, or both.

## Performance
- Avoid over/under-caching; monitor hit rate and private cache size.
- Common pitfalls avoided: dynamic APIs inside cache scope, wrong directive in dynamic context, untagged caches, `dynamic = 'force-dynamic'` misuse, assuming protected routes cannot cache data.
