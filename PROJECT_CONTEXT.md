# RunGoMX Web — Structured Project Context

---

## 1. Repository Overview

- **Project type:** Single Next.js web application (not a monorepo)
- **Primary language:** TypeScript (strict mode)
- **Frameworks:** Next.js 16 App Router, React 19, Drizzle ORM, better-auth, next-intl
- **Package manager:** `pnpm`
- **Build system:** Next.js webpack build (`pnpm build`); i18n types/loaders auto-generated before build
- **Test frameworks:**
  - Jest (3 projects: `server`, `client`, `database` — suffix-based dispatch: `.server.test.ts`, `.client.test.tsx`, `.db.test.ts`)
  - Playwright (`e2e/tests/*.spec.ts`)
- **Monorepo tooling:** None — single `package.json` at root

---

## 2. Directory Structure

```
rungomx-web/
├── app/
│   ├── [locale]/
│   │   ├── (admin)/admin/          # Admin area (internal only)
│   │   ├── (auth)/                 # Auth pages (sign-in, sign-up, verify, etc.)
│   │   ├── (protected)/dashboard/  # Organizer/athlete dashboard
│   │   ├── (protected)/settings/   # User settings
│   │   └── (public)/               # Public pages (events, results, rankings, etc.)
│   ├── actions/                    # Server Actions (billing-admin/, profile, roles, payments, etc.)
│   └── api/                        # API routes (auth, cron, events, payments, profile-picture)
├── components/
│   ├── admin/                      # Admin UI (billing, payments, users, pro-features)
│   ├── auth/                       # Auth boundaries, user-avatar
│   ├── billing/                    # Pro status UI, pro-welcome-toast
│   ├── dashboard/                  # Organizer/athlete dashboard UI
│   ├── events/                     # Event display, registration forms
│   ├── layout/navigation/          # Sidebar, drawer, nav components
│   ├── payments/                   # Payment UI components
│   ├── pro-features/               # ProFeatureGate, provider
│   ├── results/                    # Results display (organizer, public, primitives)
│   ├── settings/                   # Settings forms, field components
│   └── ui/                         # Shared primitives (form-field, date-picker, shadcn, etc.)
├── lib/
│   ├── auth/                       # guards.ts, roles.ts, server.ts, client.ts
│   ├── billing/                    # entitlements.ts, guards.ts, lifecycle, commands
│   ├── events/                     # Domain: editions, results, group-upload, payments, etc.
│   ├── forms/                      # useForm, Form, FormError, types
│   ├── payments/                   # admin, core (contracts, mutation-ingress, replay), organizer, etc.
│   ├── pro-features/               # catalog, evaluator, server/guard, server/tracking
│   ├── profiles/                   # profile-form-utils, requirements, metadata
│   └── organizations/              # payout
├── db/                             # schema.ts, relations.ts, index.ts (Drizzle ORM)
├── i18n/                           # routing.ts, request.ts, navigation.ts, generated types/loaders
├── messages/                       # JSON locale files (en/es) per namespace
├── __tests__/                      # All Jest tests (actions, app, components, integration, lib, etc.)
├── e2e/                            # Playwright tests (tests/, utils/, fixtures/)
├── prompts/                        # Standards docs and agent guides
│   ├── auth-stack/                 # roles-agent-guide.md
│   ├── standards/                  # Core standards files + nextjs-caching/
│   └── upgrade-ticketing-system/   # Multi-agent ticketing workflow prompts
├── scripts/                        # i18n generators, validators, e2e runner, commit helpers
├── proxy.ts                        # Next.js middleware (auth redirect + i18n routing)
├── types/                          # Shared TypeScript types
├── hooks/                          # Custom React hooks
├── utils/                          # Config helpers, SEO, locale, metadata
├── config/                         # url.ts (siteUrl)
├── .claude/skills/                 # rungomx-quality-gates, standards-checker, clean-commit
├── .codex/                         # Codex config.toml (Playwright MCP server) + screenshots
├── .agents/skills/                 # BMAD agent skills (large set)
├── _bmad/                          # BMAD module config, agents, workflows
└── _bmad-output/                   # Planning artifacts, sprint artifacts, implementation specs
```

---

## 3. Prompts/Standards Analysis

### Files under `prompts/standards/`

