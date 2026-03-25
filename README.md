# RunGoMx Web

Next.js 16 application for public event discovery and registration, organizer workflows, results publishing, payments operations, and internal billing administration.

## Stack

- Next.js 16 App Router
- React 19
- TypeScript with strict mode
- Drizzle ORM
- Jest and Playwright
- `pnpm`

## Setup

1. Install dependencies:

```bash
pnpm install
```

2. Configure environment files:

- local development uses `.env.local`
- tests and isolated E2E use `.env.test`

3. Start development:

```bash
pnpm dev
```

`pnpm dev` runs the i18n watcher and the Next.js dev server. The dev server reads `PORT` from env files if present; otherwise it defaults to `8080`.

## Core Commands

Development and build:

```bash
pnpm dev
pnpm dev:no-watch
pnpm build
pnpm start
```

Static validation:

```bash
pnpm lint
pnpm generate:i18n
pnpm type-check
pnpm validate:locales
```

Tests:

```bash
pnpm test
pnpm test:app
pnpm test:db
pnpm test:results-compliance
pnpm test:payments-contracts
pnpm test:e2e:isolated
```

Full local CI-equivalent gate:

```bash
pnpm test:ci:isolated
```

## Refactor-Relevant Architecture

### Results Domain

Public boundary remains:

- [actions.ts](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/dev-alt/lib/events/results/actions.ts)
- [queries.ts](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/dev-alt/lib/events/results/queries.ts)
- [state-machine.ts](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/dev-alt/lib/events/results/lifecycle/state-machine.ts)
- [index.ts](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/dev-alt/lib/events/results/index.ts)

Internal modules now separate shared helpers and workflow concerns:

- [mappers.ts](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/dev-alt/lib/events/results/shared/mappers.ts)
- [errors.ts](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/dev-alt/lib/events/results/shared/errors.ts)
- [audit.ts](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/dev-alt/lib/events/results/shared/audit.ts)
- [cache.ts](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/dev-alt/lib/events/results/shared/cache.ts)
- [ingestion.ts](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/dev-alt/lib/events/results/actions/ingestion.ts)
- [finalization.ts](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/dev-alt/lib/events/results/actions/finalization.ts)
- [claims.ts](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/dev-alt/lib/events/results/actions/claims.ts)
- [corrections.ts](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/dev-alt/lib/events/results/actions/corrections.ts)

### Group Upload

Public boundary remains:

- [actions.ts](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/dev-alt/lib/events/group-upload/actions.ts)

Internal capability modules:

- [schemas.ts](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/dev-alt/lib/events/group-upload/schemas.ts)
- [file-parser.ts](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/dev-alt/lib/events/group-upload/file-parser.ts)
- [access.ts](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/dev-alt/lib/events/group-upload/access.ts)
- [batch-creation.ts](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/dev-alt/lib/events/group-upload/batch-creation.ts)
- [reservation-runner.ts](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/dev-alt/lib/events/group-upload/reservation-runner.ts)
- [invite-delivery.ts](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/dev-alt/lib/events/group-upload/invite-delivery.ts)

### Payments and Cron Route Helpers

Route files remain the public boundary. Shared boundary helpers now live in:

- [app/api/cron/_shared.ts](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/dev-alt/app/api/cron/_shared.ts)
- [app/api/payments/_shared.ts](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/dev-alt/app/api/payments/_shared.ts)

These helpers cover:

- standard cron authorization
- authenticated payments context
- JSON/query/route-param parsing
- organizer read/write access checks
- active organization lookup
- a small set of literal-preserving shared responses

### Billing Admin Actions

Public boundary remains:

- [billing-admin.ts](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/dev-alt/app/actions/billing-admin.ts)

Internal modules:

- [shared.ts](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/dev-alt/app/actions/billing-admin/shared.ts)
- [promotions.ts](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/dev-alt/app/actions/billing-admin/promotions.ts)
- [pending-grants.ts](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/dev-alt/app/actions/billing-admin/pending-grants.ts)
- [overrides.ts](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/dev-alt/app/actions/billing-admin/overrides.ts)
- [lookup.ts](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/dev-alt/app/actions/billing-admin/lookup.ts)

### Registration Flow

Public composition root remains:

- [registration-flow.tsx](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/dev-alt/app/[locale]/(public)/events/[seriesSlug]/[editionSlug]/register/registration-flow.tsx)

Internal flow structure:

- [registration-flow-machine.ts](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/dev-alt/app/[locale]/(public)/events/[seriesSlug]/[editionSlug]/register/registration-flow-machine.ts)
- [use-registration-flow.ts](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/dev-alt/app/[locale]/(public)/events/[seriesSlug]/[editionSlug]/register/use-registration-flow.ts)
- [distance-step.tsx](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/dev-alt/app/[locale]/(public)/events/[seriesSlug]/[editionSlug]/register/distance-step.tsx)
- [info-step.tsx](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/dev-alt/app/[locale]/(public)/events/[seriesSlug]/[editionSlug]/register/info-step.tsx)
- [questions-step.tsx](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/dev-alt/app/[locale]/(public)/events/[seriesSlug]/[editionSlug]/register/questions-step.tsx)
- [addons-step.tsx](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/dev-alt/app/[locale]/(public)/events/[seriesSlug]/[editionSlug]/register/addons-step.tsx)
- [waiver-step.tsx](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/dev-alt/app/[locale]/(public)/events/[seriesSlug]/[editionSlug]/register/waiver-step.tsx)
- [payment-step.tsx](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/dev-alt/app/[locale]/(public)/events/[seriesSlug]/[editionSlug]/register/payment-step.tsx)
- [confirmation-step.tsx](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/dev-alt/app/[locale]/(public)/events/[seriesSlug]/[editionSlug]/register/confirmation-step.tsx)

The registration flow intentionally stopped short of reducer consolidation because the extracted machine and hook boundaries removed enough complexity without raising transition risk.

## Focused Validation Guidance

When working in the refactored hotspots, prefer the smallest reliable checks first:

- Results:
  - `pnpm test:results-compliance`
  - targeted server tests under `__tests__/lib/events/results/**`
  - `pnpm test:e2e:isolated e2e/tests/results-rankings-public.spec.ts`
- Group upload:
  - targeted tests under `__tests__/lib/*group*`, `__tests__/lib/invite-claim.db.test.ts`, and `__tests__/app/claim-invite-page.server.test.tsx`
  - `pnpm test:e2e:isolated e2e/tests/group-upload.spec.ts`
- Payments and cron:
  - targeted route tests under `__tests__/app/api/payments/**` and `__tests__/api/cron/**`
  - `pnpm test:e2e:isolated e2e/tests/organizer-payments.spec.ts`
- Billing admin:
  - `pnpm -s test:app --runTestsByPath __tests__/actions/billing-admin.server.test.ts`
- Registration flow:
  - `pnpm test:e2e:isolated e2e/tests/athlete-registration.spec.ts`
  - `pnpm test:e2e:isolated e2e/tests/capacity-enforcement.spec.ts`

For highest confidence after cross-cutting changes, use:

```bash
pnpm test:ci:isolated
```

## Known Note

`__tests__/lib/start-registration-restrictions.db.test.ts` has been tracked as an unrelated issue during the refactor program. It is not treated as a refactor regression unless a future investigation proves otherwise.
