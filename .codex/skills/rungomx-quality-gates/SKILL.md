---
name: rungomx-quality-gates
description: Run this repo’s CI-equivalent checks (lint, i18n generation, type-check, locale validation, tests) using pnpm scripts. Use before declaring work done, after refactors, or when something feels flaky.
---

# RunGoMx Quality Gates

## What this skill does

Runs the repo’s standard local CI gate and reports results:

- Primary: `pnpm test:ci`
- If you ask for smaller scopes, it can run:
  - Lint only: `pnpm lint`
  - Typecheck only: `pnpm type-check`
  - Locales validation only: `pnpm validate:locales`
  - Tests only: `pnpm test`
  - App tests: `pnpm test:app`
  - DB tests: `pnpm test:db`

## Workflow

1. Confirm we are at the repo root (expect `package.json` with name `rungomx-web`).
2. Ensure dependencies are installed:
   - If `node_modules` is missing, run `pnpm install`.
3. Default run (recommended):
   - `pnpm test:ci`
4. If the user requests a smaller check, run only that script.
5. Always paste the command output in the chat and summarize:
   - Success: list what ran.
   - Failure: point to the first actionable error and suggest the next command to isolate it.

## Safety

- Do not modify code while running checks unless the user asks.
- Do not delete files or change lockfiles unless the user asks.
- If a command requires env vars (for example DB), stop and ask what to use.
