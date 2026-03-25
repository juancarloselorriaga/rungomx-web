## 1. Architecture enforcement summary

- The canonical event setup wizard stays AI-agnostic. `lib/events/wizard/**` may not import from `lib/events/ai-wizard/**`, AI prompts, AI transport types, AI schemas, or model-selection logic.
- The AI event wizard is a bounded subsystem. Its concerns are proposal planning, prompting, message normalization, fast-path routing, model execution, proposal finalization, location resolution, diagnostics, and apply orchestration.
- API routes are adapters only. `app/api/events/ai-wizard/route.ts` and `app/api/events/ai-wizard/apply/route.ts` may parse transport input, call a coordinator/service, and translate the result into HTTP/stream output. They may not own planning, reprojection, preflight, or domain execution logic.
- Proposal generation and apply execution are separate trust boundaries. Proposal generation may be heuristic and model-assisted. Apply execution must be deterministic, schema-validated, replay-safe, auditable, and transactional where possible.
- Projection correctness overrides legacy compatibility. Incorrect reprojection behavior must be fixed even if the current UI has normalized around it.
- Step identity is canonical and singular. There will be one exported runtime step list, one setup-step type, and one mapping from canonical wizard issues to setup steps.
- Shared contracts are first-class modules. UI, routes, and services consume explicit contracts rather than re-deriving shapes from route-local helpers.
- Import direction is enforced. Base wizard -> neutral shared only. AI contracts -> base wizard contracts only. AI server -> contracts + base wizard + neutral shared. UI -> contracts only. Routes -> coordinators/contracts only.
- UI may not mutate domain proposals into different server commands. Client-side selection state stays client-side; proposal mutation and apply input shaping stay server-owned.
- Tests must target extracted modules, not route monolith internals. If a rule needs `import { x } from '@/app/api/.../route'`, the module boundary is wrong.

## 2. Current boundary violations

- `lib/events/wizard/orchestrator.ts`
  - Violation: base wizard imports `hasTrustedEventStartTime` from `@/lib/events/ai-wizard/datetime`.
  - Why it matters: the canonical wizard domain depends on an AI-namespaced module, which makes AI folder churn a risk to non-AI readiness logic.

- `app/[locale]/(protected)/dashboard/events/[eventId]/settings/event-settings-form.tsx` and `app/[locale]/(protected-fullscreen)/dashboard/events/new/create-event-form.tsx`
  - Violation: non-AI forms import `normalizeEditionDateTimeForPersistence` and formatting helpers from `@/lib/events/ai-wizard/datetime`.
  - Why it matters: neutral date/time behavior is physically placed inside the AI subsystem, so the folder structure lies about ownership.

- `app/api/events/ai-wizard/route.ts`
  - Violation: the route owns request parsing, message-history normalization, auth, Pro gating, role gating, rate limiting, intent routing, deterministic diagnosis, fast-path detection, location-resolution triggering, prompt assembly, model selection, tool definitions, proposal enrichment, projection, proposal finalization, and stream shaping.
  - Why it matters: the route is the orchestration owner instead of an adapter. This is the main regression surface in the subsystem.

- `app/api/events/ai-wizard/apply/route.ts`
  - Violation: the route owns auth, gating, rate limiting, preflight, op execution, partial-failure handling, some audit behavior, and response shaping.
  - Why it matters: the strict trust boundary is not isolated. The route is both adapter and apply engine.

- `app/[locale]/(protected)/dashboard/events/[eventId]/settings/page.tsx`
  - Violation: the page duplicates `mapIssueStepId`, computes review projections, resolves assistant capability behavior, and builds assistant configuration inline.
  - Why it matters: setup page composition is mixed with assistant-specific mapping and view-model logic. The page is doing policy and transformation work that should live in base wizard or assistant presenter modules.

- `app/[locale]/(protected)/dashboard/events/[eventId]/settings/event-ai-wizard-panel.tsx`
  - Violation: one client file owns transport setup, stream part handling, proposal extraction, continuity persistence, latency tracking, apply mutation, location choice handling, navigation handoff, and presentation.
  - Why it matters: the assistant UI is a client monolith, difficult to test and unsafe to evolve incrementally.

