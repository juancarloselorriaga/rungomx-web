---
title: Server Actions and API Contracts Index
scope: Discovery index for mutation boundaries, contract families, auth/error mapping, invalidation, and migration-sensitive facades.
when_to_load: When a task changes or reviews Server Actions, route handlers, action results, HTTP response envelopes, auth mapping, or post-mutation refresh behavior.
keywords:
  - server actions
  - route handlers
  - api contracts
  - formactionresult
  - actionresult
  - auth mapping
  - invalidation
  - stable facades
surfaces:
  - app/actions/*
  - app/api/**
  - lib/**/actions.ts
  - lib/forms/types.ts
  - lib/auth/action-wrapper.ts
  - lib/next-cache.ts
pair_with:
  - prompts/standards/forms-implementation.md
  - prompts/standards/nextjs-caching-index.md
  - prompts/auth-stack/roles-agent-guide.md
owner: web-platform
---

# Server Actions and API Contracts Index

Usage for AI agents: scan this index first, then load the 1–2 most relevant topic files (max 2 unless the task spans multiple boundaries).

- scenario: Orientation or boundary ownership; keywords: defaults, ownership, client imports, mutation boundary; read: prompts/standards/server-actions-and-api-contracts/overview.md
- scenario: Pick the right result shape; keywords: FormActionResult, ActionResult, HTTP envelope, display vs machine semantics; read: prompts/standards/server-actions-and-api-contracts/contract-families.md
- scenario: Choose Server Action vs route handler; keywords: decision tree, app/actions, app/api, upload flow, profile picture; read: prompts/standards/server-actions-and-api-contracts/server-actions-vs-route-handlers.md
- scenario: Map auth and failures correctly; keywords: guards, withAuthenticatedUser, unauthenticated, forbidden, profile incomplete, status codes; read: prompts/standards/server-actions-and-api-contracts/auth-and-error-mapping.md
- scenario: Refresh caches and session after writes; keywords: revalidateTag, safeRefresh, router.refresh, session refresh; read: prompts/standards/server-actions-and-api-contracts/invalidation-and-refresh.md
- scenario: Preserve migration-sensitive entrypoints; keywords: stable facades, legacy imports, compatibility surface, contract migration; read: prompts/standards/server-actions-and-api-contracts/stable-facades.md
- scenario: Review or PR checklist; keywords: checklist, audit, boundary review, tests; read: prompts/standards/server-actions-and-api-contracts/checklist.md
