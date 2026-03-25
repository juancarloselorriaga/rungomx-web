# Event AI Wizard Layer: Production-Grade Redesign Plan

## 1. Executive diagnosis

The current system already *behaves* like a proposal-first assistant with explicit apply, but architecturally it is still implemented as two “god modules” plus scattered step identity logic.

- The AI proposal pipeline is collapsed into a single 3,113-line route handler that mixes: request parsing, permissions + Pro gating + rate limiting, intent routing, deterministic handlers, prompt construction, tool wiring, model selection, patch enrichment, patch reprojection, and UI stream shaping. See [app/api/events/ai-wizard/route.ts](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/ai-event/app/api/events/ai-wizard/route.ts).
- The client-side assistant UI is likewise monolithic (2,282 lines) and mixes: chat transport, proposal extraction, location choice UX, apply execution calls, continuity/session storage, and latency marks in one file. See [app/[locale]/(protected)/dashboard/events/[eventId]/settings/event-ai-wizard-panel.tsx](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/ai-event/app/%5Blocale%5D/(protected)/dashboard/events/%5BeventId%5D/settings/event-ai-wizard-panel.tsx).
- Step identity is duplicated in at least four places (Zod enum, UI unions, wizard shell unions, route request schema) and the “issue step → assistant step” mapping is copy/pasted in multiple modules, which guarantees drift. See [lib/events/ai-wizard/schemas.ts](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/ai-event/lib/events/ai-wizard/schemas.ts), [lib/events/wizard/types.ts](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/ai-event/lib/events/wizard/types.ts), [app/[locale]/(protected)/dashboard/events/[eventId]/settings/event-setup-wizard-shell.tsx](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/ai-event/app/%5Blocale%5D/(protected)/dashboard/events/%5BeventId%5D/settings/event-setup-wizard-shell.tsx), and the duplicated mapping in [app/[locale]/(protected)/dashboard/events/[eventId]/settings/page.tsx](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/ai-event/app/%5Blocale%5D/(protected)/dashboard/events/%5BeventId%5D/settings/page.tsx) and [app/api/events/ai-wizard/route.ts](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/ai-event/app/api/events/ai-wizard/route.ts).
- The “AI subsystem” is not cleanly separated from the non-AI wizard domain today: core wizard readiness uses utilities living under the AI folder (datetime trust/normalization), creating an inverted dependency. See the import from `@/lib/events/ai-wizard/datetime` in [lib/events/wizard/orchestrator.ts](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/ai-event/lib/events/wizard/orchestrator.ts) and the shared usage in [app/[locale]/(protected)/dashboard/events/[eventId]/settings/event-settings-form.tsx](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/ai-event/app/%5Blocale%5D/(protected)/dashboard/events/%5BeventId%5D/settings/event-settings-form.tsx) and [app/[locale]/(protected-fullscreen)/dashboard/events/new/create-event-form.tsx](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/ai-event/app/%5Blocale%5D/(protected-fullscreen)/dashboard/events/new/create-event-form.tsx).
- Patch “reprojection” (server recomputation of checklist/routing after a proposal) is directionally correct, but the current projection implementation contains approximations that can misstate readiness, especially around pricing and new distances. See `buildProjectedAggregate()` in [app/api/events/ai-wizard/route.ts](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/ai-event/app/api/events/ai-wizard/route.ts) (e.g. setting `hasPricingTier` across *all* distances when *any* pricing op exists, and projecting new distances from templates instead of op data).
- Deterministic and model-driven behaviors are mixed in one route; adding a new deterministic handler or fast path requires editing route monolith, increasing regression risk. Evidence: the stream route contains `resolveCrossStepIntent`, `detectFastPathKind`, deterministic follow-up patch builders, prompt building, tool definitions, and model selection in one file. See [app/api/events/ai-wizard/route.ts](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/ai-event/app/api/events/ai-wizard/route.ts).
- Observability exists for “blocked” and “applied” events, but there is no first-class telemetry for proposal routing/mode selection, proposal validity, reprojection correction rate, and clarification rate. See `trackProFeatureEvent()` usage in [app/api/events/ai-wizard/route.ts](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/ai-event/app/api/events/ai-wizard/route.ts) and [app/api/events/ai-wizard/apply/route.ts](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/ai-event/app/api/events/ai-wizard/apply/route.ts).

Net: the *design* is mostly right; the main problems are boundary/ownership violations and implementation debt (route+UI monoliths, duplicated step identity, and projection correctness).

## 2. What should be preserved