- `app/[locale]/(protected)/dashboard/events/[eventId]/settings/event-ai-wizard-panel.tsx`
  - Violation: `buildPatchWithSelectedLocation()` turns an ambiguous proposal plus user selection into a mutated `update_edition` op on the client.
  - Why it matters: the client is crossing from UI selection into server command construction. That is an apply-boundary violation.

- `lib/events/ai-wizard/schemas.ts`
  - Violation: one module mixes core patch ops, UI-facing checklist metadata, cross-step routing, location resolution payloads, choice requests, and apply request schema.
  - Why it matters: proposal core and server-owned proposal meta are not explicitly separated. Client/server contract boundaries are implied rather than enforced.

- `lib/events/ai-wizard/location-resolution.ts`
  - Violation: server-only provider-backed resolution logic sits beside shared contracts at the subsystem root.
  - Why it matters: the physical structure suggests this module is safely shareable when it is server-only.

- `lib/events/ai-wizard/prompt.ts`
  - Violation: server-only prompting logic sits beside shared types/contracts and duplicates step identity locally.
  - Why it matters: prompt construction should be inside the AI server subsystem, not in the shared contract surface.

- Step identity duplication across:
  - `lib/events/wizard/types.ts`
  - `lib/events/ai-wizard/schemas.ts`
  - `lib/events/ai-wizard/prompt.ts`
  - `app/api/events/ai-wizard/route.ts`
  - `app/[locale]/(protected)/dashboard/events/[eventId]/settings/event-setup-wizard-shell.tsx`
  - `app/[locale]/(protected)/dashboard/events/[eventId]/settings/event-ai-wizard-panel.tsx`
  - `app/[locale]/(protected)/dashboard/events/[eventId]/settings/page.tsx`
  - Why it matters: drift is guaranteed. Review routing, request validation, UI navigation, and prompt grounding can diverge independently.

- `app/api/events/ai-wizard/route.ts` reprojection logic
  - Violation: `buildProjectedAggregate()` marks all existing distances as having pricing whenever any pricing op exists, and invents projected distances from a template instead of the actual `create_distance` op payload.
  - Why it matters: proposal finalization is authoritative server output. Wrong reprojection creates wrong checklist and routing signals.

- `app/api/events/ai-wizard/apply/route.ts`
  - Violation: apply is mostly sequential and patch-global transactionality is absent; only add-on creation is wrapped in `db.transaction` and only that op writes audit records.
  - Why it matters: duplicate requests, partial failures, and replay after timeout are not first-class. Auditability is inconsistent by operation.

- `__tests__/app/api/events/ai-wizard/route.server.test.ts`
  - Violation: tests import `finalizeWizardPatchForUi`, `resolveCrossStepIntent`, and `enrichPatchWithResolvedLocation` directly from the route file.
  - Why it matters: tests are reinforcing the wrong ownership model. Pure subsystem logic should be tested through extracted modules, not through the transport adapter.

## 3. Target subsystem boundaries

### Canonical base wizard domain
- Responsibility: event setup truth, completeness, readiness, step registry, step-to-route mapping, issue-to-setup-step mapping, and wizard aggregate derivation.
- Owns:
  - canonical step identities
  - wizard aggregate / aggregate view
  - readiness and publish blocker semantics
  - step diagnosis semantics
- Must not own:
  - prompt construction
  - model selection
  - AI continuity/session behavior
  - proposal generation
  - AI location choice workflows

### AI wizard server subsystem
- Responsibility: convert organizer intent into proposals and strict apply commands without contaminating the base wizard.
- Owns:
  - request normalization
  - execution planning
  - scoped assistant context assembly
  - deterministic handlers
  - model execution and tool forcing
  - proposal enrichment/finalization
  - location resolution workflow
  - apply preflight and execution
  - AI telemetry
- Must not own:
  - canonical readiness rules
  - wizard step registry
  - page composition
  - client session storage

