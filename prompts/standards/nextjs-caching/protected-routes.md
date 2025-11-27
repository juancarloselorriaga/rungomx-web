# Protected Routes & Authentication Caching

Summary: routes that call `headers()`/`cookies()` in layouts are dynamic (no Full Route Cache), but you can and should cache data with `remote` or `private`.

## Shared data in protected routes (`'use cache: remote'`)
```tsx
import { cacheLife, cacheTag } from 'next/cache'

async function getEvents() {
  'use cache: remote'
  cacheTag('events')
  cacheLife('hours')
  return db.events.findMany()
}

async function getEventStats() {
  'use cache: remote'
  cacheTag('event-stats')
  cacheLife({ expire: 300 })
  return db.events.aggregate({ count: true })
}
```

## User-specific data (`'use cache: private'`)
```tsx
import { cacheLife } from 'next/cache'

async function getUserRegisteredEvents() {
  'use cache: private'
  cacheLife({ expire: 60 })
  const userId = (await getCurrentUser())?.id
  return db.registrations.findMany({ where: { userId } })
}
```

## Key insight
| Cache Type | Disabled in protected routes? | Fix |
|-----------|------------------------------|-----|
| Full Route Cache (HTML) | Yes (dynamic APIs) | Accept dynamic rendering |
| Data Cache (data) | No | Use `'use cache: remote'` or `'use cache: private'` |

Caching impact example: 100 users hitting the same protected page → without caching: 100 DB queries; with `'use cache: remote'`: 1 query after warm, ~99% reduction.
