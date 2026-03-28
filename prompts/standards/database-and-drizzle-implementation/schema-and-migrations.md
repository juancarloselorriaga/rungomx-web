---
title: Database and Drizzle Schema and Migrations
scope: Canonical schema ownership, relation metadata role, and migration-tooling entrypoints.
when_to_load: When reviewing schema changes, Drizzle configuration, or where persistent structure should be defined.
keywords:
  - schema
  - migrations
  - drizzle config
  - relations
  - source of truth
surfaces:
  - db/schema.ts
  - db/relations.ts
  - drizzle.config.ts
  - drizzle/
owner: web-platform
---

# Database and Drizzle Schema and Migrations

## Source of truth

- `db/schema.ts` is the canonical source of truth for persistent data structure.
- New tables, columns, enums, and constraints should be reflected there.
- `db/relations.ts` is the companion relation map for Drizzle query ergonomics and typed relation loading.

## Tooling alignment

- `drizzle.config.ts` points schema generation at `./db/schema.ts` and migration output at `./drizzle`.
- Treat that config as the repo’s canonical Drizzle tooling entrypoint.

## Ownership rule

- Keep persistent-structure definitions centralized in `db/schema.ts` rather than scattering structural truth across feature modules.
- Feature modules may consume schema exports, but they do not become alternate schema authorities.

## Change discipline

- Schema changes should be minimal, auditable, and paired with the necessary runtime/test follow-up.
- Do not treat generated migration output or one-off scripts as a substitute for the canonical schema definition.

## Cross-boundary note

- Schema ownership here does not grant permission to move auth, authorization, or mutation entrypoints out of their server boundaries.
- For app-facing write entrypoints and public contract stability, defer to `AGENTS.md` and `prompts/standards/server-actions-and-api-contracts-index.md`.

## Review questions

- Is the persistent structure represented in `db/schema.ts`?
- Are relation changes reflected in `db/relations.ts` when needed?
- Is the change using the existing Drizzle config and output layout rather than inventing a parallel path?