### AI wizard contracts
- Responsibility: stable DTOs shared by server adapters and client UI.
- Owns:
  - proposal core contract
  - finalized proposal meta contract
  - execution plan contract
  - scoped context contract
  - apply request/result contract
  - location resolution/choice contract
  - stream event contract
- Must not own:
  - database access
  - Next.js request/response types
  - React components/hooks
  - prompt text

### API transport adapters
- Responsibility: HTTP/stream boundary only.
- Owns:
  - request parsing/validation at transport edge
  - auth context lookup and adapter-level response mapping
  - stream/JSON response formatting
- Must not own:
  - planning
  - deterministic branching rules
  - projection correctness logic
  - op execution

### Assistant UI layer
- Responsibility: render assistant state and collect user input.
- Owns:
  - transport hook wiring
  - proposal display
  - continuity persistence
  - client-only selection state
  - mutation trigger UX
  - navigation handoff UX
- Must not own:
  - proposal mutation into domain ops
  - final routing derivation
  - location-to-edition conversion rules
  - apply result interpretation beyond display logic

### Shared neutral event-domain utilities
- Responsibility: reusable non-AI behavior used by both wizard and AI server.
- Owns:
  - datetime normalization/formatting
  - content merge helpers if genuinely shared
  - event snapshot helper types
- Must not own:
  - AI prompting
  - AI contracts
  - UI stream types

## 4. Target folder/module structure

```text
lib/events/
  datetime/
    normalize-edition-datetime.ts
    format-edition-datetime.ts
    schedule-facts.ts
  wizard/
    steps.ts
    types.ts
    step-modules.ts
    aggregate-builder.ts
    aggregate-view.ts
    review-view.ts
  ai-wizard/
    contracts/
      steps.ts
      proposal.ts
      ui-stream.ts
      execution-plan.ts
      scoped-context.ts
      apply.ts
      location.ts
    server/
      access.ts
      telemetry.ts
      planning/
        build-execution-plan.ts
        detect-fast-path.ts
        resolve-cross-step-intent.ts
        normalize-message-history.ts
      context/
        build-scoped-assistant-context.ts
        build-wizard-aggregate-view.ts
        resolve-location-context.ts
      prompt/
        build-system-prompt.ts
      proposals/
        deterministic/
          build-basics-follow-up.ts
          build-policies-follow-up.ts
          build-step-diagnosis.ts
        fast-path/
          build-fast-path-patch.ts
        finalize/
          finalize-proposal.ts
          project-aggregate-from-proposal.ts
          project-website-content.ts
          enrich-location-proposal.ts
      apply/
        apply-engine.ts
        preflight.ts
        idempotency.ts
        execute-op.ts
        op-handlers/
          update-edition.ts
          create-distance.ts
          create-pricing-tier.ts
          append-website-section.ts
          append-policy.ts
          create-add-on.ts
      coordinators/
        stream-proposal-coordinator.ts
        apply-proposal-coordinator.ts
app/api/events/ai-wizard/
  route.ts
  apply/route.ts
app/[locale]/(protected)/dashboard/events/[eventId]/settings/
  assistant/
    step-config.ts
    event-ai-wizard-panel.tsx
    use-event-ai-wizard-transport.ts
    use-event-ai-wizard-proposal-view.ts
    use-event-ai-wizard-continuity.ts
    use-event-ai-wizard-apply.ts
    use-event-ai-wizard-location-choice.ts
    components/
      proposal-card.tsx
      proposal-details.tsx
      supporting-context-panel.tsx
      continuity-snapshot-card.tsx
      apply-confirmation-card.tsx
      location-choice-card.tsx
      progress-state-card.tsx
      composer.tsx
      brief-editor.tsx
```

Notes:
- `lib/events/ai-wizard/contracts/**` is the only AI subtree that client code may import.
- `prompt.ts`, `location-resolution.ts`, and projection/finalization logic move under `server/**` because they are not shared contracts.
- `datetime.ts` leaves the AI folder entirely.
- The existing settings page remains the composition entry point, but assistant-specific factories/configuration move into `settings/assistant/**`.

