---
title: Stable Facades and Legacy Compatibility Surfaces
scope: Migration-sensitive facades, legacy action import surfaces, and change triggers.
when_to_load: When editing an actions module, considering entrypoint consolidation, or reviewing blast radius before contract changes.
keywords:
  - stable facade
  - legacy compatibility
  - migration sensitive
  - actions ts
  - public boundary
surfaces:
  - AGENTS.md
  - lib/events/results/actions.ts
  - lib/events/group-upload/actions.ts
  - app/actions/billing-admin.ts
  - registration-flow.tsx
  - app/api/**
pair_with:
  - prompts/standards/server-actions-and-api-contracts/overview.md
  - prompts/standards/server-actions-and-api-contracts/checklist.md
owner: web-platform
---

# Stable Facades and Legacy Compatibility Surfaces

## Migration-sensitive stable facades

Per `AGENTS.md`, treat these as stable public boundaries:

- `lib/events/results/actions.ts`
- `lib/events/group-upload/actions.ts`
- `app/actions/billing-admin.ts`
- `registration-flow.tsx`
- `app/api/**`

Do not change their signatures or semantics casually.

For `app/api/**`, this includes route-family HTTP semantics such as status-code behavior, envelope shape, and machine-readable response fields that current callers or tests depend on.

## Approved default vs legacy compatibility

- **Approved default for new app-facing mutations:** `app/actions/*`
- **Approved default for HTTP contracts:** `app/api/**`
- **Legacy compatibility surface:** direct client imports from `@/lib/**/actions`

Legacy compatibility means:

- existing imports may need to remain stable for now
- new code should not treat those modules as the preferred client boundary
- if domain logic needs reuse, keep it in `lib/`, but expose app-facing entrypoints from the right boundary

## Change triggers that require coordination

Escalate or plan a coordinated migration when a proposed change would:

- alter a stable facade signature
- change a result family consumed across modules or tests
- move a legacy `lib/**/actions.ts` entrypoint to `app/actions/*`
- change auth behavior, cache invalidation, or refresh semantics at the same time as a contract change
- affect app-facing clients and HTTP consumers together

## Legacy and exceptions must be explicit

If a legacy surface remains in place, label it as compatibility or exception. Do not silently present it as the new preferred pattern.