- Proposal-first + explicit user apply: stream emits proposals (`data-event-patch`) and apply is a separate strict boundary. See [app/api/events/ai-wizard/route.ts](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/ai-event/app/api/events/ai-wizard/route.ts) and [app/api/events/ai-wizard/apply/route.ts](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/ai-event/app/api/events/ai-wizard/apply/route.ts), plus the UI apply call in [app/[locale]/(protected)/dashboard/events/[eventId]/settings/event-ai-wizard-panel.tsx](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/ai-event/app/%5Blocale%5D/(protected)/dashboard/events/%5BeventId%5D/settings/event-ai-wizard-panel.tsx).
- Narrow, allowlisted, reviewable patches: Zod discriminated union ops, strict payloads, and the `markdownOutputs` “must mirror writes exactly” invariant. See [lib/events/ai-wizard/schemas.ts](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/ai-event/lib/events/ai-wizard/schemas.ts) and its tests in [__tests__/lib/events/ai-wizard-schemas.server.test.ts](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/ai-event/__tests__/lib/events/ai-wizard-schemas.server.test.ts).
- Server-owned readiness semantics and truth conflict blockers: the base wizard orchestrator is the canonical source of “missing/blockers/recommendations” and publish readiness. See [lib/events/wizard/orchestrator.ts](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/ai-event/lib/events/wizard/orchestrator.ts).
- Server-owned reprojection of patch meta: `finalizeWizardPatchForUi()` rebuilds checklist and routing from the projected aggregate, ignoring model-supplied values. See [app/api/events/ai-wizard/route.ts](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/ai-event/app/api/events/ai-wizard/route.ts) and the behavior tests in [__tests__/app/api/events/ai-wizard/route.server.test.ts](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/ai-event/__tests__/app/api/events/ai-wizard/route.server.test.ts).
- Deterministic safety and guardrails: text/patch safety filters and rate limiting. See [lib/events/ai-wizard/safety.ts](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/ai-event/lib/events/ai-wizard/safety.ts) and [app/api/events/ai-wizard/route.ts](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/ai-event/app/api/events/ai-wizard/route.ts).
- Location resolution as a first-class, server-owned workflow (matched/ambiguous/no_match + explicit user choice when ambiguous). See [lib/events/ai-wizard/location-resolution.ts](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/ai-event/lib/events/ai-wizard/location-resolution.ts), the choiceRequest shaping in [app/api/events/ai-wizard/route.ts](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/ai-event/app/api/events/ai-wizard/route.ts), and the UI in [app/[locale]/(protected)/dashboard/events/[eventId]/settings/event-ai-wizard-panel.tsx](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/ai-event/app/%5Blocale%5D/(protected)/dashboard/events/%5BeventId%5D/settings/event-ai-wizard-panel.tsx).
- Fast-path compact prompt mode and forced tool choice for copy heavy tasks: route chooses fast model and step budgets; prompt has compactMode. Evidence: model selection in [app/api/events/ai-wizard/route.ts](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/ai-event/app/api/events/ai-wizard/route.ts) and compact prompt behavior in [lib/events/ai-wizard/prompt.ts](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/ai-event/lib/events/ai-wizard/prompt.ts).
- “No generic chat drift”: history normalization strips prior patch blobs and long markdown before model conversion. See `normalizeUiMessagesForModelConversion()` in [app/api/events/ai-wizard/route.ts](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/ai-event/app/api/events/ai-wizard/route.ts).

## 3. Target architecture

### Bounded subsystem: “Event AI Wizard”

A production subsystem responsible for turning organizer intent into *proposals* (patches) and safely applying them, without polluting the base wizard domain.

### Modules (proposed ownership boundaries)

- Base wizard domain (canonical truth and readiness):
  - `WizardReadinessService` (existing): `buildEventWizardAggregate()` stays authoritative. See [lib/events/wizard/orchestrator.ts](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/ai-event/lib/events/wizard/orchestrator.ts).
  - Canonical step model + mappings live here (not in AI).
- AI wizard subsystem (bounded “assistant” domain):
  - Request parsing + message normalization (currently embedded in route).
  - Intent router (diagnosis vs deterministic vs fast-path vs general model).
  - Scoped context builder (step + intent + mode driven).
  - Proposal generator (deterministic handlers and model-driven tool invocations).
  - Patch finalizer (server reprojection + location metadata + UI contract shaping).
  - Apply engine (strict preflight + transactional execution + audit/telemetry).
  - Telemetry/evaluation hooks (mode selection, validity, correction rates).

### Main request-to-proposal flow (explicit pipeline)