## 5. Import direction rules

- `lib/events/datetime/**`
  - May import from neutral shared libs only.
  - May not import from `lib/events/ai-wizard/**`, `app/**`, or React.

- `lib/events/wizard/**`
  - May import from `lib/events/datetime/**`, `lib/events/queries`, `lib/events/website/types`, and other neutral event-domain modules.
  - May not import from `lib/events/ai-wizard/**`, `app/**`, or `@ai-sdk/*`.

- `lib/events/ai-wizard/contracts/**`
  - May import base wizard step contracts from `lib/events/wizard/steps` or `lib/events/wizard/types`.
  - May not import from `lib/events/ai-wizard/server/**`, `app/**`, `next/*`, db modules, or React.

- `lib/events/ai-wizard/server/**`
  - May import from `lib/events/ai-wizard/contracts/**`, `lib/events/wizard/**`, neutral event-domain modules, db/actions/queries, and telemetry/auth/permissions helpers.
  - May not import from `app/[locale]/**`, UI components, or client hooks.

- `app/api/events/ai-wizard/**`
  - May import from `lib/events/ai-wizard/contracts/**` and `lib/events/ai-wizard/server/coordinators/**` plus minimal auth/response helpers.
  - May not import from `lib/events/ai-wizard/server/*` internals other than the top-level coordinator entry points.
  - May not import from `app/[locale]/**`.

- `app/[locale]/.../settings/assistant/**`
  - May import from `lib/events/ai-wizard/contracts/**`, `@ai-sdk/react`, local hooks/components, and neutral UI utilities.
  - May not import from `lib/events/ai-wizard/server/**`, route files, db modules, or `next/server`.

- `app/[locale]/.../settings/page.tsx`
  - May import from base wizard view-model builders and local assistant slot/render config.
  - May not define step mapping logic or assistant execution rules inline.

- Tests
  - Route adapter tests import route handlers only.
  - Subsystem tests import extracted planner/finalizer/apply modules.
  - No test may import route internals as a surrogate for missing modules.

These rules are concrete enough for lint enforcement with `no-restricted-imports` or a dependency-cruiser policy.

## 6. First-class contracts and types

### Canonical setup step contract

```ts
export const SETUP_STEP_IDS = [
  'basics',
  'distances',
  'pricing',
  'registration',
  'policies',
  'content',
  'extras',
  'review',
] as const;

export type SetupStepId = typeof SETUP_STEP_IDS[number];

export type SetupStepDefinition = {
  id: SetupStepId;
  required: boolean;
  labelKey: string;
  routeSurface: 'settings' | 'pricing' | 'faq' | 'waivers' | 'questions' | 'policies' | 'website' | 'add_ons';
  assistantMode: 'structured' | 'markdown' | 'diagnostic' | 'none';
  canonicalWizardStepIds: readonly EventWizardStepId[];
};

export function mapWizardIssueStepToSetupStep(stepId: EventWizardStepId): SetupStepId;
```

Rules:
- This is the only runtime source of truth for setup step identity.
- `z.enum`, client unions, URL parsing, prompt context, and routing all derive from this export.

### `ExecutionPlan`

```ts
type ExecutionMode =
  | 'diagnosis'
  | 'deterministic_follow_up'
  | 'fast_path_generation'
  | 'general_generation';

type ExecutionPlan = {
  stepId: SetupStepId;
  locale: string;
  latestUserIntent: string;
  mode: ExecutionMode;
  fastPathKind?: 'event_description' | 'faq' | 'content_bundle' | 'website_overview' | 'policy';
  deterministicHandler?: 'step_diagnosis' | 'basics_follow_up' | 'policies_follow_up';
  requiresLocationResolution: boolean;
  contextScope: {
    includeWebsiteContent: boolean;
    includeQuestions: boolean;
    includeAddOns: boolean;
    includeLocationContext: boolean;
    includePriorProposalContext: boolean;
  };
  modelPlan?: {
    model: string;
    stepBudget: number;
    reasoningEffort?: 'minimal' | 'low' | 'medium';
    forcedTool?: string;
  };
};
```

