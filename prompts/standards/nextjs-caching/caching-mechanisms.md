# Caching Mechanisms

Summary: outlines the four independent caches in Next.js 16 and when they apply.

## Request Memoization (React Feature)

- Dedupes function calls within the same render pass.
- Applies to `GET` fetches and functions wrapped in React `cache()` inside the React tree.
- Does not apply to Route Handlers or non-GET fetch requests.

```tsx
import { cache } from 'react';

export const getUser = cache(async (id: string) => {
  return db.user.findUnique({ where: { id } });
});

const user1 = await getUser('123'); // DB query
const user2 = await getUser('123'); // From memory
```

## Data Cache

- Persists data fetching results across requests and deployments.
- Works with `fetch()` or `'use cache'` directives; survives deployments; revalidates via time or tags.

```tsx
const res = await fetch('https://api.example.com/data', {
  next: { revalidate: 3600 },
});

async function getData() {
  'use cache';
  cacheLife('hours');
  cacheTag('api-data');
  return await db.query();
}
```

## Full Route Cache

- Caches rendered HTML + RSC payload across requests; cleared on deploy.
- Cached when no dynamic APIs (`headers()`, `cookies()`, `searchParams`) are used and data is cached.
- Disabled by dynamic APIs, `dynamic = 'force-dynamic'`, or `revalidate = 0`.
- Data Cache still works even when Full Route Cache is disabled.

## Router Cache (Client-side)

- Stores RSC payload for visited routes in browser memory for instant navigation.
- Layouts cached ~5 minutes; pages reused mainly for back/forward.
- Invalidated by `router.refresh()`, `revalidatePath()`, `revalidateTag()`, or hard refresh.
