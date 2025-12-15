# `use cache` Directive Family

Summary: pick the right directive based on dynamic API needs and sharing model.

## Comparison

| Directive              | Context             | Shares Cache | Dynamic APIs inside?                                 | Typical Use                                          |
| ---------------------- | ------------------- | ------------ | ---------------------------------------------------- | ---------------------------------------------------- |
| `'use cache'`          | Static (build time) | All users    | No                                                   | Public data identical for everyone                   |
| `'use cache: remote'`  | Dynamic (runtime)   | All users    | No (but works after reading headers/cookies outside) | Shared data in dynamic routes                        |
| `'use cache: private'` | Dynamic (runtime)   | Per-user     | Yes                                                  | User-specific data; requires `cacheComponents: true` |

## `'use cache'` (static build-time)

- For public data that does not depend on dynamic APIs.
- Cached at build; fastest option; shared across users.

```tsx
async function getBlogPosts() {
  'use cache';
  cacheTag('blog-posts');
  cacheLife('days');
  return db.posts.findMany();
}
```

## `'use cache: remote'` (runtime shared)

- For shared data in dynamic contexts (after `headers()`/`cookies()`).
- Cached at runtime; cannot read dynamic APIs inside the function—pass values as args.

```tsx
import { cacheLife, cacheTag } from 'next/cache';

async function getGlobalStats() {
  'use cache: remote';
  cacheTag('global-stats');
  cacheLife({ expire: 60 });
  return db.analytics.aggregate({ total_users: 'count' });
}
```

## `'use cache: private'` (per-user)

- For personalized data; can access `headers()`/`cookies()` inside.
- Requires `cacheComponents: true`; cached per-user; prefetch needs `cacheLife` with `stale` ≥ 30s.

```tsx
async function getUserRecommendations(productId: string) {
  'use cache: private';
  cacheTag(`recommendations-${productId}`);
  cacheLife({ stale: 60 });
  const sessionId = (await cookies()).get('session-id')?.value || 'guest';
  return getPersonalizedRecommendations(productId, sessionId);
}
```

## Nesting Rules

- Remote caches can nest inside other remote caches or regular `'use cache'` scopes.
- Remote caches cannot nest inside private caches, and private caches cannot nest inside remote caches.

```tsx
// INVALID: remote inside private
async function outerPrivate() {
  'use cache: private';
  return innerRemote(); // Error
}

async function innerRemote() {
  'use cache: remote';
  return getData();
}
```
