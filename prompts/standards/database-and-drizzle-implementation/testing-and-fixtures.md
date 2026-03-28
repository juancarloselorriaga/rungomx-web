---
title: Database and Drizzle Testing and Fixtures
scope: Canonical guidance for DB-backed tests, cleanup/reset ownership, and shared fixture utility usage.
when_to_load: When reviewing DB tests, E2E DB utilities, cleanup logic, or test fixture setup.
keywords:
  - db tests
  - fixtures
  - cleanup
  - truncate
  - reset
  - isolation
surfaces:
  - e2e/utils/db.ts
  - tests/helpers/db
  - __tests__/**/*.db.test.ts
  - prompts/standards/e2e-testing.md
  - prompts/standards/test-reliability.md
owner: web-platform
---

# Database and Drizzle Testing and Fixtures

## Canonical pairing

- Load this document with:
  - `prompts/standards/e2e-testing.md`
  - `prompts/standards/test-reliability.md`

Those documents own the release signal, reliability policy, and lane distinctions.

## Utility ownership

- Shared DB cleanup/reset behavior should live in shared test utilities, not be reimplemented per spec.
- `e2e/utils/db.ts` is the canonical E2E cleanup/reset utility surface today.
- DB-backed Jest/integration tests should prefer shared DB helpers when available instead of duplicating environment bootstrapping.

## Invariants to preserve

- Test DB access must stay server-only.
- Cleanup must remain isolation-safe and foreign-key-safe.
- Tests should target the intended DB lane and environment rather than assuming dev and isolated-test setups are interchangeable.

## Avoid overfitting prose to internals

- Do not hardcode exact deletion order or truncate implementation details into canonical standards prose.
- The invariant is the important part: cleanup/reset must remain safe as schema topology evolves.
- The current canonical reference for cleanup ordering and implementation remains `prompts/standards/e2e-testing.md` together with `e2e/utils/db.ts`; this document avoids duplicating that algorithm here.
- Let shared utilities own the exact algorithm.

## Fixture guidance

- Prefer shared fixture helpers and centralized environment setup.
- Keep test data creation close to the canonical schema and helper surfaces.
- If a DB-backed test needs raw inserts for setup, keep them server-only and scoped to the test lane.

## Legacy / drift note

- Older tests may still contain bespoke cleanup sequences. Treat those as migration or cleanup candidates, not as the new standard.

## Review questions

- Is this test using the right DB lane?
- Is cleanup owned by shared utilities where possible?
- Does the test preserve isolation without encoding fragile schema-order assumptions into every file?