| Path                                                            | Purpose                                                                                     | Type             |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------- |
| `prompts/standards/nextjs-component-implementation.md`          | Server/Client component rules, caching directives, i18n + `use cache` patterns              | architecture     |
| `prompts/standards/nextjs-caching-rules.md`                     | Routing stub pointing to topic card sub-docs                                                | architecture     |
| `prompts/standards/nextjs-caching-index.md`                     | Scenario-to-topic-card index for AI agents selecting which caching doc to load              | architecture     |
| `prompts/standards/nextjs-caching/overview.md`                  | Quick caching orientation                                                                   | architecture     |
| `prompts/standards/nextjs-caching/caching-mechanisms.md`        | Four Next.js caches explained                                                               | architecture     |
| `prompts/standards/nextjs-caching/critical-rules.md`            | What can/cannot be cached                                                                   | coding standard  |
| `prompts/standards/nextjs-caching/directives.md`                | `use cache` variants                                                                        | coding standard  |
| `prompts/standards/nextjs-caching/protected-routes.md`          | Auth layout caching patterns                                                                | architecture     |
| `prompts/standards/nextjs-caching/proxy-vs-layout-auth.md`      | Security layering between proxy and layout                                                  | architecture     |
| `prompts/standards/nextjs-caching/invalidation-revalidation.md` | Cache expiry strategies                                                                     | coding standard  |
| `prompts/standards/nextjs-caching/patterns.md`                  | Decision trees and concrete examples                                                        | coding standard  |
| `prompts/standards/nextjs-caching/checklist.md`                 | Review/QA checklist for caching                                                             | review checklist |
| `prompts/standards/nextjs-caching/quick-reference.md`           | Fast lookup for directives and lifetimes                                                    | coding standard  |
| `prompts/standards/forms-implementation.md`                     | Form system (useForm, FormField, server actions, field components, compliance checklist)    | coding standard  |
| `prompts/standards/pro-features.md`                             | Pro feature gating system: catalog, guards, client hooks, checklist for adding new features | coding standard  |
| `prompts/standards/e2e-testing.md`                              | Playwright E2E patterns, user creation, isolation, selectors, troubleshooting               | testing guidance |
| `prompts/standards/test-reliability.md`                         | CI reliability policy: root fixes only, readiness signals, branch hygiene                   | testing guidance |

### Files under `prompts/auth-stack/`

| Path                                      | Purpose                                                                         | Type         |
| ----------------------------------------- | ------------------------------------------------------------------------------- | ------------ |
| `prompts/auth-stack/roles-agent-guide.md` | Canonical role model, guards, session shape, onboarding order — agent reference | architecture |

### Files under `prompts/upgrade-ticketing-system/`

| Path                                          | Purpose                                                         | Type                |
| --------------------------------------------- | --------------------------------------------------------------- | ------------------- |
| `prompts/upgrade-ticketing-system/01–07_*.md` | Multi-step agent prompt pipeline for dependency upgrade tickets | workflow definition |

### Gaps

- No dedicated database/ORM standards doc (Drizzle patterns undocumented)
- No payments domain standards doc despite payments being a major domain
- No i18n conventions doc (structure/naming exists but undocumented)
- No state machine standards (registration flow uses a custom machine)
- No component visual/design system doc (`.impeccable.md` is design intent, not code standards)

### Overlaps

- Caching rules partially duplicated: `nextjs-component-implementation.md` has a "Quick Reference" section plus full pointer to caching topic cards
- `e2e-testing.md` and `test-reliability.md` both cover reliability expectations (complementary, not conflicting)

---

## 4. Existing Skills

### `.claude/skills/` (repo-local)

| Path                                            | Purpose                                                                     | Typical Use Case                            |
| ----------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------- |
| `.claude/skills/rungomx-quality-gates/SKILL.md` | Runs `pnpm test:ci` and subscopes; reports pass/fail                        | Before declaring work done, after refactors |
| `.claude/skills/standards-checker/SKILL.md`     | Reviews git diff against `/prompts` standards; MUST FIX / SUGGESTION output | Code review on changed files                |
| `.claude/skills/clean-commit/SKILL.md`          | Conventional Commits format, no AI attribution                              | Creating git commits                        |

### `.agents/skills/` (BMAD framework skills)

BMAD modules: `bmm` (PM, dev, QA, architect, SM, UX, tech-writer), `bmb` (agent/module/workflow builder), `cis` (brainstorming, innovation, storytelling), `tea` (testing), `bmad-master`. All exist as skill stubs in `.agents/skills/` and slash commands in `.claude/commands/`. General-purpose framework skills, not repo-specific.