Rules:
- The route does not infer mode on the fly.
- Everything downstream consumes an explicit plan.

### `ScopedAssistantContext`

```ts
type ScopedAssistantContext = {
  editionId: string;
  stepId: SetupStepId;
  locale: string;
  organizerBrief: string | null;
  eventSnapshot: EventEditionDetail;
  wizardView: WizardAggregateView;
  activeStepDiagnosis: WizardChecklistItem[];
  diagnosisNextStep: WizardChecklistItem | null;
  websiteContent?: WebsiteContentBlocks | null;
  questions?: QuestionSummary[];
  addOns?: AddOnSummary[];
  locationResolution?: LocationResolutionResult | null;
  normalizedHistory: AssistantHistoryMessage[];
};
```

Rules:
- Context is a built object, not ad hoc pulls from the route.
- Only the context builder decides what gets loaded for a given plan.

### Proposal contract split: core vs server-owned meta

```ts
type ProposalCore = {
  title: string;
  summary: string;
  risky?: boolean;
  ops: EventAiWizardOp[];
  markdownOutputs?: EventAiWizardMarkdownOutput[];
};

type ProposalMeta = {
  proposalId: string;
  proposalVersion: 1;
  proposalFingerprint: string;
  missingFieldsChecklist: WizardChecklistItem[];
  intentRouting: IntentRoute[];
  crossStepIntent?: CrossStepIntent;
  locationResolution?: LocationResolutionResult;
  choiceRequest?: ChoiceRequest;
  executionTrace: {
    mode: ExecutionMode;
    stepId: SetupStepId;
    fastPathKind?: string;
  };
};

type FinalizedProposal = {
  core: ProposalCore;
  meta: ProposalMeta;
};
```

Rules:
- `ProposalCore` is the only input the apply engine trusts.
- `ProposalMeta` is server-owned output. The server derives it and may overwrite model-supplied values.
- Wire compatibility can temporarily flatten these into the existing patch shape, but the internal boundary must still exist.

### Apply engine contract

```ts
type ApplySelection =
  | {
      kind: 'location_candidate_selection';
      candidate: ResolvedLocationCandidate;
    };

type ApplyEngineInput = {
  editionId: string;
  locale: string;
  actorUserId: string;
  organizationId: string;
  proposalId: string;
  proposalFingerprint: string;
  idempotencyKey: string;
  core: ProposalCore;
  selections?: ApplySelection[];
  requestContext: AuditRequestContext;
};

type AppliedOpResult = {
  opIndex: number;
  type: EventAiWizardOp['type'];
  status: 'applied' | 'skipped' | 'already_applied';
  result?: unknown;
  auditId?: string;
};

type ApplyEngineResult =
  | {
      outcome: 'applied' | 'already_applied';
      proposalId: string;
      idempotencyKey: string;
      appliedOps: AppliedOpResult[];
    }
  | {
      outcome: 'rejected';
      code: 'INVALID_PATCH' | 'READ_ONLY' | 'RATE_LIMITED' | 'RETRY_LATER';
      failedOpIndex?: number;
      appliedOps: AppliedOpResult[];
      retryable: boolean;
    };
```

Rules:
- The apply route submits a proposal id, fingerprint, and idempotency key.
- Client-side location selection is carried as `selections`, not by mutating `ProposalCore.ops`.

### Location resolution contract

```ts
type LocationResolutionRequest = {
  query: string;
  locale: string;
  country?: string | null;
  proximity?: { lat: number; lng: number };
};

type LocationResolutionResult =
  | { status: 'matched'; query: string; candidate: ResolvedLocationCandidate }
  | { status: 'ambiguous'; query: string; candidates: ResolvedLocationCandidate[] }
  | { status: 'no_match'; query: string };

type ChoiceRequest = {
  kind: 'location_candidate_selection';
  sourceStepId: 'basics';
  targetField: 'event_location';
  query: string;
  options: ResolvedLocationCandidate[];
};
```

