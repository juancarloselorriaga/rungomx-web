# Quick Reference

Summary: grab-and-go snippets for imports, directives, and cache lifetimes.

## Directives
```tsx
'use cache'
'use cache: remote'
'use cache: private'
```

## Imports
```tsx
// Cache configuration
import { cacheLife, cacheTag, revalidateTag, revalidatePath } from 'next/cache'

// Request memoization
import { cache } from 'react'

// Dynamic APIs
import { headers, cookies } from 'next/headers'
import { connection } from 'next/server'
```

## Common cache lifetimes
```tsx
cacheLife('seconds')  // very short
cacheLife('minutes')  // short
cacheLife('hours')    // medium (default for remote)
cacheLife('days')     // long
cacheLife('weeks')    // very long
cacheLife('max')      // static

cacheLife({
  stale: 60,       // start background revalidation after 60s
  revalidate: 300, // continue background revalidation every 5min
  expire: 3600     // hard expire after 1 hour
})
```
