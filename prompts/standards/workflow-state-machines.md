# Workflow and State Machines Standard

This standard defines when workflow/state-machine modeling is the right pattern in RunGoMX, where that logic belongs, and how it should connect to mutation boundaries, persistence, and tests.

It is intentionally narrow.

- It **does** cover authoritative lifecycle transitions and UI step-flow sequencing.
- It **does not** mean every `status` field or `nextStatus` helper in the repo must be formalized as a full state machine.

## 1. What qualifies as a workflow/state machine

Treat logic as a workflow/state machine when it has most or all of these traits:

- finite named states
- explicit allowed transitions
- deterministic guards or preconditions
- invalid-transition handling
- meaningful side effects tied to transitions
- repeated reuse across call sites or strong lifecycle semantics

If a module only stores a status or computes a simple one-off next value without reusable transition policy, keep it as ordinary status logic unless there is clear lifecycle pressure.

## 2. Two canonical categories

### A. Server-side lifecycle machines

These are authoritative business-state machines.

Characteristics:

- persisted or persistence-aware
- server-owned
- typically invoked through Server Actions, or through route handlers when an HTTP contract is required
- often include guarded transitions, metadata, audit context, or downstream side effects

Strong repo exemplars:

- `lib/events/results/lifecycle/state-machine.ts`
- `lib/payments/payouts/lifecycle.ts`
- `lib/payments/disputes/lifecycle.ts`
- `lib/billing/lifecycle.ts`

### B. Client-side flow/step machines

These are UI sequencing machines.

Characteristics:

- control step order, optional-step inclusion, next/previous movement, and progress labels
- may depend on server-provided facts
- do **not** own security, persistence, or authoritative business transitions

Strong repo exemplar:

- `app/[locale]/(public)/events/[seriesSlug]/[editionSlug]/register/registration-flow-machine.ts`

Important boundary note:

- The existing `registration-flow.tsx` facade called out in `AGENTS.md` is migration-sensitive and stable.
- Treat it as a consumer boundary, not a casual relocation target for workflow policy.
- Changes that would reshape that facade are **[coordinated migration later]** work.

## 3. Placement and ownership

### `lib/` owns reusable lifecycle policy

Per `AGENTS.md`, reusable domain logic belongs in `lib/`.

That includes:

- allowed transition maps
- transition actions
- guards/preconditions
- structured invalid-transition errors
- transition metadata composition
- orchestration that must stay server authoritative

### `app/` composes and renders

`app/` route files and components should orchestrate and render.

- Server Actions and route handlers trigger authoritative transitions.
- Route-local UI flow helpers may live near the UI when they are presentation-specific.
- Do not move durable business transition policy into client components.

### `db/schema.ts` stores state, not transition policy

Per `AGENTS.md`, `db/schema.ts` is the source of truth for persisted structure.

But persisted status fields are storage, not policy ownership.

- schema defines the stored state shape
- server-side domain modules define which transitions are allowed

For DB boundary rules, also see `prompts/standards/database-and-drizzle-implementation-index.md`.

## 4. Mutation boundary integration

Server Actions remain the mutation entrypoint for app-facing writes.

That means:

- clients may request transitions
- clients must not define authoritative transition policy
- Server Actions or route handlers invoke server-side lifecycle logic
- reusable transition logic lives below that boundary in `lib/`

For mutation-boundary and contract-family rules, load:

- `prompts/standards/server-actions-and-api-contracts-index.md`
- `prompts/standards/forms-implementation.md`

## 5. Contracts and error handling

Workflow/state-machine code should fail deterministically.

Preferred characteristics:

- explicit allowed transition definitions
- structured invalid-transition responses or errors
- machine-readable failure codes where callers need branching behavior
- separate operational details from user-facing messaging

Good exemplar:

- `lib/events/results/lifecycle/state-machine.ts` returns a structured `ActionResult` when a transition is invalid.

Do not silently coerce invalid states into “best effort” transitions.

## 6. Persistence, audit, and side effects

For server-side lifecycle machines, transition code should make side effects explicit.

Common examples:

- audit metadata
- provenance patches
- event emission
- cache invalidation
- runtime-mode constraints
- deterministic persistence guards

Not every machine needs all of these.

Use stronger lifecycle discipline when transitions:

- change durable business state
- cross table/domain boundaries
- affect billing/payments/results correctness
- must remain auditable or idempotent

