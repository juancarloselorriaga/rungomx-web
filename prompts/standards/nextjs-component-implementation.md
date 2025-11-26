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

## Next.js 16 Caching

**⚠️ IMPORTANT**: For comprehensive caching rules, patterns, and best practices, see **[nextjs-caching-rules.md](./nextjs-caching-rules.md)**.

This section provides quick reference only. The dedicated caching document covers:
- Four caching mechanisms (Request Memoization, Data Cache, Full Route Cache, Router Cache)
- `use cache` directive family (`'use cache'`, `'use cache: remote'`, `'use cache: private'`)
- Protected routes & authentication caching patterns
- Proxy vs. layout authentication security
- Cache invalidation & revalidation strategies
- Decision trees and verification checklists

### Quick Reference: Cache Directives

**Three variants based on context**:

| Directive | Context | Use Case | Can Access Dynamic APIs |
|-----------|---------|----------|------------------------|
| `'use cache'` | Static (build) | Public data, same for all users | ❌ No |
| `'use cache: remote'` | Dynamic (runtime) | Shared data in dynamic routes | ❌ No (but works after `headers()`) |
| `'use cache: private'` | Dynamic (runtime) | User-specific data | ✅ Yes |

**Example - Function-level caching**:
```tsx
import { cacheTag, cacheLife } from 'next/cache'

async function getProducts() {
  'use cache'
  cacheTag('products')
  cacheLife('hours')

  return db.products.findMany()
}
```

### Critical Rules

1. **Routes using `headers()` are dynamic** (Full Route Cache disabled)
2. **But data CAN still be cached** (Data Cache works independently!)
3. **Use `'use cache: remote'` in protected routes** for shared data
4. **Use `'use cache: private'` for user-specific data** in dynamic contexts
5. **Never use `headers()` inside cached functions** (pass as argument instead)

### Protected Routes Pattern

```tsx
// Layout makes route dynamic (uses headers for auth)
export default async function ProtectedLayout({ children }) {
  const session = await getSession() // Uses headers()
  if (!session) redirect('/sign-in')
  return <>{children}</>
}

// But pages can still cache data!
export default async function DashboardPage() {
  const stats = await getStats() // Uses 'use cache: remote'
  return <StatsDisplay stats={stats} />
}

async function getStats() {
  'use cache: remote' // Works even though route is dynamic!
  cacheTag('stats')
  cacheLife('minutes')
  return db.analytics.getStats()
}
```

**Key insight**: The page HTML is dynamic, but the data is cached. This is optimal!

### Dynamic APIs and Partial Prerendering (PPR)

- **Dynamic APIs** (`headers()`, `cookies()`, `searchParams`) opt routes into dynamic rendering
- **PPR** enables mixing static shell + dynamic sections via `<Suspense>`
- **Auth pattern**: Wrap user-specific components in `<Suspense>` for progressive rendering

```tsx
export default function Page() {
  return (
    <>
      {/* Static shell - cached */}
      <PublicHeader />

      {/* Dynamic content - streams in */}
      <Suspense fallback={<UserSkeleton />}>
        <UserProfile />
      </Suspense>
    </>
  )
}
```

### Request Memoization

Use React's `cache()` for deduplicating calls within a single render:

```tsx
import { cache } from 'react'

export const getUser = cache(async (id: string) => {
  return db.user.findUnique({ where: { id } })
})

// Called multiple times = executes once per request
const user1 = await getUser('123') // DB query
const user2 = await getUser('123') // From memory
```

**For complete caching documentation, see [nextjs-caching-rules.md](./nextjs-caching-rules.md)**

### Internationalization with 'use cache'

- **Context requirement**: `next-intl` APIs need the request locale available; call `setRequestLocale(locale)` before cached functions so translation hooks can run while keeping routes static
- **Setup**: Call `setRequestLocale(locale)` early in the route (layout/page) using the locale from `params`
- **Why**: Ensures the locale context is set for `next-intl` without forcing the route dynamic; avoids missing-locale errors
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
