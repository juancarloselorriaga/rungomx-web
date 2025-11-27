# Patterns & Decision Tree

Summary: choose directives via the decision tree, then apply common patterns.

## Decision tree
```
Need headers()/cookies()/searchParams inside the function?
├─ YES → 'use cache: private' (per-user)
└─ NO → Is the route/context already dynamic (headers elsewhere)?
    ├─ YES → 'use cache: remote' (shared runtime)
    └─ NO  → 'use cache' (static build-time)
```

## Pattern 1: Public page with personalized section
- Static shell uses `'use cache'`; personalized islands use dynamic APIs.
```tsx
async function getFeatures() {
  'use cache'
  cacheTag('features')
  cacheLife('days')
  return db.features.findMany()
}
```

## Pattern 2: Protected route with cached data
- Layout auth makes route dynamic; shared data uses `'use cache: remote'`.
```tsx
async function getStats() {
  'use cache: remote'
  cacheTag('dashboard-stats')
  cacheLife('minutes')
  return db.analytics.aggregate({ /* ... */ })
}
```

## Pattern 3: Mixed strategies
- Combine static product info, shared runtime pricing, and per-user recommendations.
```tsx
async function getProductPrice(id: string) {
  'use cache: remote'
  cacheTag(`product-price-${id}`)
  cacheLife({ expire: 300 })
  await connection()
  return db.products.getPrice(id)
}
```

## Pattern 4: Database query with invalidation
- Tag list + item; invalidate on mutations.
```tsx
export async function getAllPosts() {
  'use cache'
  cacheTag('posts', 'blog')
  cacheLife('hours')
  return db.posts.findMany({ orderBy: { date: 'desc' } })
}

'use server'
export async function updatePost(slug: string, data: FormData) {
  await db.posts.update({ /* ... */ })
  revalidateTag(`post-${slug}`)
  revalidateTag('posts')
}
```