By contrast, client step machines usually do **not** need audit/idempotency semantics because they are not authoritative state owners.

## 7. Server lifecycle rules

When implementing a server-side lifecycle machine:

- keep the authoritative transition map in server-only code
- keep auth/authorization/pro-feature enforcement server-side
- perform transition guards before persisting state changes
- make invalid transitions explicit
- keep side effects visible at the orchestration boundary
- prefer typed inputs/results over ad hoc loosely shaped payloads

If transition logic needs DB persistence, transaction handling, or deterministic guards, follow:

- `prompts/standards/database-and-drizzle-implementation-index.md`

If transition logic triggers cache refresh or invalidation, follow:

- `prompts/standards/nextjs-caching-index.md`

## 8. Client flow rules

When implementing a client-side flow/step machine:

- keep it focused on step order and progression
- let server-provided facts determine optional-step inclusion where needed
- do not embed security or authorization decisions in the client flow machine
- do not turn the client flow machine into the source of truth for persisted workflow state

Client flow machines are appropriate for:

- step arrays
- next/previous resolution
- progress-step calculation
- conditional inclusion of presentation steps

They are not the place for:

- durable business transition authority
- auth enforcement
- DB-backed transition policy

## 9. Exemplars and non-exemplars

### Strong exemplars

- `lib/events/results/lifecycle/state-machine.ts`
  - explicit transition map
  - structured invalid-transition handling
- `lib/payments/payouts/lifecycle.ts`
  - explicit transition actions and allowed-from rules
  - deterministic guards and side-effect context
- `lib/payments/disputes/lifecycle.ts`
  - richer lifecycle graph with evidence and settlement paths
- `lib/billing/lifecycle.ts`
  - deterministic subscription lifecycle transitions with persistence and cache effects
- `app/[locale]/(public)/events/[seriesSlug]/[editionSlug]/register/registration-flow-machine.ts`
  - good exemplar for UI sequencing only

### Keep out of this standard by default

- one-off modules with a `status` field but no reusable transition policy
- ad hoc `nextStatus` logic that does not need formal lifecycle semantics yet
- route-local code that only reflects current status rather than authoritatively transitioning it

### Legacy / compatibility note

- Do not use this standard to justify widening legacy client mutation surfaces under `@/lib/**/actions`.
- Existing mutation-boundary preferences still apply; this standard is about workflow ownership, not a new client import policy.

## 10. Testing expectations

Workflow/state-machine logic should be validated at the lowest reliable layer first.

### Server lifecycle machines

Prefer targeted tests for:

- allowed transition maps
- invalid transitions
- guard behavior
- deterministic persistence behavior
- lifecycle metadata or side-effect outputs

### Client step/flow machines

Prefer targeted tests for:

- step ordering
- optional-step inclusion
- next/previous resolution
- progress display behavior

### E2E relevance

Use E2E only where the workflow is user-visible or where repeated mutations on the same screen are high-risk.

For E2E and reliability rules, see:

- `prompts/standards/e2e-testing.md`
- `prompts/standards/test-reliability.md`

Especially for stateful mutation UIs, respect the refresh-race guidance in `prompts/standards/test-reliability.md`.

## 11. Non-goals

This standard is **not** a mandate to:

- refactor every status enum into a state machine
- move route-local UI step helpers into global domain modules without need
- change stable public facades just to satisfy stylistic consistency
- duplicate auth, caching, DB, or mutation-boundary rules already owned by other standards

If a proposed cleanup would change public facades, broad domain seams, or established call sites, treat it as **[coordinated migration later]** work.

## 12. Quick checklist for AI agents

- [ ] Does this logic actually qualify as a workflow/state machine, or is it just a status field?
- [ ] Is it a **server lifecycle machine** or a **client flow machine**?
- [ ] Is authoritative transition policy kept out of client components?
- [ ] Does reusable/persisted machine logic live in `lib/`?
- [ ] Are Server Actions or route handlers still the mutation entrypoint?
- [ ] Are auth/role/profile/pro-feature checks preserved server-side when relevant?
- [ ] Are persisted status fields treated as storage, not policy ownership?
- [ ] Are invalid transitions deterministic and structured?
- [ ] Are cache or refresh effects handled at the correct boundary?
- [ ] Are tests covering transition rules and user-visible flow behavior at the right layer?
