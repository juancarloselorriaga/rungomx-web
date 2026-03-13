# Refactor Handoff

## Executive Summary
- The refactor program is complete and behaviorally stable.
- Public boundaries stayed in place while large hotspots were decomposed into internal modules.
- Tooling hygiene was tightened by linting `scripts/*` and replacing the placeholder root README with repo-specific documentation.

## Phase Summary
- Phase 0: established inventory, validation matrix, invariants, and execution ledger.
- Phase 1: split the results domain behind its existing public facade into shared helpers and workflow modules for ingestion, finalization, claims, and corrections.
- Phase 2: split group upload behind its existing public facade into schemas, parsing, access, batch creation, reservation, and invite-delivery modules.
- Phase 3: split the registration flow into a machine/helper layer, a private hook, and step components while keeping `registration-flow.tsx` as the composition root.
- Phase 4: consolidated repeated cron and payments route-boundary logic into private shared helpers without changing route contracts.
- Phase 5: split billing admin actions behind the existing public facade, with a direct characterization suite added first.
- Phase 6: brought `scripts/*` under lint and replaced the root README with repo-facing project documentation.

## Final Internal Architecture

### Results Domain
- Public boundary:
  - `lib/events/results/actions.ts`
  - `lib/events/results/queries.ts`
  - `lib/events/results/index.ts`
- Internal modules:
  - `lib/events/results/shared/*`
  - `lib/events/results/actions/ingestion.ts`
  - `lib/events/results/actions/finalization.ts`
  - `lib/events/results/actions/claims.ts`
  - `lib/events/results/actions/corrections.ts`

### Group Upload
- Public boundary:
  - `lib/events/group-upload/actions.ts`
- Internal modules:
  - `lib/events/group-upload/schemas.ts`
  - `lib/events/group-upload/file-parser.ts`
  - `lib/events/group-upload/access.ts`
  - `lib/events/group-upload/batch-creation.ts`
  - `lib/events/group-upload/reservation-runner.ts`
  - `lib/events/group-upload/invite-delivery.ts`

### Payments / Cron Route Helpers
- Cron shared boundary logic:
  - `app/api/cron/_shared.ts`
- Payments shared boundary logic:
  - `app/api/payments/_shared.ts`
- Route files remain the public request/response boundary.

### Billing Admin
- Public boundary:
  - `app/actions/billing-admin.ts`
- Internal modules:
  - `app/actions/billing-admin/shared.ts`
  - `app/actions/billing-admin/promotions.ts`
  - `app/actions/billing-admin/pending-grants.ts`
  - `app/actions/billing-admin/overrides.ts`
  - `app/actions/billing-admin/lookup.ts`

### Registration Flow
- Public composition root:
  - `app/[locale]/(public)/events/[seriesSlug]/[editionSlug]/register/registration-flow.tsx`
- Internal state/model:
  - `registration-flow-machine.ts`
  - `use-registration-flow.ts`
- Internal step components:
  - `confirmation-step.tsx`
  - `questions-step.tsx`
  - `addons-step.tsx`
  - `info-step.tsx`
  - `waiver-step.tsx`
  - `distance-step.tsx`
  - `payment-step.tsx`

## Validation Commands Used
- Full final gate:
  - `pnpm test:ci:isolated`
- Core repo checks inside that gate:
  - `pnpm lint`
  - `pnpm generate:i18n`
  - `pnpm type-check`
  - `pnpm validate:locales`
  - `pnpm test:app`
  - `pnpm test:db`
  - `pnpm test:payments-contracts`
  - `pnpm test:e2e:isolated`
- Focused slice checks were also used throughout:
  - results compliance and rankings/public flows
  - group upload DB and E2E coverage
  - payments route suites and organizer/admin payments E2E
  - billing admin characterization tests
  - athlete registration and capacity E2E

## Follow-Up Work Outside Scope
- Add more direct client-level smoke coverage for registration-flow branches that still rely partly on manual verification.
- Keep watching `scripts/*` lint coverage as new scripts are added.
- Treat any future reducer/state-machine redesign for registration as a separate change, not a continuation of this refactor.

## Guidance For Future Contributors
- Keep existing public facades stable:
  - `lib/events/results/actions.ts`
  - `lib/events/group-upload/actions.ts`
  - `app/actions/billing-admin.ts`
  - route files under `app/api/**`
  - `registration-flow.tsx`
- Add new internal behavior to the nearest existing module family instead of growing the facade files again.
- Prefer pure/shared helpers first, then workflow modules, then facade wiring.
- For route handlers, put duplicated boundary logic in `_shared.ts` files only when response literals and status codes stay exact.
- For registration flow, keep state/effects in `use-registration-flow.ts`, pure step logic in `registration-flow-machine.ts`, and step-specific rendering in step components.
