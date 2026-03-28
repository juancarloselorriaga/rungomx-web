---
title: Database and Drizzle Implementation Index
scope: Discovery index for database entrypoints, import boundaries, query placement, transactions, schema ownership, and DB test utilities.
when_to_load: When a task changes or reviews Drizzle usage, db imports, query placement, transactions, schema access, migrations, or DB-backed test utilities.
keywords:
  - drizzle
  - database
  - db imports
  - schema
  - queries
  - transactions
  - migrations
  - db tests
surfaces:
  - db/index.ts
  - db/schema.ts
  - db/relations.ts
  - drizzle.config.ts
  - lib/**/queries.ts
  - lib/**/actions.ts
  - app/actions/*
  - app/api/**
  - e2e/utils/db.ts
  - __tests__/**/*.db.test.ts
pair_with:
  - prompts/standards/server-actions-and-api-contracts-index.md
  - prompts/standards/nextjs-component-implementation.md
  - prompts/standards/e2e-testing.md
  - prompts/standards/test-reliability.md
owner: web-platform
---

# Database and Drizzle Implementation Index

Usage for AI agents: scan this index first, then load the 1–2 most relevant topic files (max 2 unless the task spans multiple database boundaries).

- scenario: Orientation or ownership; keywords: db entrypoint, schema source of truth, app vs lib, server-only; read: prompts/standards/database-and-drizzle-implementation/overview.md
- scenario: Decide where DB imports may live; keywords: db/schema import, client graph, app drift, import boundary; read: prompts/standards/database-and-drizzle-implementation/import-boundaries.md
- scenario: Place reads and DB-backed domain logic correctly; keywords: lib queries, app composition, read helpers, mutation handoff; read: prompts/standards/database-and-drizzle-implementation/query-placement.md
- scenario: Propagate transactions safely; keywords: transaction, tx type, db-or-tx, tx any, orchestration; read: prompts/standards/database-and-drizzle-implementation/transactions.md
- scenario: Review schema ownership or migration inputs; keywords: schema.ts, relations.ts, drizzle.config, migrations; read: prompts/standards/database-and-drizzle-implementation/schema-and-migrations.md
- scenario: Review DB tests or cleanup utilities; keywords: db tests, fixtures, cleanup, truncate, reset, isolation; read: prompts/standards/database-and-drizzle-implementation/testing-and-fixtures.md
- scenario: Review or PR checklist; keywords: checklist, audit, boundaries, transactions, tests; read: prompts/standards/database-and-drizzle-implementation/checklist.md
