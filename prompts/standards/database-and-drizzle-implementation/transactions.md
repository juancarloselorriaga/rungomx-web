---
title: Database and Drizzle Transactions
scope: Typed transaction propagation, orchestration ownership, and non-canonical weak transaction seams.
when_to_load: When adding or reviewing db.transaction usage, helper signatures, audit writes, or nested DB workflows.
keywords:
  - transactions
  - db transaction
  - typed tx
  - db or tx
  - tx any
surfaces:
  - db/index.ts
  - lib/payments/core/mutation-ingress.ts
  - lib/events/results/shared/audit.ts
owner: web-platform
---

# Database and Drizzle Transactions

## Canonical pattern

- Prefer a typed transaction seam patterned after strong existing server-only modules such as `lib/payments/core/mutation-ingress.ts`.
- The orchestration layer should own transaction creation.
- Nested helpers should accept and propagate a typed `db`/`tx`-compatible client when they participate in the same unit of work.

## Preferred design

- Define transaction types from the canonical `db` client.
- Accept a typed DB client or transaction in lower-level helpers when shared work must run inside or outside a transaction.
- Keep transaction ownership explicit instead of opening hidden nested transactions in deep helpers.

## Non-canonical pattern

- `tx?: any` is **not** canonical.
- Weakly typed optional transaction parameters make audit-sensitive and multi-step flows harder to reason about and easier to misuse.
- Existing hotspots using `tx?: any` should be called out as follow-up cleanup, not reused as precedent.

## Audit-sensitive guidance

- Helpers that write audit records, financial records, or cross-table state should be especially strict about typed transaction propagation.
- If a write must succeed or fail atomically with surrounding work, share the caller-owned transaction instead of opening an unrelated write path.

## Review questions

- Who owns the transaction boundary?
- Can this helper participate safely in a larger transaction?
- Is the helper signature typed strongly enough to prevent accidental out-of-transaction usage?
- Would this pattern still be understandable during failure triage?

## Coordinated migration only

- [coordinated migration later] Replace existing `tx?: any` seams with a shared typed abstraction where needed.
- [coordinated migration later] Consolidate older helper signatures only when callers can be migrated together.