1. Parse request (validate, normalize UI messages, extract latest user intent).
2. Canonicalize step + intent (single router output: `ExecutionPlan`).
3. Build scoped context (fetch only what this step/mode needs; resolve location only when needed).
4. Choose execution mode (deterministic vs model-driven, fast-path tool selection, model/budget).
5. Generate proposal or clarification/diagnosis text (deterministic path never touches model).
6. Validate + reproject patch against server truth (compute checklist/routing from projected aggregate).
7. Emit stable UI contract (stream parts + patch data).
8. Emit observability events.

### Main proposal-to-apply flow (separate trust boundary)

1. Apply endpoint validates patch schema + safety.
2. Strict preflight (IDs exist, tier overlaps, slug collisions, datetime normalization).
3. Execute ops through server actions / transactional DB writes (audit logs where needed).
4. Track apply outcome and return applied op results.

### Integration with base wizard (decoupled)

- Base wizard shell remains a pure step-orchestrator and editor host. See [app/[locale]/(protected)/dashboard/events/[eventId]/settings/event-setup-wizard-shell.tsx](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/ai-event/app/%5Blocale%5D/(protected)/dashboard/events/%5BeventId%5D/settings/event-setup-wizard-shell.tsx).
- The settings page integrates via a thin “assistant slot” component and stable API endpoints, not by embedding AI routing/prompt logic. Today that coupling exists in [app/[locale]/(protected)/dashboard/events/[eventId]/settings/page.tsx](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/ai-event/app/%5Blocale%5D/(protected)/dashboard/events/%5BeventId%5D/settings/page.tsx); the redesign should remove AI-specific decision-making from that page.

## 4. Canonical interfaces and contracts

### Canonical step model

- Single exported runtime list + type for setup steps (used by Zod enums, URL parsing, UI unions, and routing). Today it is duplicated across:
  - [lib/events/ai-wizard/schemas.ts](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/ai-event/lib/events/ai-wizard/schemas.ts)
  - [lib/events/wizard/types.ts](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/ai-event/lib/events/wizard/types.ts)
  - [app/[locale]/(protected)/dashboard/events/[eventId]/settings/event-setup-wizard-shell.tsx](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/ai-event/app/%5Blocale%5D/(protected)/dashboard/events/%5BeventId%5D/settings/event-setup-wizard-shell.tsx)
  - [app/[locale]/(protected)/dashboard/events/[eventId]/settings/event-ai-wizard-panel.tsx](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/ai-event/app/%5Blocale%5D/(protected)/dashboard/events/%5BeventId%5D/settings/event-ai-wizard-panel.tsx)

### Base wizard → AI subsystem boundary

- `WizardAggregateView` (derived, stable) that exposes:
  - prioritized checklist items already mapped to setup steps
  - step diagnosis (basics/pricing today; review/policies/content can be computed deterministically as now)
  - publish blockers and truth-conflict blockers
- This eliminates duplicated `mapIssueStepId()` currently present in both [app/api/events/ai-wizard/route.ts](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/ai-event/app/api/events/ai-wizard/route.ts) and [app/[locale]/(protected)/dashboard/events/[eventId]/settings/page.tsx](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/ai-event/app/%5Blocale%5D/(protected)/dashboard/events/%5BeventId%5D/settings/page.tsx), and centralizes mapping currently hidden as `mapIssueToSetupStepId()` inside [lib/events/wizard/orchestrator.ts](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/ai-event/lib/events/wizard/orchestrator.ts).

### AI stream contract

- Keep `EventAiWizardUIMessage` and stream data parts as the stable UI protocol. See [lib/events/ai-wizard/ui-types.ts](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/ai-event/lib/events/ai-wizard/ui-types.ts).

### Proposal contract

- Keep `EventAiWizardPatch` and `EventAiWizardOp` as the allowlisted patch language (schema-backed). See [lib/events/ai-wizard/schemas.ts](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/ai-event/lib/events/ai-wizard/schemas.ts).
- Split “proposal core” vs “server UI meta” conceptually even if the wire shape stays the same:
  - Proposal core: `{ title, summary, ops, markdownOutputs }`
  - Server meta: `{ missingFieldsChecklist, intentRouting, crossStepIntent, locationResolution, choiceRequest }`
  - Server meta must be overwritten by the patch finalizer, never trusted from the model (already mostly true via `finalizeWizardPatchForUi()`).

### Apply engine contract

- `ApplyRequest`: (already) `eventAiWizardApplyRequestSchema`.
- `ApplyResult`: `{ ok: true, applied: Array<{ opIndex, type, result? }> }` plus structured error codes (already in apply route responses). See [app/api/events/ai-wizard/apply/route.ts](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/ai-event/app/api/events/ai-wizard/apply/route.ts).