Rules:
- Location resolution is server-owned.
- UI only renders `ChoiceRequest` and returns a selected candidate.

### Wizard aggregate view contract

```ts
type WizardChecklistItem = {
  code: string;
  stepId: SetupStepId;
  severity: 'required' | 'blocker' | 'optional';
  labelKey: string;
};

type WizardAggregateView = {
  checklist: WizardChecklistItem[];
  publishBlockers: WizardChecklistItem[];
  missingRequired: WizardChecklistItem[];
  optionalRecommendations: WizardChecklistItem[];
  stepDiagnosisById: Partial<Record<SetupStepId, WizardChecklistItem[]>>;
  setupStepStateById: Record<SetupStepId, {
    completed: boolean;
    blockerCount: number;
    recommendationCount: number;
    required: boolean;
  }>;
  capabilityLocks: EventWizardCapabilityLocks;
};
```

Rules:
- AI consumes this view, not route-local re-mappings.
- Settings page review summaries also consume this view.

## 7. Adapter vs service ownership

### `app/api/events/ai-wizard/route.ts`
- Remains in adapter:
  - parse request body
  - resolve auth context
  - map domain/service errors to HTTP/stream responses
  - call `streamProposalCoordinator.execute()`
- Moves out:
  - message normalization
  - step mapping
  - execution mode selection
  - deterministic diagnosis/follow-up builders
  - fast-path detection
  - context assembly
  - prompt construction
  - model selection/tool forcing
  - proposal enrichment and finalization
  - location serialization / choice shaping

### `app/api/events/ai-wizard/apply/route.ts`
- Remains in adapter:
  - parse apply request
  - resolve auth context
  - map `ApplyEngineResult` to JSON/HTTP
- Moves out:
  - membership capability rules
  - rate-limit policy
  - patch preflight
  - op loop / execution dispatch
  - per-op audit behavior
  - partial-failure bookkeeping
  - idempotency and replay behavior

### Settings page
- Remains in page composition:
  - load event and wizard view data
  - decide whether wizard mode is active
  - render step surfaces and assistant slots
- Moves out:
  - step mapping duplication
  - review issue view-model assembly
  - assistant per-step config table
  - assistant capability/gating presenter logic
- Target: page consumes `buildWizardReviewView()` and `buildAssistantSlotProps(stepId, locale, event)`.

### Assistant panel
- Remains in panel composition:
  - top-level layout
  - hook composition
  - render cards/components
- Moves out:
  - `useChat` transport setup into `use-event-ai-wizard-transport`
  - stream part interpretation into proposal-view hook/reducer
  - continuity session storage into `use-event-ai-wizard-continuity`
  - apply fetch and result handling into `use-event-ai-wizard-apply`
  - location selection logic into `use-event-ai-wizard-location-choice`
  - client-side proposal mutation out entirely; replaced by selection payloads submitted to apply hook

## 8. Revised migration plan

### Phase 1: canonical contracts and neutral extraction
- Objective: eliminate identity drift and remove AI namespace leakage from the base wizard.
- Architectural outcome:
  - one canonical setup-step contract
  - wizard issue-to-setup-step mapping exported from base wizard
  - datetime utilities moved to neutral `lib/events/datetime/**`
- Likely files/modules touched:
  - `lib/events/wizard/types.ts`
  - new `lib/events/wizard/steps.ts`
  - `lib/events/wizard/orchestrator.ts`
  - `lib/events/ai-wizard/schemas.ts`
  - `lib/events/ai-wizard/prompt.ts`
  - `app/api/events/ai-wizard/route.ts`
  - `app/[locale]/.../settings/page.tsx`
  - `app/[locale]/.../settings/event-setup-wizard-shell.tsx`
  - `app/[locale]/.../settings/event-ai-wizard-panel.tsx`
  - `app/[locale]/.../settings/event-settings-form.tsx`
  - `app/[locale]/(protected-fullscreen)/dashboard/events/new/create-event-form.tsx`
- Risk level: low.
- Why this ordering is safe: no behavioral change is required beyond replacing duplicated literals and imports.

