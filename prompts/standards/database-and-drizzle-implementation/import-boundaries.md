---
title: Database and Drizzle Import Boundaries
scope: Canonical import rules for db/index.ts, db/schema.ts, and DB-coupled modules across server-only and client-reachable graphs.
when_to_load: When deciding whether a module may import db/, schema types, or DB-coupled helpers.
keywords:
  - import boundaries
  - db schema import
  - client graph
  - server only
  - app drift
surfaces:
  - db/index.ts
  - db/schema.ts
  - db/relations.ts
  - prompts/standards/nextjs-component-implementation.md
owner: web-platform
---

# Database and Drizzle Import Boundaries

## Canonical rule

Per `prompts/standards/nextjs-component-implementation.md`, client-reachable graphs must not import `db/schema.ts` or DB-coupled modules.

## Approved imports

### `db/index.ts`

- Approved in server-only modules:
  - `lib/**`
  - `app/actions/*`
  - `app/api/**`
  - server-only route files
  - test utilities and DB-backed test suites

### `db/schema.ts`

- Approved in server-only modules that define or compose typed queries, inserts, updates, and test fixtures.
- Approved in `db/relations.ts` and other DB-layer tooling.

## Not allowed

- Do not import `db/index.ts`, `db/schema.ts`, or DB-coupled helper modules into:
  - Client Components
  - modules imported by Client Components
  - shared modules whose transitive graph becomes client-reachable

That includes `import type` usage when it drags a client graph across a server boundary or creates a DB-coupled shared surface.

## App-layer guidance

- Server files under `app/` may technically import `@/db/schema`, but this is **not** the preferred default.
- Prefer `app/` composing through `lib/**/queries.ts` or other server-only domain helpers.
- Existing direct `@/db/schema` imports in `app/**/*` should be documented as **legacy drift / exception**, not copied into new patterns without a clear reason.

## Shared types rule

- Do not export mixed UI-safe and DB-coupled types from the same shared module if that module may become client-reachable.
- If client code needs literals, enums, or small shape types, extract them into a boundary-safe module with no `db/` imports.

## Review test

When reviewing a new import chain, ask:

- Is this file server-only?
- Could this module become reachable from a Client Component later?
- Should this data access instead live behind an existing `lib/**/queries.ts` helper?

If any answer is uncertain, do not widen the DB import surface casually.