### `.codex/config.toml`

- Defines three Playwright MCP server configurations (`playwright`, `playwright_isolated`, `playwright_persistent`) for Codex-based visual testing and screenshot capture

### `opencode.json`

- MCP servers configured (all disabled by default): `next-devtools`, `codex` (MCP server), `serena`, `better-auth`
- Custom OpenCode repo-local workflow artifacts exist: `default_agent` is `orchestrator`, repo-local agents live under `.opencode/agents/`, and the one-shot workflow command lives at `.opencode/commands/task-flow.md`

---

## 5. Architecture Signals

### Architectural style

- **Next.js 16 App Router** with route group–based separation: `(public)`, `(protected)`, `(admin)`, `(auth)`
- **Server Components by default**; Client Components isolated to leaf interactivity nodes
- **Server Actions** under `app/actions/` as the mutation boundary (not API routes for mutations)
- **API routes** (`app/api/`) reserved for: auth callbacks, cron jobs, external payment webhooks, media upload

### Layering

```
route page.tsx (Server Component, data fetch + auth)
  → client form component (useForm + server action call)
    → server action (app/actions/*): validate + guard + call lib
      → lib domain module: business logic
        → db (Drizzle ORM, Neon PostgreSQL)
```

### Stable public boundaries (do not break)

- `lib/events/results/actions.ts` — results domain facade
- `lib/events/group-upload/actions.ts` — group upload facade
- `app/actions/billing-admin.ts` — billing admin facade
- `registration-flow.tsx` — registration composition root
- Route files under `app/api/**`
- `app/api/cron/_shared.ts` and `app/api/payments/_shared.ts` — boundary helpers

### Domain-driven patterns

- Domain modules under `lib/events/` (results, group-upload, payments, discounts, registrations, etc.)
- Payments domain: `lib/payments/` with sub-domains (admin, artifacts, core, debt, disputes, economics, organizer, payouts, refunds, volume, wallet)
- Pro features: dedicated system in `lib/pro-features/` (catalog, evaluator, server guards, usage tracking)
- Billing: `lib/billing/` (entitlements, guards, lifecycle, commands, emails)

### API contract patterns

- Server Actions return typed `FormActionResult` (`ok: true | false`, `error`, `fieldErrors`, `message`, `data`)
- Guards throw typed errors: `UnauthenticatedError`, `ForbiddenError`, `ProfileIncompleteError`
- Payments: mutation ingress contracts with replay, contracts registry, snapshot generation script

### State management

- No global state library (no Redux, Zustand, Jotai)
- Auth/session state via Better Auth `useSession()`
- Pro features snapshot via `getProFeaturesSnapshotAction` + `ProFeaturesProvider` (React context)
- Form state via `useForm` in `lib/forms`
- Registration flow state via `registration-flow-machine.ts` + `use-registration-flow.ts` (custom machine)

### Key invariants

- Proxy handles i18n routing + auth redirects **before** layout auth — proxy is the security boundary
- Layout auth is a UX guard (redirect only); proxy prevents unauthenticated rendering
- Server Actions are the only mutation path for forms
- Pro feature client gating **fails open**; server enforcement is mandatory for all write paths
- Internal users bypass profile completion enforcement
- DB cleanup order in tests must respect FK dependencies

---

## 6. Coding Standards Signals

### Naming conventions

- Files: `kebab-case` throughout
- Test file suffix encodes environment: `.server.test.ts` (Node), `.client.test.tsx` (jsdom), `.db.test.ts` (real DB sequential)
- E2E specs: semantic feature names, never phase/sprint prefixed
- Server Actions: `verbNounAction` convention (e.g. `upsertProfileAction`, `assignExternalRoles`)
- Locale messages: namespace per feature area, `en.json` + `es.json` pairs mirroring `messages/pages/<area>/`

### File structure patterns

- Route pages always Server Components; interactive parts extracted to dedicated client files
- `configPageLocale()` called at top of every i18n page before any data fetching
- Heavy client inputs use `next/dynamic` with `FormFieldSkeleton` as loading state
- `_shared.ts` for private internal boundary helpers in route families

### Component structure

- `'use client'` at top of file for all interactive components
- shadcn/ui (`components/ui/`) as primitive layer; Radix UI used directly where shadcn doesn't cover

### Typing approach

