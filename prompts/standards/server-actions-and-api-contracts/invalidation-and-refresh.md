---
title: Invalidation and Refresh
scope: Post-mutation cache invalidation, safe refresh behavior, and session refresh expectations.
when_to_load: When a mutation changes server data, session-derived UI, or protected route data that may stay stale without explicit refresh.
keywords:
  - revalidateTag
  - safeRefresh
  - router.refresh
  - session refresh
  - invalidate
  - cache
surfaces:
  - lib/next-cache.ts
  - app/actions/*
  - app/api/**
  - prompts/standards/nextjs-caching-index.md
pair_with:
  - prompts/standards/nextjs-caching-index.md
  - prompts/standards/server-actions-and-api-contracts/auth-and-error-mapping.md
owner: web-platform
---

# Invalidation and Refresh

## Approved default

- Revalidate server-side caches for mutated data using the cache rules in `prompts/standards/nextjs-caching-index.md`.
- Use helpers from `lib/next-cache.ts` such as `safeRevalidateTag` and `safeRefresh` when that matches the existing mutation pattern.
- Keep cache invalidation and session refresh on the server boundary.

## Server responsibilities after writes

- Invalidate the relevant tags for mutated resources.
- Refresh session-derived data when the mutation changes session-visible fields or auth-derived UI.
- Use `safeRefresh()` only for the server action refresh role it was designed for in `lib/next-cache.ts`.

## Client responsibilities after writes

- `router.refresh()` is a client-side follow-up tool for reloading the current route tree after a successful mutation when needed.
- It does not replace server-side invalidation.
- Form success handlers may call `router.refresh()` after a successful action, but the mutation must still invalidate or refresh server-side state correctly.

## Session refresh expectation

When a mutation changes session-derived values, do not assume cache invalidation alone will update client auth state. Follow the established server-side refresh pattern used by auth-sensitive actions so `useSession()` and protected shells observe the new state.

## Legacy or exception

- Some existing mutations may refresh more broadly than ideal to preserve current UX.
- Preserve those paths unless you are explicitly tightening the invalidation model and validating the downstream impact.

## Coordinated migration only

- changing tag names or invalidation ownership used across modules
- replacing session refresh behavior for auth-sensitive mutations
- moving refresh responsibility between route handlers, Server Actions, and client handlers in one step
