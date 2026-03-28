---
title: Database and Drizzle Implementation Checklist
scope: Review checklist for DB entrypoints, schema imports, query placement, transactions, and DB-backed tests.
when_to_load: When reviewing a PR, making a non-trivial DB change, or checking a new DB helper against repo standards.
keywords:
  - checklist
  - database review
  - drizzle review
  - transactions
  - db tests
surfaces:
  - db/index.ts
  - db/schema.ts
  - lib/**/queries.ts
  - app/actions/*
  - app/api/**
  - e2e/utils/db.ts
owner: web-platform
---

# Database and Drizzle Implementation Checklist

- [ ] **Entrypoint:** server-only DB access goes through `db/index.ts`.
- [ ] **Schema authority:** persistent structure changes are represented in `db/schema.ts`, with relation updates in `db/relations.ts` when needed.
- [ ] **Client boundary:** no client-reachable module imports `db/`, `db/schema.ts`, or DB-coupled shared modules, per `prompts/standards/nextjs-component-implementation.md`.
- [ ] **App vs lib placement:** reusable reads live in `lib/**/queries.ts` or equivalent server-only domain helpers rather than spreading through `app/`.
- [ ] **Legacy labeling:** any continued direct `@/db/schema` import in `app/**/*` is treated as legacy drift / exception, not blessed as the new default.
- [ ] **Mutation boundary:** app-facing writes still enter through Server Actions or route handlers, consistent with `AGENTS.md` and `prompts/standards/server-actions-and-api-contracts-index.md`.
- [ ] **Transaction typing:** transaction seams are typed; `tx?: any` is not being copied forward as precedent.
- [ ] **Atomicity:** audit-sensitive or multi-step writes share the correct caller-owned transaction when atomic behavior matters.
- [ ] **Tooling alignment:** schema/migration tooling uses the existing `drizzle.config.ts` and `drizzle/` layout.
- [ ] **DB test utilities:** cleanup/reset logic relies on shared utilities where possible instead of bespoke per-test reimplementation.
- [ ] **Test lane clarity:** DB-backed tests follow `prompts/standards/e2e-testing.md` and `prompts/standards/test-reliability.md` for isolation and release confidence.
