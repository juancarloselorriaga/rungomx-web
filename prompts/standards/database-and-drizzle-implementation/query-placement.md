---
title: Database and Drizzle Query Placement
scope: Preferred placement for reads, reusable DB-backed logic, and handoff between app/, lib/, and mutation boundaries.
when_to_load: When choosing where a query belongs or reviewing app-vs-lib placement of database logic.
keywords:
  - query placement
  - lib queries
  - app composition
  - db reads
  - mutations
surfaces:
  - lib/**/queries.ts
  - app/actions/*
  - app/api/**
  - db/index.ts
owner: web-platform
---

# Database and Drizzle Query Placement

## Preferred default

- Reusable reads should usually live in server-only `lib/**/queries.ts` modules.
- `app/` layers should usually orchestrate and compose, not become the long-term home for repeated query logic.
- DB-backed policy, filtering, and shape normalization that multiple callers may need belongs in `lib/`.

## Good placement model

- `app/page.tsx` / `app/layout.tsx`: route composition, request-specific orchestration, prepared props.
- `app/actions/*`: app-facing mutation entrypoint.
- `app/api/**`: HTTP transport boundary.
- `lib/**/queries.ts`: reusable reads.
- `lib/**/actions.ts` or other server-only domain modules: reusable mutation orchestration behind Server Actions or route handlers.

## Avoid

- Copying the same read logic into multiple `app/` files.
- Letting route files own large raw-query blocks when the logic is domain-reusable.
- Treating `db/schema.ts` imports in `app/` as the new normal just because some existing files do it.

## Mutation handoff

- Database placement guidance does not change the mutation boundary.
- Keep app-facing writes initiated from Server Actions or route handlers, then delegate reusable DB work into `lib/`.
- For action contract, auth mapping, and refresh behavior, defer to `prompts/standards/server-actions-and-api-contracts-index.md`.

## Practical exception rule

- A small one-off server read in `app/` may be acceptable when it is truly local and unlikely to be reused.
- Once query logic starts carrying policy, joins, shaping, caching tags, or multi-caller reuse, move it behind `lib/` instead of expanding route-local DB knowledge.

## Legacy labeling

- Existing app-layer raw schema/query usage may remain during migration windows.
- Document it as compatibility or consolidation backlog rather than blessing it as canonical architecture.