- TypeScript strict mode
- Drizzle inferred types for DB entities
- Zod schemas for server action validation
- `FormActionResult<T>` generic for all server action return types

### Error handling patterns

- Server actions return structured error objects (never throw to client)
- Guards throw typed error classes; server actions catch and map to `FormActionResult`
- `sonner` toast for non-field errors and success messages

### Prettier config

- `printWidth: 100`, `singleQuote: true`, `trailingComma: all`, `tabWidth: 2`, `semi: true`

---

## 7. Testing Strategy

### Test frameworks

- **Jest** (unit/integration): 3 separate projects by file suffix
- **Playwright** (E2E): single worker, sequential, `e2e/tests/*.spec.ts`

### Test location patterns

- Jest: `__tests__/` at repo root mirroring source structure
- Playwright: `e2e/tests/` specs, `e2e/utils/` (db, fixtures, helpers), `e2e/fixtures/` (static data)
- Some lib tests co-located: `lib/forms/__tests__/`

### Test naming conventions

- Jest: `*.server.test.ts`, `*.client.test.tsx`, `*.db.test.ts`
- Playwright: `<feature-area>.spec.ts`

### E2E vs unit vs integration

- **Unit/server:** Server component rendering, action logic, guard behavior, lib utilities
- **DB tests:** Real Neon branch, sequential, `maxWorkers: 1`; registration flows, billing lifecycle, discount codes
- **Integration:** `__tests__/integration/` — multi-layer flows (password change, pro-features guard, profile update, i18n workflow)
- **E2E:** Full user journeys: auth, event creation, athlete registration, payments, pro features, public pages

### Mocking approach

- DB tests use real Neon test DB branch (`.env.test`)
- E2E: users created via signup endpoint in `beforeAll`; email verification bypassed via DB; FK-safe DB cleaned in global setup/teardown
- No hardcoded test accounts; unique email prefixes per test file

### Coverage expectations

- No explicit coverage threshold configured
- "Green signal" = `pnpm test:ci:isolated` only (full gate)
- Partial gates explicitly not sufficient for branch stability

---

## 8. Domain Language

### User roles

| Role      | Canonical ID         | Description                                  |
| --------- | -------------------- | -------------------------------------------- |
| Admin     | `internal.admin`     | Internal; full platform control              |
| Staff     | `internal.staff`     | Internal; staff tools, no full admin power   |
| Organizer | `external.organizer` | Creates and manages events                   |
| Athlete   | `external.athlete`   | Registers for events (default external role) |
| Volunteer | `external.volunteer` | Supports events                              |

### Product concepts

- **Event / Series / Edition** — `series` is the brand; `edition` is a specific occurrence (year/label)
- **Registration** — athlete enrollment in an edition with distance selection
- **Distance** — a race category within an edition (10K, 21K, 42K, trail, etc.)
- **Group registration / Group upload** — bulk CSV enrollment
- **Results** — official race timing results with lifecycle states
- **Rankings** — aggregated athlete performance
- **Pro membership** — subscription granting Pro features
- **Pro feature** — individual capability gated by membership + admin config
- **Payout** — organizer payment disbursement
- **Wallet / Dispute / Refund / Discount / Coupon** — payment sub-concepts

### Workflow names

- **Registration flow** — distance → info → questions → add-ons → waiver → payment → confirmation
- **Group upload flow** — CSV batch upload with invite delivery
- **Results ingestion/finalization** — ingestion, claims, corrections, finalization lifecycle
- **Profile completion** — mandatory for external users before accessing protected features
- **Role assignment** — self-service external role selection modal
- **Claim invite** — invite-link–based organization claim

### Feature areas

- Public site (event discovery, about, contact, results public, rankings)
- Dashboard (event management, registration management, settings)
- Payments (organizer payouts, admin overview, risk, operations, investigation)
- Admin panel (user management, billing admin, pro features admin, payments admin)
- Results (publishing, rankings, public display)
- Billing/Pro (subscriptions, promotions, upsell)

---

## 9. Workflow Conventions

### Commit standard

- Conventional Commits: `type(scope): summary` (≤72 chars, imperative, no period)
- Enforced via `scripts/clean-commit-msg.sh` (`commit-msg` git hook via `simple-git-hooks`)
- No AI attribution, co-author lines, or "Generated with" text
- `lint-staged` pre-commit: `pnpm generate:i18n` + `pnpm validate:locales` on message JSON changes

### CI/Quality gate

