# Payments Brownfield Foundation

## Scope Guardrails

- This payments track extends the existing `rungomx-web` brownfield codebase.
- Do not reinitialize or re-scaffold the project (`create-next-app`, alternate starters, or parallel app roots are out of scope).
- All foundational payments contract work must remain additive and backward compatible with current repository conventions.

## Canonical Contracts

- Canonical event contracts live under `lib/payments/core/contracts/events/*`.
- Generated registry snapshots live under `docs/payments/contracts/event-registry/*`.
- Contract updates must include:
  - Typed Zod schema changes in source modules.
  - Updated registry metadata.
  - Updated generated JSON Schema snapshots.

## Compatibility Rules

- Contract versions evolve additively.
- Historical versions must remain ingestible through explicit upcaster pathways.
- Contract CI checks must fail when registry entries, schema snapshots, or upcaster coverage are incomplete.

