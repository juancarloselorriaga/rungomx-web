# Critical Rules: What Can/Cannot Be Cached

Summary: clarifies what remains cacheable even in dynamic routes and what is blocked.

## ✅ Still Cacheable (even when route is dynamic)

1. Database queries via `'use cache: remote'`

```tsx
async function getProducts() {
  'use cache: remote';
  cacheTag('products');
  cacheLife('hours');
  return db.products.findMany();
}
```

2. API calls via `fetch()` with cache options

```tsx
const data = await fetch('https://api.example.com/data', {
  next: { revalidate: 60, tags: ['api-data'] },
});
```

3. Expensive computations via `'use cache: remote'`

```tsx
async function generateReport() {
  'use cache: remote';
  cacheLife({ expire: 3600 });
  return calculateComplexStats();
}
```

4. User-specific data via `'use cache: private'`

```tsx
async function getUserPreferences() {
  'use cache: private';
  cacheLife({ expire: 300 });
  const userId = (await getCurrentUser())?.id;
  return db.preferences.findUnique({ where: { userId } });
}
```

## ❌ Not Cacheable

- Routes using Dynamic APIs (`headers()`, `cookies()`, `searchParams`, `connection()`) disable Full Route Cache (HTML) but Data Cache can still work if used correctly.
- Do not call dynamic APIs inside `'use cache'` scopes; read them outside and pass values in.

```tsx
// ❌ Invalid: dynamic API inside cache scope
async function getData() {
  'use cache';
  const headersList = await headers();
  return fetchData(headersList.get('user-agent'));
}

// ✅ Pass dynamic inputs from outside
const headersList = await headers();
const data = await getData(headersList.get('user-agent'));
```

- Functions marked with `unstable_noStore()` and routes with `dynamic = 'force-dynamic'` opt out of Data Cache and Full Route Cache.
