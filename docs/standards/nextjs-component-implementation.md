## Next.js 16 Server & Client Components

### Server Components (Default)

- **All components are Server Components by default** in the App Router
- Server Components can be async functions to fetch data
- Can directly access backend resources (databases, file system, etc.)
- Reduce client-side JavaScript bundle size
- Cannot use React hooks (useState, useEffect, etc.)
- Cannot use browser-only APIs or event listeners
- Use async/await syntax for data fetching:
  ```tsx
  export default async function Page() {
    const data = await fetchData()
    return <div>{data}</div>
  }
  ```

### Client Components

- **Must** have `'use client'` directive at the top of the file
- Required for:
    - Interactive elements (onClick, onChange, etc.)
    - React hooks (useState, useEffect, useContext, etc.)
    - Browser-only APIs (localStorage, window, etc.)
    - Third-party libraries that depend on client-side features
- Cannot be async functions (use React's `use` hook for promises)
- Place `'use client'` as close to the leaf components as possible to minimize bundle size
- Example:
  ```tsx
  'use client'
  
  import { useState } from 'react'
  
  export default function Counter() {
    const [count, setCount] = useState(0)
    return <button onClick={() => setCount(count + 1)}>{count}</button>
  }
  ```

### Component Composition Patterns

- **Pass Server Components as children to Client Components**:
  ```tsx
  // Server Component
  import Modal from './modal' // Client Component
  import Cart from './cart'   // Server Component
  
  export default function Page() {
    return (
      <Modal>
        <Cart />
      </Modal>
    )
  }
  ```
- **Pass data from Server to Client Components via props**:
  ```tsx
  // Server Component
  export default async function Page({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const post = await getPost(id)
    return <LikeButton likes={post.likes} />
  }
  
  // Client Component (like-button.tsx)
  'use client'
  export default function LikeButton({ likes }: { likes: number }) {
    // ... interactive logic
  }
  ```
- **Minimize Client Components**: Only mark components as Client Components when they need
  interactivity

### Client Component Boundaries ("Holes" Pattern)

- **Client Components create boundaries** but can render Server Components via `children` prop
- This creates "holes" where Server Components can be passed through Client Component boundaries
- **Use case**: Providers, wrappers, layouts that need client features but should allow Server
  Components inside
- **Pattern**: Client wrapper accepts `children: React.ReactNode` and renders them
  ```tsx
  // components/providers/theme-provider.tsx (Client Component)
  'use client'
  import { ThemeProvider as NextThemesProvider } from 'next-themes'
  
  export function ThemeProvider({ 
    children, 
    ...props 
  }: React.ComponentProps<typeof NextThemesProvider>) {
    return <NextThemesProvider {...props}>{children}</NextThemesProvider>
  }
  
  // app/layout.tsx (Server Component wrapping Client wrapper with Server children)
  export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
      <html>
        <body>
          <ThemeProvider>{children}</ThemeProvider>
        </body>
      </html>
    )
  }
  ```
- **Key**: Server Components passed as `children` remain Server Components and are rendered on the
  server
- **Cannot**: Directly import Server Components inside Client Component files

## Next.js 16 Cache Components & Caching

### Cache Components with 'use cache' Directive

- **New in Next.js 15/16**: Cache component output and data fetching
- Can be applied at file, component, or function level
- Use with `cacheLife` and `cacheTag` for fine-grained control

#### File-level caching:

```tsx
'use cache'

export default async function Page() {
  const data = await fetchData()
  return <div>{data}</div>
}
```

#### Component-level caching:

```tsx
export async function MyComponent() {
  'use cache'
  const data = await fetchData()
  return <div>{data}</div>
}
```

#### Function-level caching (most common):

```tsx
import { cacheTag, cacheLife } from 'next/cache'

async function getProducts() {
  'use cache'
  cacheTag('products')
  cacheLife('hours')

  const products = await db.query('SELECT * FROM products')
  return products
}

export default async function Page() {
  const products = await getProducts()
  return <ProductList products={products}/>
}
```

### cacheLife Profiles

- **Preset profiles**: 'seconds', 'minutes', 'hours', 'days', 'weeks', 'max'
- **Custom configuration**:
  ```tsx
  cacheLife({
    stale: 60,      // Consider stale after 60 seconds
    revalidate: 300, // Background revalidate after 5 minutes
    expire: 3600    // Hard expire after 1 hour
  })
  ```
- Use appropriate profile based on data update frequency:
    - Blog posts: `cacheLife('days')`
    - User stats: `cacheLife('minutes')`
    - Static content: `cacheLife('weeks')` or `cacheLife('max')`

### cacheTag for On-Demand Revalidation

- Tag cached data for targeted invalidation
- Use with `revalidateTag()` in Server Actions or Route Handlers
- Example:
  ```tsx
  import { cacheTag } from 'next/cache'
  
  async function getPosts() {
    'use cache'
    cacheTag('blog-posts')
    return await db.posts.findMany()
  }
  
  // In Server Action:
  // await revalidateTag('blog-posts')
  ```

### Private Cache ('use cache: private')

- **For user-specific data** (personalized content)
- Can access cookies and headers
- Caches per-user instead of globally
- Example:
  ```tsx
  import { cookies } from 'next/headers'
  import { cacheLife, cacheTag } from 'next/cache'
  
  async function getRecommendations(productId: string) {
    'use cache: private'
    cacheTag(`recommendations-${productId}`)
    cacheLife({ stale: 60 })
    
    const sessionId = (await cookies()).get('session-id')?.value || 'guest'
    return getPersonalizedRecommendations(productId, sessionId)
  }
  ```

### Remote Cache ('use cache: remote')

- **For expensive operations in dynamic contexts**
- Shares cache across all users and requests
- Use after dynamic checks (auth, feature flags)
- Example:
  ```tsx
  import { connection } from 'next/server'
  import { cacheLife, cacheTag } from 'next/cache'
  
  async function generateReport() {
    'use cache: remote'
    cacheTag('global-stats')
    cacheLife({ expire: 3600 }) // 1 hour
    
    const data = await db.transactions.findMany()
    return calculateExpensiveStats(data)
  }
  
  export default async function Page() {
    await connection() // Makes context dynamic
    const stats = await generateReport()
    return <StatsDisplay stats={stats} />
  }
  ```

### React cache() for Request Memoization

- Use `cache()` from React for deduplicating requests within a single render
- Different from Next.js caching (request-scoped vs persistent)
- Useful for database clients or third-party libraries:
  ```tsx
  import { cache } from 'react'
  import db from '@/lib/db'
  
  export const getItem = cache(async (id: string) => {
    const item = await db.item.findUnique({ id })
    return item
  })
  ```

### fetch() Caching

- Individual fetch requests can be cached:
  ```tsx
  // Force cache
  fetch('https://...', { cache: 'force-cache' })
  
  // No cache
  fetch('https://...', { cache: 'no-store' })
  ```
- Configure default behavior via route segment config:
  ```tsx
  export const fetchCache = 'default-no-store' // Opt out by default
  export const dynamic = 'force-dynamic'       // Force dynamic rendering
  ```

### Caching Best Practices

- **Prefer 'use cache' over route segment config** for granular control
- **Use cacheTag** for all data that might need on-demand revalidation
- **Choose appropriate cacheLife** based on data freshness requirements
- **Use 'private' cache** for personalized data
- **Use 'remote' cache** for expensive operations in dynamic contexts
- **Combine with React Suspense** for streaming and progressive rendering

### Internationalization with 'use cache'

- **Context requirement**: Cached functions need locale context when using next-intl
- **Setup**: Call `setRequestLocale(locale)` before using cached functions
- **Why**: Ensures cached content is keyed per locale, preventing cross-locale cache pollution
- Example pattern:

```tsx
  import { setRequestLocale } from 'next-intl/server'
import { cacheLife, cacheTag } from 'next/cache'

// Utility to configure locale for caching
async function configPageLocale(params: { locale: string }) {
  const { locale } = await params
  setRequestLocale(locale) // Required for 'use cache' with i18n
  return { locale }
}

// Cached function with locale awareness
async function getLocalizedContent(slug: string) {
  'use cache'
  cacheTag('content')
  cacheLife('hours')

  const t = await getTranslations()
  return await db.content.findUnique({ where: { slug } })
}

// Page component
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  await configPageLocale(params) // Must call before cached functions
  const content = await getLocalizedContent('about')
  return <div>{content}</div>
}
```

- **Without `setRequestLocale()`**: Cached content won't be locale-specific, causing wrong
  translations and errors in the console
- **Best practice**: Always call locale config function at the top of internationalized pages using
  caching