### Phase 2: extract proposal finalization and projection seam
- Objective: isolate the most correctness-sensitive server logic behind a pure module.
- Architectural outcome:
  - `finalize-proposal.ts` becomes the authoritative owner of server-owned proposal meta
  - projection correctness is testable without route imports
- Likely files/modules touched:
  - new `lib/events/ai-wizard/server/proposals/finalize/*`
  - `app/api/events/ai-wizard/route.ts`
  - `__tests__/app/api/events/ai-wizard/route.server.test.ts`
  - new focused tests for projection/finalizer modules
- Risk level: medium.
- Why this ordering is safe: the route wire protocol stays unchanged while the highest-risk logic moves into pure functions.

### Phase 3: extract stream coordinator and explicit execution planning
- Objective: make route orchestration boring and explicit.
- Architectural outcome:
  - explicit `ExecutionPlan`
  - route delegates to `stream-proposal-coordinator`
  - prompt/model/handler selection moves into server modules
- Likely files/modules touched:
  - `app/api/events/ai-wizard/route.ts`
  - new `lib/events/ai-wizard/server/planning/**`
  - new `lib/events/ai-wizard/server/context/**`
  - new `lib/events/ai-wizard/server/prompt/**`
  - new `lib/events/ai-wizard/server/coordinators/stream-proposal-coordinator.ts`
- Risk level: medium.
- Why this ordering is safe: the finalizer seam already exists, so coordinator extraction does not need to solve projection and transport at once.

### Phase 4: extract apply engine with idempotency and op journals
- Objective: move the strict trust boundary out of the route and make replay behavior explicit.
- Architectural outcome:
  - apply route becomes a thin adapter
  - `ApplyEngineInput` / `ApplyEngineResult` are first-class
  - idempotency and audit become uniform
- Likely files/modules touched:
  - `app/api/events/ai-wizard/apply/route.ts`
  - new `lib/events/ai-wizard/server/apply/**`
  - new op-handler modules
  - apply tests updated to target engine and adapter separately
- Risk level: medium-high.
- Why this ordering is safe: by this point proposal contracts and planner/finalizer contracts are stable, so apply can adopt them without moving UI at the same time.

### Phase 5: client decomposition without changing behavior
- Objective: break the assistant panel into stable hooks and components while preserving current UX.
- Architectural outcome:
  - transport, continuity, proposal extraction, apply mutation, and presentation are separated
  - location selection stops mutating proposals client-side
- Likely files/modules touched:
  - `app/[locale]/.../settings/assistant/**`
  - existing assistant panel tests split toward smaller hooks/components
- Risk level: medium.
- Why this ordering is safe: the server contract surface is already stable, so the client can refactor against a fixed protocol.

### Phase 6: enforcement and telemetry hardening
- Objective: stop regression back to the old shape.
- Architectural outcome:
  - import rules codified
  - tests target modules at the right boundaries
  - telemetry records plan mode, proposal finalization, apply outcome, and replay behavior
- Likely files/modules touched:
  - lint/dependency policy config
  - telemetry helpers
  - targeted tests
- Risk level: low.
- Why this ordering is safe: after structure exists, enforcement becomes precise instead of aspirational.

## 9. UI decomposition target

The client target is not a rewrite. It is a controlled split around current seams.

- `event-ai-wizard-panel.tsx`
  - Becomes a composition component only.
  - Owns layout and hook wiring.

- `use-event-ai-wizard-transport.ts`
  - Owns `useChat`, `DefaultChatTransport`, stream part intake, and transport error normalization.
  - Exposes normalized stream state, not raw `useChat` internals.

- `use-event-ai-wizard-proposal-view.ts`
  - Owns proposal extraction from message history.
  - Computes `latestProposal`, `latestRequest`, `archiveMessages`, `latestAssistantWithoutPatch`, and routing/checklist presentation data.

- `use-event-ai-wizard-continuity.ts`
  - Owns continuity snapshot persistence and recovery from `sessionStorage`.
  - Removes continuity bookkeeping from the panel body.

