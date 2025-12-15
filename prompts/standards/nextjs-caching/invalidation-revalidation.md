# Cache Invalidation & Revalidation

Summary: use `cacheLife` for time-based expiry, `cacheTag` + `revalidateTag` for on-demand, and understand cache interactions.

## Time-based (`cacheLife`)

```tsx
async function getData() {
  'use cache';
  cacheLife({
    stale: 60, // consider stale after 60s
    revalidate: 300, // background revalidate every 5min
    expire: 3600, // hard expire after 1h
  });
  return fetchData();
}

// Presets: 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'max'
```

## On-demand (`cacheTag` + `revalidateTag`)

```tsx
async function getPosts() {
  'use cache';
  cacheTag('blog-posts');
  return db.posts.findMany();
}

('use server');
import { revalidateTag } from 'next/cache';

export async function createPost(data: FormData) {
  await db.posts.create({
    /* ... */
  });
  revalidateTag('blog-posts');
}
```

### Multiple tags and path revalidation

```tsx
cacheTag('products', `product-${id}`);
revalidateTag('products'); // all products
revalidateTag(`product-${id}`); // single product

revalidatePath('/dashboard'); // invalidate route cache
revalidatePath('/dashboard', 'layout'); // whole subtree
```

## Cache relationships

1. `revalidateTag()` invalidates Data Cache and any dependent Full Route Cache entries.
2. `revalidatePath()` invalidates Full Route Cache only; Data Cache is untouched.
3. Router Cache clears on `revalidatePath()`/`revalidateTag()` from Server Actions, `router.refresh()`, or hard refresh (not from Route Handlers alone).