### Location subsystem contract

- Keep location resolution server-owned (`matched`/`ambiguous`/`no_match`) and encode user choice via `choiceRequest`. See [lib/events/ai-wizard/location-resolution.ts](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/ai-event/lib/events/ai-wizard/location-resolution.ts) and [lib/events/ai-wizard/schemas.ts](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/ai-event/lib/events/ai-wizard/schemas.ts).

## 5. Refactor plan by phases

### Phase 1: Canonicalize step IDs + centralize step mapping (low risk, high leverage)

- Create a single runtime `SETUP_STEP_IDS` export and type, and use it everywhere.
- Export the “issue step → setup step” mapping from the base wizard domain and remove duplicates.
- Likely touch:
  - [lib/events/wizard/types.ts](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/ai-event/lib/events/wizard/types.ts)
  - [lib/events/wizard/orchestrator.ts](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/ai-event/lib/events/wizard/orchestrator.ts)
  - [lib/events/ai-wizard/schemas.ts](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/ai-event/lib/events/ai-wizard/schemas.ts)
  - [app/api/events/ai-wizard/route.ts](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/ai-event/app/api/events/ai-wizard/route.ts)
  - [app/[locale]/(protected)/dashboard/events/[eventId]/settings/page.tsx](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/ai-event/app/%5Blocale%5D/(protected)/dashboard/events/%5BeventId%5D/settings/page.tsx)

### Phase 2: Fix ownership inversion by moving shared datetime utilities out of AI

- Move `hasTrustedEventStartTime`, date/time normalization/formatters currently in [lib/events/ai-wizard/datetime.ts](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/ai-event/lib/events/ai-wizard/datetime.ts) into a neutral domain module (`lib/events/datetime/*` or `lib/events/wizard/datetime/*`).
- Update imports in:
  - [lib/events/wizard/orchestrator.ts](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/ai-event/lib/events/wizard/orchestrator.ts)
  - [app/[locale]/(protected)/dashboard/events/[eventId]/settings/event-settings-form.tsx](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/ai-event/app/%5Blocale%5D/(protected)/dashboard/events/%5BeventId%5D/settings/event-settings-form.tsx)
  - [app/api/events/ai-wizard/apply/route.ts](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/ai-event/app/api/events/ai-wizard/apply/route.ts)
  - [app/[locale]/(protected-fullscreen)/dashboard/events/new/create-event-form.tsx](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/ai-event/app/%5Blocale%5D/(protected-fullscreen)/dashboard/events/new/create-event-form.tsx)

### Phase 3: Extract the patch finalizer (projection + meta rebuild) into a first-class module

- Move these out of the stream route into `lib/events/ai-wizard/server/*`:
  - projection (`projectWebsiteContent`, `buildProjectedAggregate`)
  - finalization (`finalizeWizardPatchForUi`, choiceRequest shaping, location serialization)
- Tighten correctness during extraction (especially per-distance pricing projection), backed by tests.
- Likely touch:
  - [app/api/events/ai-wizard/route.ts](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/ai-event/app/api/events/ai-wizard/route.ts)
  - [__tests__/app/api/events/ai-wizard/route.server.test.ts](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/ai-event/__tests__/app/api/events/ai-wizard/route.server.test.ts)

### Phase 4: Make execution modes explicit via a pipeline coordinator

- Extract “plan selection” and “execution” from the route into modules:
  - router (`diagnosis`, `deterministic follow-up`, `fast path`, `general patch`)
  - context builder (fetch + readiness + location resolution only when needed)
  - model runner (tools + budgets + model selection)
- Keep the wire protocol unchanged so the UI doesn’t move.
- Likely touch:
  - [app/api/events/ai-wizard/route.ts](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/ai-event/app/api/events/ai-wizard/route.ts)
  - [lib/events/ai-wizard/prompt.ts](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/ai-event/lib/events/ai-wizard/prompt.ts)

### Phase 5: Extract apply engine + shared guards

- Turn apply route into an adapter; move preflight + op execution into `ApplyEngine`.
- Consolidate duplicated guard logic between stream/apply (auth, Pro gate, membership role checks, rate limiting, error mapping).
- Likely touch:
  - [app/api/events/ai-wizard/apply/route.ts](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/ai-event/app/api/events/ai-wizard/apply/route.ts)
  - [__tests__/app/api/events/ai-wizard/apply.route.server.test.ts](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/ai-event/__tests__/app/api/events/ai-wizard/apply.route.server.test.ts)

### Phase 6: Observability + evaluation hooks

- Add structured events for:
  - mode selection
  - proposal emitted
  - reprojection correction deltas
  - apply outcomes and failure categories
