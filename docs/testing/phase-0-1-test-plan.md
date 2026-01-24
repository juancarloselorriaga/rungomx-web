# E2E Test Plan (Phase 0–2)

This document describes the Playwright end-to-end test plan for the RunGoMX web app.

## Scope

The suite is organized by feature areas (not “phase-X” filenames):

- **Auth & access control:** `e2e/tests/auth.spec.ts`
- **Organizer event creation:** `e2e/tests/event-creation.spec.ts`
- **Organizer event management:** `e2e/tests/event-management.spec.ts`
- **Athlete registration flow:** `e2e/tests/athlete-registration.spec.ts`
- **Capacity enforcement:** `e2e/tests/capacity-enforcement.spec.ts`
- **Events discovery (location filter):** `e2e/tests/events-location-filter.spec.ts`

## Environment prerequisites

- `.env.test` must define `DATABASE_URL` pointing to the **Neon test branch**.
- Playwright starts its own Next.js dev server via `e2e/playwright.config.ts` (default `http://127.0.0.1:43137`).
- The suite wipes the test database **before and after** the run via `e2e/global-setup.ts` and `e2e/global-teardown.ts`.
  - To preserve data after a run for debugging: `E2E_SKIP_DB_CLEANUP=1 pnpm test:e2e`

## How to run

Run the full suite:

```bash
pnpm test:e2e
```

Run a single spec:

```bash
pnpm test:e2e e2e/tests/event-management.spec.ts
```

Run isolated (unique artifacts + random port):

```bash
pnpm test:e2e:isolated
```

Use a different server origin/port:

```bash
PLAYWRIGHT_PORT=3005 pnpm test:e2e
```

## Success criteria

- All specs pass locally (`pnpm test:e2e`) and in CI (`pnpm test:ci`).
- Tests remain idempotent (safe to rerun) thanks to DB reset and timestamped entities.
- No hardcoded credentials (users are created per suite via helpers in `e2e/utils/fixtures.ts`).

