# Next.js 16 Caching Rules & Best Practices

**Purpose**: Reference guide for AI agents implementing caching in Next.js 16 App Router with Cache Components.

**Context**: Next.js 16 has four distinct caching mechanisms. Understanding which cache to use and when is critical for optimal performance.

---

## Table of Contents

1. [Four Caching Mechanisms](#four-caching-mechanisms)
2. [Critical Rules: What Can/Cannot Be Cached](#critical-rules-what-cancannot-be-cached)
3. [The `use cache` Directive Family](#the-use-cache-directive-family)
4. [Protected Routes & Authentication Caching](#protected-routes--authentication-caching)
5. [Proxy vs Layout Authentication (Security Pattern)](#proxy-vs-layout-authentication-security-pattern)
6. [Cache Invalidation & Revalidation](#cache-invalidation--revalidation)
7. [Common Patterns & Decision Tree](#common-patterns--decision-tree)
8. [Verification Checklist](#verification-checklist)

---

## Four Caching Mechanisms

Next.js 16 provides four independent caching layers. Each serves a different purpose:

| Cache Mechanism | What It Caches | Scope | Duration | Location |
|----------------|---------------|-------|----------|----------|
| **Request Memoization** | Function return values | Single request | Per-request lifecycle | Server memory |
| **Data Cache** | Data fetching results | Across requests & deployments | Persistent (until invalidated) | Server |
| **Full Route Cache** | Rendered HTML + RSC payload | Across requests | Persistent (cleared on deploy) | Server |
| **Router Cache** | RSC payload | Client-side navigation | User session or time-based | Client memory |

### Request Memoization (React Feature)

**What**: Deduplicates function calls within the same render pass.

**How it works**:
- First call: Executes function, stores result in memory
- Subsequent calls: Returns cached result without executing
- Cleared after render pass completes

**Applies to**:
- ✅ `fetch` requests with `GET` method
- ✅ Functions wrapped in React's `cache()`
- ✅ Within React component tree only

**Does NOT apply to**:
- ❌ Route Handlers (not part of React tree)
- ❌ Non-GET fetch requests

**Usage**:
```tsx
import { cache } from 'react'

// Deduplicate database calls within a single request
export const getUser = cache(async (id: string) => {
  return db.user.findUnique({ where: { id } })
})

// Called multiple times in components = executes once
const user1 = await getUser('123') // DB query
const user2 = await getUser('123') // From memory
```

### Data Cache

**What**: Persists data fetching results across requests and deployments.

**How it works**:
- Stores results from `fetch()` or `'use cache'` functions
- Survives across requests and deployments
- Can be revalidated time-based or on-demand

**Key characteristics**:
- **Persistent**: Data survives deployments
- **Revalidatable**: Can be invalidated with `revalidateTag()` or `revalidatePath()`
- **Independent**: Works even when Full Route Cache is disabled

**Usage**:
```tsx
// Automatic caching with fetch
const res = await fetch('https://api.example.com/data', {
  next: { revalidate: 3600 } // Revalidate every hour
})

// Or with 'use cache' directive
async function getData() {
  'use cache'
  cacheLife('hours')
  cacheTag('api-data')

  return await db.query()
}
```

### Full Route Cache

**What**: Caches the entire rendered output (HTML + RSC payload) of a route.

**How it works**:
- Caches statically rendered routes at build time
- Reduces rendering cost on subsequent requests
- **Cleared on every deployment** (unlike Data Cache)

**Routes are cached when**:
- ✅ No Dynamic APIs used (`headers()`, `cookies()`, `searchParams`)
- ✅ All data fetching is cached
- ✅ No `dynamic = 'force-dynamic'` config

**Routes are NOT cached when**:
- ❌ Using `headers()`, `cookies()`, or `searchParams`
- ❌ Using `dynamic = 'force-dynamic'`
- ❌ Using `revalidate = 0`

**Important**: When Full Route Cache is disabled (dynamic rendering), the Data Cache still works!

### Router Cache (Client-side)

**What**: Client-side cache of visited routes for instant navigation.

**How it works**:
- Stores RSC payload in browser memory
- Enables instant back/forward navigation
- Prefetches linked routes

**Default behavior**:
- Layouts: Cached for 5 minutes
- Pages: Not cached (reused for browser back/forward only)
- Loading states: Cached for instant display

**Can be invalidated**:
- `router.refresh()` - Clears cache, makes new request
- `revalidatePath()` / `revalidateTag()` in Server Actions
- Hard refresh

---

## Critical Rules: What Can/Cannot Be Cached

### ✅ CAN Be Cached (Even in Dynamic Routes)

**Data Cache works independently of route rendering!**

Even if a route is dynamically rendered (uses `headers()`), you can still cache:

1. **Database queries** (via `'use cache: remote'`)
   ```tsx
   async function getProducts() {
     'use cache: remote'
     cacheTag('products')
     cacheLife('hours')

     return db.products.findMany()
   }
   ```

2. **API calls** (via `fetch()` with cache options)
   ```tsx
   const data = await fetch('https://api.example.com/data', {
     next: { revalidate: 60, tags: ['api-data'] }
   })
   ```

3. **Computed/expensive operations** (via `'use cache: remote'`)
   ```tsx
   async function generateReport() {
     'use cache: remote'
     cacheLife({ expire: 3600 })

     // Expensive calculation
     return calculateComplexStats()
   }
   ```

4. **User-specific data** (via `'use cache: private'`)
   ```tsx
   async function getUserPreferences() {
     'use cache: private'
     cacheLife({ expire: 300 })

     const userId = (await getCurrentUser())?.id
     return db.preferences.findUnique({ where: { userId } })
   }
   ```

### ❌ CANNOT Be Cached

1. **Routes using Dynamic APIs** (Full Route Cache disabled, but Data Cache still works!)
   - Routes calling `headers()`
   - Routes calling `cookies()`
   - Routes using `searchParams` prop
   - Routes calling `connection()`

2. **Dynamic APIs inside cached functions**
   ```tsx
   // ❌ WRONG - Cannot use headers() inside 'use cache'
   async function getData() {
     'use cache'
     const headersList = await headers() // ERROR!
     return fetchData()
   }

   // ✅ CORRECT - Pass dynamic data as argument
   async function getData(userAgent: string) {
     'use cache'
     return fetchData(userAgent)
   }

   // Then call it outside cache scope:
   const headersList = await headers()
   const data = await getData(headersList.get('user-agent'))
   ```

3. **Functions marked with `unstable_noStore()`**

4. **Routes with `dynamic = 'force-dynamic'`** (opts out of Full Route Cache AND Data Cache)

---

## The `use cache` Directive Family

Next.js 16 provides three variants of the `use cache` directive. Choose based on your context:

**Config requirement**: `'use cache: private'` needs `cacheComponents: true` in `next.config.ts` to enable private caching.

### Comparison Table

| Directive | Context | Shares Cache | Access Dynamic APIs | Use Case |
|-----------|---------|--------------|-------------------|----------|
| `'use cache'` | Static (build time) | All users | ❌ No | Public, static data |
| `'use cache: remote'` | Dynamic (runtime) | All users | ❌ No (but works after `headers()`/`cookies()`) | Shared data in dynamic routes |
| `'use cache: private'` | Dynamic (runtime) | Per-user | ✅ Yes | User-specific data |

### 1. `'use cache'` - Static Build-Time Caching

**When to use**:
- Data that doesn't change per-request
- Public data identical for all users
- Can be prerendered at build time

**Characteristics**:
- ✅ Cached at build time
- ✅ Shared across all users
- ❌ Cannot use `headers()`, `cookies()`, `searchParams`
- ✅ Fastest option (no runtime overhead)

**Example**:
```tsx
import { cacheTag, cacheLife } from 'next/cache'

async function getBlogPosts() {
  'use cache'
  cacheTag('blog-posts')
  cacheLife('days')

  return db.posts.findMany()
}

export default async function BlogPage() {
  const posts = await getBlogPosts()
  return <PostsList posts={posts} />
}
```

### 2. `'use cache: remote'` - Runtime Shared Caching

**When to use**:
- Data is same for all users but route is dynamic
- After calling `headers()`, `cookies()`, or `connection()`
- Expensive operations you want to cache across users

**Characteristics**:
- ✅ Works in dynamic contexts (after `headers()`/`cookies()`)
- ✅ Cached at runtime in server-side cache handler
- ✅ Shared across all users
- ❌ Cannot access `headers()`/`cookies()` inside the function
- ✅ If you need header/cookie values, read them outside and pass as args
- ✅ Reduces database/API load significantly

**Example**:
```tsx
import { connection } from 'next/server'
import { cacheLife, cacheTag } from 'next/cache'

// This route is dynamic (uses headers for auth)
export default async function DashboardPage() {
  await connection() // Makes context dynamic

  // But we can still cache shared data!
  const stats = await getGlobalStats()

  return <StatsDisplay stats={stats} />
}

async function getGlobalStats() {
  'use cache: remote'
  cacheTag('global-stats')
  cacheLife({ expire: 60 }) // 1 minute

  // This query is cached and shared across all authenticated users
  return db.analytics.aggregate({
    total_users: 'count',
    active_sessions: 'count',
  })
}
```

**Critical for protected routes**: When your layout uses `headers()` for authentication, the entire route becomes dynamic. But you can still cache data with `'use cache: remote'`!

### 3. `'use cache: private'` - Per-User Caching

**When to use**:
- User-specific/personalized data
- Data depends on `cookies()` or `headers()`
- Need to cache per-user without leaking between users

**Characteristics**:
- ✅ Requires `cacheComponents: true` in `next.config.ts`
- ✅ Can access `cookies()` and `headers()` inside function
- ✅ Cached per-user (isolated)
- ✅ Reduces database load for user-specific queries
- ⚠️ Runtime prefetch requires `cacheLife` with `stale` ≥ 30 seconds
- ❌ Not shared between users (higher cache size)

**Example**:
```tsx
import { cookies } from 'next/headers'
import { cacheLife, cacheTag } from 'next/cache'

async function getUserRecommendations(productId: string) {
  'use cache: private'
  cacheTag(`recommendations-${productId}`)
  cacheLife({ stale: 60 })

  const sessionId = (await cookies()).get('session-id')?.value || 'guest'

  // This is cached per-user, never shared
  return getPersonalizedRecommendations(productId, sessionId)
}

export default async function ProductPage({ params }) {
  const { id } = await params
  const recommendations = await getUserRecommendations(id)

  return <Recommendations items={recommendations} />
}

### Directive Nesting Rules

- Remote caches can nest inside other remote caches or regular `'use cache'` scopes.
- Remote caches cannot nest inside private caches, and private caches cannot nest inside remote caches.

```tsx
// INVALID: remote inside private
async function outerPrivate() {
  'use cache: private'
  return innerRemote() // Error
}

async function innerRemote() {
  'use cache: remote'
  return getData()
}

// VALID: remote inside remote
async function outerRemote() {
  'use cache: remote'
  return innerRemote()
}
```
```

---

## Protected Routes & Authentication Caching

This is the most common confusion point. Here's the definitive guide:

### The Scenario

You have protected routes that:
1. Check authentication in layout (uses `headers()` or `cookies()`)
2. Fetch data that doesn't depend on user identity
3. Want to cache that data to reduce database load

### What Happens

```tsx
// app/[locale]/(protected)/layout.tsx
import { getSession } from '@/lib/auth/server'
import { redirect } from 'next/navigation'

export default async function ProtectedLayout({ children }) {
  const session = await getSession() // Uses headers()

  if (!session) {
    redirect('/sign-in')
  }

  return <>{children}</>
}
```

**Result**: All routes under `(protected)/` are **dynamically rendered** (Full Route Cache disabled).

**Question**: Can I cache data in these routes?

**Answer**: **YES! Absolutely!**

### How to Cache Data in Protected Routes

Use `'use cache: remote'` for shared data:

```tsx
// app/[locale]/(protected)/events/page.tsx
import { Suspense } from 'react'
import { cacheLife, cacheTag } from 'next/cache'

// ✅ This data IS CACHED even though route is protected
async function getEvents() {
  'use cache: remote'
  cacheTag('events')
  cacheLife('hours')

  return db.events.findMany()
}

// ✅ Also cached (shared across all authenticated users)
async function getEventStats() {
  'use cache: remote'
  cacheTag('event-stats')
  cacheLife({ expire: 300 }) // 5 minutes

  return db.events.aggregate({ count: true })
}

export default async function EventsPage() {
  return (
    <div>
      <h1>Events</h1>

      {/* Cached data */}
      <Suspense fallback={<EventsSkeleton />}>
        <EventsList />
      </Suspense>

      {/* Also cached */}
      <Suspense fallback={<StatsSkeleton />}>
        <EventStats />
      </Suspense>
    </div>
  )
}

async function EventsList() {
  const events = await getEvents()
  return <div>{/* Render events */}</div>
}

async function EventStats() {
  const stats = await getEventStats()
  return <div>Total: {stats.count}</div>
}
```

### User-Specific Data in Protected Routes

Use `'use cache: private'` for user-specific data:

```tsx
import { getCurrentUser } from '@/lib/auth/server'
import { cacheLife } from 'next/cache'

// ✅ Cached per-user
async function getUserRegisteredEvents() {
  'use cache: private'
  cacheLife({ expire: 60 }) // 1 minute

  const userId = (await getCurrentUser())?.id
  return db.registrations.findMany({ where: { userId } })
}

export default async function MyEventsPage() {
  const myEvents = await getUserRegisteredEvents()

  return (
    <div>
      <h1>My Events</h1>
      <EventsList events={myEvents} />
    </div>
  )
}
```

### Key Insight: Two Types of Caching

| Cache Type | Disabled in Protected Routes? | Solution |
|-----------|------------------------------|----------|
| **Full Route Cache** (HTML) | ❌ Yes (route uses `headers()`) | Accept it - this is correct for auth |
| **Data Cache** (data) | ✅ No (works independently!) | Use `'use cache: remote'` or `'use cache: private'` |

**The page HTML is dynamic, but the data is cached. This is optimal!**

### Performance Impact Example

100 users visiting the same event detail page in a protected route:

**Without data caching**:
- Database queries: 100
- Response time: ~200ms each

**With `'use cache: remote'`**:
- Database queries: 1 (first request only)
- Response time: ~10ms (after first)
- **Savings: 99% reduction in DB queries**

---

## Proxy vs Layout Authentication (Security Pattern)

**Critical Security Concept**: Understand the difference between proxy-level checks and layout-level authentication.

### Defense-in-Depth: Two-Layer Authentication

This project uses **both** proxy and layout authentication for security:

```
Request Flow:
┌─────────────┐
│   Request   │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────────┐
│   Proxy (middleware.ts/proxy.ts)    │ ◄── Layer 1: Optimistic Redirect
│   - Cookie check only                │     (NOT SECURE)
│   - Fast redirect to /sign-in        │
│   - UX optimization                   │
└──────┬──────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────┐
│   Protected Layout                   │ ◄── Layer 2: Real Security
│   - auth.api.getSession() with       │     (SECURE)
│     headers()                         │
│   - Validates session server-side    │
│   - Redirect if invalid               │
└──────┬──────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────┐
│   Protected Page Content             │
└─────────────────────────────────────┘
```

### Layer 1: Proxy (Optimistic Redirect)

**Purpose**: Fast UX - redirect unauthenticated users before rendering starts.

**Security Level**: ⚠️ **NOT SECURE** - Cookie can be faked!

**Implementation with Better Auth**:

```tsx
// proxy.ts or middleware.ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

export async function proxy(request: NextRequest) {
  // Option 1: Using Better Auth's session validation
  const session = await auth.api.getSession({
    headers: request.headers,
  })

  if (!session && request.nextUrl.pathname.startsWith('/dashboard')) {
    return NextResponse.redirect(new URL('/sign-in', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|.*\\.png$).*)']
}
```

**Alternative (Cookie-based - faster but less secure)**:

```tsx
import { NextRequest, NextResponse } from 'next/server'
import { getSessionCookie } from 'better-auth/cookies'

export async function proxy(request: NextRequest) {
  const sessionCookie = getSessionCookie(request)

  // WARNING: THIS IS NOT SECURE!
  // Anyone can manually create a cookie to bypass this check
  if (!sessionCookie && request.nextUrl.pathname.startsWith('/dashboard')) {
    return NextResponse.redirect(new URL('/sign-in', request.url))
  }

  return NextResponse.next()
}
```

**Why cookie-only is insecure**:
- User can manually create a cookie named `session_token` with any value
- Proxy sees cookie exists → allows access
- Layout validates → finds invalid session → redirects
- **Result**: User sees protected page flash before redirect (poor UX + security issue)

**When to use full session validation in proxy**:
- ✅ When you want to avoid page flashing
- ✅ When the performance cost is acceptable
- ✅ Production deployments (better UX)

**When cookie-only might be acceptable**:
- ✅ Development only
- ✅ Very high traffic (reduce proxy overhead)
- ✅ When layout validation is always present (defense-in-depth)

### Layer 2: Protected Layout (Real Security)

**Purpose**: **Actual security** - validate session server-side before rendering.

**Security Level**: ✅ **SECURE** - Server-side session validation

**Implementation**:

```tsx
// app/[locale]/(protected)/layout.tsx
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // This is the REAL security check
  const session = await auth.api.getSession({
    headers: await headers()
  })

  if (!session) {
    redirect('/sign-in')
  }

  // Session is valid - render protected content
  return <>{children}</>
}
```

**Why this is secure**:
- Uses `auth.api.getSession()` with actual request headers
- Validates session server-side against database/session store
- Cannot be bypassed by faking cookies
- Runs on **every request** to protected routes

**Helper pattern** (recommended):

```tsx
// lib/auth/server.ts
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'
import { cache } from 'react'

export const getSession = cache(async () => {
  return await auth.api.getSession({
    headers: await headers(),
  })
})

export const getCurrentUser = cache(async () => {
  const session = await getSession()
  return session?.user ?? null
})

// app/[locale]/(protected)/layout.tsx
import { getSession } from '@/lib/auth/server'
import { redirect } from 'next/navigation'

export default async function ProtectedLayout({ children }) {
  const session = await getSession()

  if (!session) {
    redirect('/sign-in')
  }

  return <>{children}</>
}
```

**Benefits of using React's `cache()`**:
- Deduplicates session checks within same request
- Layout checks once, pages can call `getSession()` again without extra DB queries
- Performance optimization via request memoization

### Critical Security Rules

1. **NEVER rely on proxy alone for authentication**
   ```tsx
   // ❌ WRONG - No layout validation
   export async function proxy(req: NextRequest) {
     const session = await auth.api.getSession({ headers: req.headers })
     if (!session) return redirect('/sign-in')
     return NextResponse.next()
   }
   // Protected page assumes user is authenticated - INSECURE!
   ```

2. **ALWAYS validate in protected layouts**
   ```tsx
   // ✅ CORRECT - Layout validates
   export default async function ProtectedLayout({ children }) {
     const session = await getSession() // Real validation
     if (!session) redirect('/sign-in')
     return <>{children}</>
   }
   ```

3. **Use proxy for UX optimization only**
   - Fast redirects before rendering
   - Avoid wasted server rendering
   - Improve perceived performance

4. **Double-check is intentional (defense-in-depth)**
   - Proxy: Fast UX optimization
   - Layout: Real security boundary
   - Both layers serve different purposes

### Caching Implications

**Proxy checks do NOT affect caching**:
- Proxy runs before rendering (not part of React tree)
- Doesn't impact Full Route Cache or Data Cache
- Middleware/proxy is always dynamic

**Layout authentication affects caching**:
- Layout uses `headers()` → route becomes dynamic
- Full Route Cache: ❌ Disabled (cannot cache HTML)
- Data Cache: ✅ Still works (can cache data!)

**Optimal pattern**:
```tsx
// Proxy: Fast redirect (UX)
export async function proxy(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers })
  if (!session && isProtectedRoute(req)) {
    return NextResponse.redirect(new URL('/sign-in', req.url))
  }
  return NextResponse.next()
}

// Layout: Security boundary (makes route dynamic)
export default async function ProtectedLayout({ children }) {
  const session = await getSession() // Uses headers()
  if (!session) redirect('/sign-in')
  return <>{children}</>
}

// Page: Cache data despite dynamic route
export default async function DashboardPage() {
  const stats = await getStats() // 'use cache: remote'
  return <StatsDisplay stats={stats} />
}

async function getStats() {
  'use cache: remote' // Works even though route is dynamic!
  cacheTag('stats')
  cacheLife('minutes')

  return db.analytics.getStats()
}
```

**Result**:
- ✅ Fast redirects (proxy)
- ✅ Secure validation (layout)
- ✅ Cached data (despite dynamic route)
- ✅ Optimal performance + security

---

## Cache Invalidation & Revalidation

### Time-Based Revalidation

Use `cacheLife()` to set expiration:

```tsx
async function getData() {
  'use cache'
  cacheLife('hours') // Preset profile
  // or
  cacheLife({
    stale: 60,       // Consider stale after 60s
    revalidate: 300, // Revalidate in background after 5min
    expire: 3600     // Hard expire after 1 hour
  })

  return fetchData()
}
```

**Preset profiles**:
- `'seconds'` - Very short-lived data
- `'minutes'` - Frequently updated
- `'hours'` - Moderate update frequency
- `'days'` - Infrequently updated
- `'weeks'` - Rarely updated
- `'max'` - Static content

### On-Demand Revalidation

Use `cacheTag()` + `revalidateTag()`:

**1. Tag your cached data**:
```tsx
async function getPosts() {
  'use cache'
  cacheTag('blog-posts')

  return db.posts.findMany()
}
```

**2. Invalidate when data changes**:
```tsx
// In a Server Action or Route Handler
'use server'

import { revalidateTag } from 'next/cache'

export async function createPost(data: FormData) {
  await db.posts.create({ /* ... */ })

  // Invalidate all caches tagged with 'blog-posts'
  revalidateTag('blog-posts')
}
```

### Multiple Tags

```tsx
async function getProduct(id: string) {
  'use cache'
  cacheTag('products', `product-${id}`)

  return db.products.findUnique({ where: { id } })
}

// Invalidate all products
revalidateTag('products')

// Or just one product
revalidateTag('product-123')
```

### Path-Based Revalidation

```tsx
import { revalidatePath } from 'next/cache'

export async function updateSettings() {
  await db.settings.update({ /* ... */ })

  // Revalidate specific path
  revalidatePath('/dashboard/settings')

  // Or all routes under a path
  revalidatePath('/dashboard', 'layout')
}
```

### Interaction Between Caches

**Important relationships**:

1. **Revalidating Data Cache → Invalidates Full Route Cache**
   ```tsx
   revalidateTag('products')
   // This invalidates:
   // - Data Cache for 'products'
   // - Full Route Cache for routes using that data
   ```

2. **Invalidating Full Route Cache → Does NOT affect Data Cache**
   ```tsx
   revalidatePath('/products')
   // This invalidates:
   // - Full Route Cache for /products
   // - Data Cache is untouched
   ```

3. **Router Cache (client) gets invalidated by**:
   - `revalidatePath()` / `revalidateTag()` in Server Actions
   - `router.refresh()`
   - Hard refresh
   - NOT by Route Handler revalidations (must hard refresh)

---

## Common Patterns & Decision Tree

### Decision Tree: Which Cache Directive to Use?

```
Does your function need headers(), cookies(), or searchParams?
│
├─ YES → Use 'use cache: private'
│         (User-specific data)
│
└─ NO → Is the route/context dynamic (uses headers() elsewhere)?
    │
    ├─ YES → Use 'use cache: remote'
    │         (Shared data in dynamic context)
    │
    └─ NO → Use 'use cache'
              (Static build-time caching)
```

### Pattern 1: Public Page with Personalized Section

```tsx
import { Suspense } from 'react'
import { getCurrentUser } from '@/lib/auth/server'

export default function HomePage() {
  return (
    <div>
      {/* Static content - cached at build time */}
      <Hero />
      <Features />

      {/* Dynamic user section - only this part is dynamic */}
      <Suspense fallback={<UserMenuSkeleton />}>
        <UserMenu />
      </Suspense>
    </div>
  )
}

// Static cached data
async function getFeatures() {
  'use cache'
  cacheTag('features')
  cacheLife('days')

  return db.features.findMany()
}

// Component with dynamic user data
async function UserMenu() {
  const user = await getCurrentUser() // Uses headers()

  if (!user) return <SignInButton />
  return <UserProfile user={user} />
}
```

**Result**: Static shell with dynamic user section (Partial Prerendering).

### Pattern 2: Protected Route with Cached Data

```tsx
// Layout enforces auth (makes route dynamic)
export default async function ProtectedLayout({ children }) {
  const session = await getSession() // Uses headers()
  if (!session) redirect('/sign-in')
  return <>{children}</>
}

// Page can still cache shared data
export default async function DashboardPage() {
  const stats = await getStats() // Cached with 'use cache: remote'
  return <StatsDisplay stats={stats} />
}

async function getStats() {
  'use cache: remote'
  cacheTag('dashboard-stats')
  cacheLife('minutes')

  return db.analytics.aggregate({ /* ... */ })
}
```

**Result**: Route is dynamic (auth check), but data is cached (reduced DB load).

### Pattern 3: Mixed Caching Strategies

```tsx
import { Suspense } from 'react'
import { connection } from 'next/server'

export default async function ProductPage({ params }) {
  const { id } = await params

  // Static product info (if route wasn't dynamic elsewhere)
  const product = await getProduct(id)

  return (
    <div>
      <ProductDetails product={product} />

      {/* Dynamic pricing - shared across users */}
      <Suspense fallback={<PriceSkeleton />}>
        <ProductPrice productId={id} />
      </Suspense>

      {/* User-specific recommendations */}
      <Suspense fallback={<RecommendationsSkeleton />}>
        <UserRecommendations productId={id} />
      </Suspense>
    </div>
  )
}

// Build-time cached (if route is static)
async function getProduct(id: string) {
  'use cache'
  cacheTag(`product-${id}`)
  return db.products.findUnique({ where: { id } })
}

// Runtime cached - shared
async function getProductPrice(id: string) {
  'use cache: remote'
  cacheTag(`product-price-${id}`)
  cacheLife({ expire: 300 })

  await connection() // Ensure dynamic context
  return db.products.getPrice(id)
}

// Runtime cached - per-user
async function getUserRecommendations(productId: string) {
  'use cache: private'
  cacheLife({ expire: 60 })

  const userId = (await getCurrentUser())?.id
  return db.recommendations.findMany({ where: { productId, userId } })
}
```

### Pattern 4: Database Query with Invalidation

```tsx
// data/posts.ts
import { cacheTag, cacheLife } from 'next/cache'

export async function getAllPosts() {
  'use cache'
  cacheTag('posts', 'blog')
  cacheLife('hours')

  return db.posts.findMany({ orderBy: { date: 'desc' } })
}

export async function getPost(slug: string) {
  'use cache'
  cacheTag('posts', `post-${slug}`)
  cacheLife('days')

  return db.posts.findUnique({ where: { slug } })
}

// actions/posts.ts
'use server'

import { revalidateTag } from 'next/cache'

export async function createPost(data: FormData) {
  const post = await db.posts.create({ /* ... */ })

  // Invalidate all posts cache
  revalidateTag('posts')

  redirect(`/blog/${post.slug}`)
}

export async function updatePost(slug: string, data: FormData) {
  await db.posts.update({ /* ... */ })

  // Invalidate specific post + all posts list
  revalidateTag(`post-${slug}`)
  revalidateTag('posts')
}
```

---

## Verification Checklist

Use this checklist when implementing or reviewing caching:

### General Caching

- [ ] **Identify cache type needed**: Request Memoization, Data Cache, Full Route Cache, or Router Cache?
- [ ] **Check for Dynamic APIs**: Does the route/component use `headers()`, `cookies()`, or `searchParams`?
- [ ] **Choose correct directive**: `'use cache'`, `'use cache: remote'`, or `'use cache: private'`?
- [ ] **Set appropriate cacheLife**: Based on data update frequency
- [ ] **Tag cached data**: Using `cacheTag()` for future invalidation
- [ ] **Verify cache scope**: Should data be shared across users or per-user?

### Protected Routes

- [ ] **Layout auth check**: Does the layout check auth? (makes route dynamic)
- [ ] **Data caching strategy**: Are we using `'use cache: remote'` for shared data?
- [ ] **User-specific data**: Are we using `'use cache: private'` for personalized data?
- [ ] **Avoid double caching**: Not using both Full Route Cache AND Data Cache incorrectly
- [ ] **Suspense boundaries**: Using `<Suspense>` for progressive rendering?

### Authentication Security

- [ ] **Two-layer authentication**: Both proxy AND layout validation present?
- [ ] **Proxy security understanding**: Proxy is for UX only, not security?
- [ ] **Layout validation**: Using `auth.api.getSession()` with `headers()` in protected layouts?
- [ ] **Session helpers**: Using React's `cache()` for request memoization?
- [ ] **No proxy-only auth**: Not relying solely on middleware for security?

### Data Fetching

- [ ] **fetch() cache options**: Using `next.revalidate` and `next.tags`?
- [ ] **React cache() usage**: Using for request memoization when needed?
- [ ] **Database queries**: Wrapped in appropriate `'use cache'` directive?
- [ ] **Expensive computations**: Cached to avoid recalculation?

### Cache Invalidation

- [ ] **Tags defined**: All cached data has meaningful tags?
- [ ] **Revalidation strategy**: Time-based, on-demand, or both?
- [ ] **Mutation points**: Do Server Actions/Route Handlers revalidate correctly?
- [ ] **Tag granularity**: Can invalidate specific items or entire collections?

### Performance

- [ ] **Avoid over-caching**: Not caching data that changes too frequently?
- [ ] **Avoid under-caching**: Caching expensive operations appropriately?
- [ ] **Cache hit rate**: Is the cache actually being hit? (check with logging/metrics)
- [ ] **Cache size**: Private caches not growing unbounded?

### Common Mistakes to Avoid

- [ ] ❌ Using `headers()` inside `'use cache'` scope
- [ ] ❌ Using `'use cache'` instead of `'use cache: remote'` in dynamic contexts
- [ ] ❌ Not using `'use cache: private'` for user-specific data (risk of data leakage)
- [ ] ❌ Over-relying on `dynamic = 'force-dynamic'` (disables Data Cache)
- [ ] ❌ Not tagging cached data (can't invalidate later)
- [ ] ❌ Setting cache expiration too long for frequently updated data
- [ ] ❌ Assuming protected routes can't cache data (they can!)
- [ ] ❌ Relying on proxy alone for authentication (insecure!)

---

## Quick Reference

### Import Statements

```tsx
// Cache directives (use in function body)
'use cache'
'use cache: remote'
'use cache: private'

// Cache configuration
import { cacheLife, cacheTag } from 'next/cache'

// Revalidation
import { revalidateTag, revalidatePath } from 'next/cache'

// Request memoization
import { cache } from 'react'

// Dynamic APIs
import { headers, cookies } from 'next/headers'
import { connection } from 'next/server'
```

### Common Cache Lifetimes

```tsx
// Preset profiles
cacheLife('seconds')  // Very short
cacheLife('minutes')  // Short
cacheLife('hours')    // Medium (default for remote)
cacheLife('days')     // Long
cacheLife('weeks')    // Very long
cacheLife('max')      // Static

// Custom configuration
cacheLife({
  stale: 60,       // Start background revalidation after 60s
  revalidate: 300, // Continue background revalidation every 5min
  expire: 3600     // Hard expire and refetch after 1 hour
})
```

### Route Segment Config

```tsx
// Force dynamic rendering
export const dynamic = 'force-dynamic'

// Force static rendering
export const dynamic = 'force-static'

// Set revalidation time
export const revalidate = 3600 // seconds

// Control fetch caching
export const fetchCache = 'default-cache'
export const fetchCache = 'default-no-store'
```

---

**Last Updated**: Based on Next.js 16.0.3 documentation
**Verification**: All patterns verified against official Next.js documentation via Context7