- `use-event-ai-wizard-apply.ts`
  - Owns apply mutation, idempotency key generation, request dispatch, error decoding, and refresh/reveal decisions.
  - Consumes `FinalizedProposal` + `selections`, not a client-mutated patch.

- `use-event-ai-wizard-location-choice.ts`
  - Owns selected candidate state and validation of whether apply is enabled.
  - Does not translate a candidate into `update_edition` ops.

- Presentation components
  - `proposal-card.tsx`
  - `proposal-details.tsx`
  - `location-choice-card.tsx`
  - `routing-card.tsx`
  - `supporting-context-panel.tsx`
  - `continuity-snapshot-card.tsx`
  - `progress-state-card.tsx`
  - `composer.tsx`
  - `brief-editor.tsx`

Migration-aware rule:
- Keep the current stream protocol and visual behavior while splitting internals.
- Do not replace `useChat` or redesign the entire interaction model during the architectural extraction.

## 10. Reliability and replay-safety requirements

- Duplicate apply attempts
  - Every finalized proposal must carry `proposalId` and `proposalFingerprint`.
  - Every apply request must carry an `idempotencyKey`.
  - If the same proposal and idempotency key arrive twice, return the original result as `already_applied`, not a second mutation.

- Network retries
  - Client retries after timeout must reuse the same `idempotencyKey`.
  - Apply adapter must be able to return a completed result for a previously committed request.

- Partial failures
  - Partial application is allowed only as an explicit reported outcome, never as an implicit side effect.
  - The engine must return `appliedOps`, `failedOpIndex`, `retryable`, and `proposalId`.
  - UI must not blindly retry an entire partially-applied patch.

- Transactional vs compensating behavior
  - A patch should execute in one DB transaction where handlers can share a transaction boundary.
  - Where that is not yet possible, the engine must execute per-op with an operation journal and stop on first failure.
  - Compensation is only acceptable for explicitly reversible operations. If reversal is not guaranteed, report partial application instead of pretending atomicity.

- Auditability per op
  - Every applied op must record actor, organization, edition, proposalId, idempotencyKey, opIndex, opType, status, and before/after summary where feasible.
  - Add-on creation cannot remain the only audited path.
  - Audit records must be queryable by proposalId to reconstruct what happened.

- Proposal/apply contract integrity
  - Apply must consume `ProposalCore` plus server-issued identifiers. It must ignore client-edited checklist/routing/meta fields.
  - If `proposalFingerprint` does not match `ProposalCore`, reject as `INVALID_PATCH`.

- Replay-safe location choice
  - Ambiguous location resolution must be applied via a server-handled `ApplySelection`, not by client-side op mutation.
  - Selected candidates must be serialized through the contract and revalidated server-side before execution.

- Correctness-over-compatibility hotspots
  - Reprojection must stop marking unrelated distances as priced.
  - Reprojection must derive projected distances from `create_distance` op data, not placeholder templates.
  - Review checklist/routing can change if that is the correct result of accurate projection.

## 11. Recommended next implementation slice

Build the canonical step contract and extract proposal finalization into a dedicated server module in one slice.

Scope:
- introduce `lib/events/wizard/steps.ts` as the single source of truth for setup step identity and issue-to-setup-step mapping
- move neutral datetime helpers out of `lib/events/ai-wizard/datetime.ts`
- extract `finalizeWizardPatchForUi`, `buildProjectedAggregate`, `projectWebsiteContent`, and location-choice shaping into `lib/events/ai-wizard/server/proposals/finalize/**`
- update the route, settings page, prompt, shell, panel, and tests to consume the new step contract and finalizer module

Why this slice comes next:
- it removes the largest structural drift immediately: duplicated step identity
- it isolates the highest-risk correctness logic immediately: proposal reprojection/finalization
- it preserves the current transport and UI behavior, so regression risk stays contained
- it creates the seam needed for the next extraction: an explicit stream coordinator that can call a tested finalizer instead of route-local helpers
- it is the smallest slice that simultaneously protects the base wizard from AI churn and improves proposal correctness
