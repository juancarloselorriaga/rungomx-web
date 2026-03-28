---
title: Server Actions vs Route Handlers
scope: Decision rules for choosing app/actions versus app/api, including explicit exceptions.
when_to_load: When adding a new mutation boundary, changing an upload flow, or reviewing whether a route handler is justified.
keywords:
  - server action
  - route handler
  - upload
  - api route
  - decision tree
  - profile picture
surfaces:
  - app/actions/*
  - app/api/**
  - app/api/profile-picture/route.ts
  - app/actions/profile-picture.ts
pair_with:
  - prompts/standards/server-actions-and-api-contracts/overview.md
  - prompts/standards/server-actions-and-api-contracts/contract-families.md
owner: web-platform
---

# Server Actions vs Route Handlers

## Approved default

Choose `app/actions/*` when:

- the caller is an in-app Server Component or Client Component
- the mutation is app-facing and does not need a public or fetch-based HTTP contract
- the result should plug into form or app interaction flows directly
- you want the mutation boundary to stay aligned with `AGENTS.md`

Choose `app/api/**` when:

- the caller needs an HTTP endpoint
- the flow is upload-oriented, webhook-like, or third-party driven
- the contract must be expressed through HTTP methods, headers, request bodies, and status codes
- the work is transport-specific rather than just an app mutation

## Decision rule

1. Is the consumer an app-local UI calling a mutation directly? Use `app/actions/*`.
2. Does the consumer require `fetch`, an upload token handshake, webhook delivery, or a non-React caller? Use `app/api/**`.
3. Does reusable business logic need to be shared? Put that logic in `lib/`, then adapt it at the chosen boundary.

## Explicit exception: profile picture split flow

`app/api/profile-picture/route.ts` and `app/actions/profile-picture.ts` are the documented split-flow exception.

- The route handler owns the upload HTTP handshake.
- The Server Action owns the app-facing confirmation and refresh behavior.

This is an **approved exception**, not a signal to default every mutation to both surfaces.

## Legacy or exception

- Existing direct client imports from `@/lib/**/actions` are legacy compatibility surfaces.
- Keep them stable when required, but do not use them as the default pattern for new entrypoints.

## Coordinated migration only

If you need to move a flow between `app/actions/*` and `app/api/**`, treat it as a coordinated migration when any of the following are true:

- multiple modules consume the current contract
- tests assert on the current boundary shape
- a stable facade from `AGENTS.md` is involved
- auth, cache invalidation, or client wiring would change at the same time