- Keep using the existing `trackProFeatureEvent` pipeline unless there’s a concrete need for a new sink. See current tracking in [app/api/events/ai-wizard/apply/route.ts](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/ai-event/app/api/events/ai-wizard/apply/route.ts) and blocked tracking in [app/api/events/ai-wizard/route.ts](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/ai-event/app/api/events/ai-wizard/route.ts).

## 6. Risks and regressions to watch

- Step drift regressions: wrong checklist routing, wrong cross-step handoff, wrong “go to step” behavior if step IDs/mappings remain duplicated.
- Stream protocol regressions: the UI depends on `data-notification`, `data-fast-path-structure`, `data-early-prose`, and `data-event-patch` semantics. See [lib/events/ai-wizard/ui-types.ts](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/ai-event/lib/events/ai-wizard/ui-types.ts) and the client onData handlers in [app/[locale]/(protected)/dashboard/events/[eventId]/settings/event-ai-wizard-panel.tsx](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/ai-event/app/%5Blocale%5D/(protected)/dashboard/events/%5BeventId%5D/settings/event-ai-wizard-panel.tsx).
- Projection regressions: fixing projection correctness will change missingFieldsChecklist/intentRouting behavior. That’s correct, but it will be user-visible and needs tight tests.
- Location workflow regressions: ambiguous choice requests must remain stable and apply-safe (no accidental coordinate invention). See [lib/events/ai-wizard/location-resolution.ts](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/ai-event/lib/events/ai-wizard/location-resolution.ts).
- Apply semantics regressions: timezone conversion, website overview replacement vs append, pricing overlap preflight, slug collision behavior. See [app/api/events/ai-wizard/apply/route.ts](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/ai-event/app/api/events/ai-wizard/apply/route.ts).
- Prompt regressions: refactoring context assembly can change model outputs; protect with prompt invariants in tests. See [__tests__/lib/events/ai-wizard-prompt.server.test.ts](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/ai-event/__tests__/lib/events/ai-wizard-prompt.server.test.ts).

## 7. Evaluation plan

### Minimum metrics to add (server-owned)

- Route selection correctness:
  - `mode` (diagnosis / deterministic_patch / fast_path / general_patch)
  - `fastPathKind` and `crossStepIntent`
- Proposal validity:
  - patch schema pass rate (should be near-100)
  - preflight-at-proposal failures (IDs, overlaps) if added
- Reprojection correction rate:
  - how often model-supplied `missingFieldsChecklist/intentRouting` differs from server recomputation (today server overwrites; log the delta before overwrite)
- Clarification rate:
  - % of turns that end without a patch proposal
- Apply outcomes:
  - success/failure counts by error code (`INVALID_PATCH`, `READ_ONLY`, `RATE_LIMITED`, etc)
  - op distribution and “domain touched” distribution (description/website/policy/etc)
- Contradiction + readiness outcomes:
  - post-apply aggregate blockers count deltas (especially truth conflicts from [lib/events/wizard/orchestrator.ts](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/ai-event/lib/events/wizard/orchestrator.ts))
- Location resolution outcomes:
  - matched/ambiguous/no_match rates and “choice selected” completion rate

### Testing strategy (keep it boring and comprehensive)

- Preserve and expand existing route/apply tests:
  - [__tests__/app/api/events/ai-wizard/route.server.test.ts](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/ai-event/__tests__/app/api/events/ai-wizard/route.server.test.ts)
  - [__tests__/app/api/events/ai-wizard/apply.route.server.test.ts](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/ai-event/__tests__/app/api/events/ai-wizard/apply.route.server.test.ts)
- Add focused tests for projection correctness around pricing per distance (currently under-tested).
- Keep the UI contract stable with the existing client tests in [__tests__/app/event-ai-wizard-panel.client.test.tsx](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/ai-event/__tests__/app/event-ai-wizard-panel.client.test.tsx).

## 8. Recommended first implementation slice

Extract the “patch finalizer” (projection + server-owned checklist/routing rebuild + location choice shaping) into a dedicated module and make the stream route a thin adapter that calls it, while simultaneously centralizing the step ID list + step mapping in one canonical place. This is the highest-leverage seam because it:

- removes the largest correctness and drift risk (step identity + reprojection)
- reduces the size/complexity of [app/api/events/ai-wizard/route.ts](/Users/juancarloselorriaga/Developer/proyectos-clientes/rungomx/rungomx-web-wt/ai-event/app/api/events/ai-wizard/route.ts) without changing the UI protocol
- sets up a clean pipeline extraction next, without a big-bang rewrite

