---
title: Database and Drizzle Implementation Overview
scope: Canonical database ownership model across db/, lib/, app/, and tests.
when_to_load: When adding or reviewing DB-backed code, deciding ownership, or explaining how db/, lib/, app/, and tests relate.
keywords:
  - db ownership
  - drizzle overview
  - server only
  - lib queries
  - app composition
surfaces:
  - AGENTS.md
  - db/index.ts
  - db/schema.ts
  - db/relations.ts
  - lib/**/queries.ts
  - app/actions/*
  - app/api/**
owner: web-platform
---

# Database and Drizzle Implementation Overview

This family defines the canonical database structure and usage model for the app.

## Canonical module roles

- `db/index.ts` is the canonical **server-only** database entrypoint.
- `db/schema.ts` is the source of truth for persistent data structure, consistent with `AGENTS.md`.
- `db/relations.ts` is companion relation metadata for the Drizzle schema graph.
- `drizzle.config.ts` points Drizzle tooling at `db/schema.ts` and the `drizzle/` output directory.

## Ownership model

- `app/actions/*` remains the default app-facing write boundary, per `AGENTS.md` and `prompts/standards/server-actions-and-api-contracts-index.md`.
- `app/api/**` remains the HTTP contract boundary for flows that truly need route-handler transport semantics.
- `lib/` owns reusable database-backed domain logic, orchestration, and policy.
- `app/` should usually compose through `lib/` helpers rather than becoming a broad raw-query layer.
- Tests and test utilities may access `db/` directly because they are server-only infrastructure.

## Preferred default

- Reads should usually live in server-only `lib/**/queries.ts` modules or equivalent domain helpers.
- App routes, Server Actions, and route handlers should prefer calling those helpers instead of scattering direct query shape decisions across `app/`.
- Database guidance here does **not** replace mutation-boundary, auth, or contract rules. Load `prompts/standards/server-actions-and-api-contracts-index.md` for those.

## Legacy and drift callouts

- Some `app/**/*` server files currently import `@/db/schema` directly. Treat that as **existing drift**, not the preferred default for new work.
- Existing DB access patterns that weaken transaction typing or bypass domain placement should be labeled as compatibility or follow-up cleanup, not silently normalized.

## Boundary summary

- Server-only DB access: allowed.
- Client-reachable DB access: forbidden.
- App-layer direct schema usage: technically possible in server files, but not the default architecture.

## Coordinated migration only

- [coordinated migration later] Consolidating existing app-layer raw schema imports behind `lib/` helpers.
- [coordinated migration later] Replacing legacy weakly typed transaction seams across older modules.
