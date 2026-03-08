---
name: rungomx-quality-gates
description: Run this repo’s CI-equivalent checks (lint, i18n generation, type-check, locale validation, tests) using pnpm scripts. Use before declaring work done, after refactors, or when something feels flaky.
---

# RunGoMx Quality Gates

## What this skill does

Runs the repo’s standard local CI gate and reports results:

- Primary (recommended, stable): `pnpm test:ci:isolated`
- Legacy/non-isolated (only if explicitly requested): `pnpm test:ci`
- If you ask for smaller scopes, it can run:
  - Lint only: `pnpm lint`
  - Typecheck only: `pnpm type-check`
  - Locales validation only: `pnpm validate:locales`
  - Tests only: `pnpm test`
  - App tests: `pnpm test:app`
  - DB tests: `pnpm test:db`
  - E2E only (recommended): `pnpm test:e2e:isolated`
  - E2E only (legacy): `pnpm test:e2e`

## Workflow

1. Confirm we are at the repo root (expect `package.json` with name `rungomx-web`).
2. Ensure dependencies are installed:
   - If `node_modules` is missing, run `pnpm install`.
3. Preflight for any run that includes E2E:
   - Ensure `.env.test` exists.
   - Ensure `DATABASE_URL` is available (from shell env or `.env.test`).
4. Default run (recommended):
   - `pnpm test:ci:isolated`
5. If the user requests a smaller check, run only that script (prefer isolated E2E variants).
6. If E2E fails, isolate quickly before changing code:
   - Run only failing spec with isolated runner:
     - `pnpm test:e2e:isolated e2e/tests/<failing-file>.spec.ts`
7. Always paste the command output in the chat and summarize:
   - Success: list what ran.
   - Failure: point to the first actionable error and suggest the next command to isolate it.

## Reliability Guardrails

- Prefer `:isolated` commands by default (`test:ci:isolated`, `test:e2e:isolated`).
- Do not run concurrent non-isolated E2E sessions against the same DB/port.
- Avoid inventing auth/test workarounds just to make green; isolate first, then fix root cause.
- Full green means `pnpm -s test:ci:isolated`, not a passing subset.
- Do not treat `page.waitForLoadState('networkidle')` as a default readiness strategy.
  Prefer visible UI, URL, or persisted-state assertions.
- If E2E-related files changed, quickly scan the touched files for `networkidle`
  before declaring the change safe.
- Treat changes in `e2e/utils/helpers.ts` as shared-infrastructure changes:
  validate the directly affected specs, then rerun isolated E2E, then rerun the
  full isolated gate.
- Treat noisy webserver logs (`ECONNRESET`, `Error: aborted`) as non-blocking only when tests are green.
- If lock/port conflicts appear, stop and rerun isolated rather than forcing parallel runs.

## Safety

- Do not modify code while running checks unless the user asks.
- Do not delete files or change lockfiles unless the user asks.
- If a command requires env vars (for example DB), stop and ask what to use.