```bash
pnpm test:ci:isolated
# = lint + generate:i18n + type-check + validate:locales + test:app + test:db + test:payments-contracts + test:e2e:isolated
```

- `test:e2e:isolated` builds a separate `.next-e2e/` instance
- Only this full gate counts as a reliable green signal

### PR/Review workflow

- `standards-checker` skill acts as AI PR reviewer against `/prompts`
- UNKNOWN: whether GitHub Actions CI is configured (no `.github/workflows/` found)

### Refactor workflow (documented)

- Pattern: establish public facades → decompose internals → add characterization tests first → validate with focused checks → final full gate
- BMAD framework used for sprint planning, story creation, architect analysis

### i18n workflow

- Message files: `messages/<namespace>/<locale>.json` (en + es)
- Types/loaders auto-generated: `pnpm generate:i18n` (build, pre-commit, type-check)
- `pnpm validate:locales` enforces en/es parity
- `pnpm watch:i18n` in dev mode

---

## 10. Constraints / Special Considerations

- **Locales:** Spanish (default, no prefix) and English (`/en/`); `DEFAULT_TIMEZONE = 'America/Mexico_City'`
- **Database:** Neon serverless PostgreSQL; test DB is a separate Neon branch; `.env.test` required for DB/E2E tests
- **Deployment target:** Vercel
- **E2E isolation:** `pnpm test:e2e:isolated` required (builds `.next-e2e/`); plain `test:e2e` requires running dev server
- **Playwright workers:** Forced to 1 (sequential) to prevent Neon deadlocks
- **Jest client project:** Skipped in CI (`isCI` check) due to React Testing Library issues on Vercel
- **ESLint import restriction:** `@/lib/profiles` barrel import blocked in client components (pulls DB)
- **Pro feature fail-open:** Client Pro feature checks must never be the security boundary
- **Phone inputs:** Must use `fillPhoneInput()` helper (`pressSequentially()` with delay); `.fill()` breaks validation

---

## 11. Important Files to Preserve Behavior

| File                                                    | Why important                                                                                                    |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `proxy.ts`                                              | Security boundary: auth guard + i18n routing before Next.js rendering                                            |
| `lib/auth/guards.ts`                                    | Guard contract: `requireAuthenticatedUser`, `requireAdminUser`, `requireStaffUser`, `requireProfileCompleteUser` |
| `lib/auth/roles.ts`                                     | Role registry: canonical roles, permissions, profile requirement categories                                      |
| `lib/auth/server.ts`                                    | `getAuthContext()` — primary auth entrypoint for server components                                               |
| `lib/pro-features/catalog.ts`                           | Pro feature registry: feature keys, defaults, enforcement metadata                                               |
| `lib/pro-features/evaluator.ts`                         | Decision engine for feature access                                                                               |
| `lib/pro-features/server/guard.tsx`                     | `requireProFeature`, `guardProFeaturePage` — server enforcement                                                  |
| `lib/events/results/actions.ts`                         | Public results facade (stable boundary)                                                                          |
| `lib/events/group-upload/actions.ts`                    | Public group-upload facade (stable boundary)                                                                     |
| `app/actions/billing-admin.ts`                          | Public billing-admin facade (stable boundary)                                                                    |
| `registration-flow.tsx`                                 | Composition root for registration (stable boundary)                                                              |
| `app/api/cron/_shared.ts`                               | Cron authorization boundary helper                                                                               |
| `app/api/payments/_shared.ts`                           | Payments route boundary helper                                                                                   |
| `db/schema.ts`                                          | Drizzle ORM schema — canonical type source                                                                       |
| `i18n/routing.ts`                                       | Locale routing config including `DEFAULT_TIMEZONE`                                                               |
| `lib/forms/use-form.ts`                                 | Shared form hook — form state contract                                                                           |
| `lib/billing/entitlements.ts`                           | Pro membership source of truth                                                                                   |
| `prompts/auth-stack/roles-agent-guide.md`               | Agent mental model for auth/roles                                                                                |
| `REFACTOR_HANDOFF.md`                                   | Documented public/private boundary decisions from refactor program                                               |
| `prompts/standards/test-reliability.md`                 | Green signal definition and root-fix policy                                                                      |
| `e2e/utils/db.ts`                                       | FK-safe cleanup order; high-risk shared helper                                                                   |
| `scripts/payments/generate-event-registry-snapshots.ts` | Payments contract generation                                                                                     |
