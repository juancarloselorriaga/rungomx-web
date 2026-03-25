# AI Wizard Layer Production Redesign — BMAD Execution Plan

> Companion to `event-ai-wizard-layer-production-redesign.md`.
> Architecture is settled. This document defines **how to execute** the 6-phase redesign using BMAD agents and workflows, with the refinements agreed on 2026-03-25.

---

## Governing principles

| Principle | Rationale |
|---|---|
| Architecture fixed | The redesign plan is the authority. No re-opening architecture decisions. |
| Stories generated just-in-time | Only fully elaborate the current phase story. Light outlines for future phases are fine, but details adapt to what's learned during execution. |
| ATDD before implementation | Tests define the boundaries: canonical contracts, import direction, projection correctness, apply behavior, replay safety. Without this, the refactor can look clean while quietly breaking invariants. |
| Static enforcement for import boundaries | Import direction rules use lint / dependency-cruiser / static checks — not conventional failing tests. ATDD is for behavioral contracts. Different tools for different concerns. |
| Architecture conformance after every phase | Green tests are necessary but not sufficient. Each phase must pass a structural audit. |
| Phase-by-phase, never broad roaming | Each phase is constrained. No cross-phase work until the current phase is committed and green. |

---

## Per-phase execution loop

```
┌─────────────────────────────────────────────────────┐
│  For each Phase N:                                  │
│                                                     │
│  1. SM (Bob) → [CS] Create Story                    │
│     Feed: redesign plan + current codebase state    │
│     Output: story file with exact file moves,       │
│             contracts, imports, AC, tasks/subtasks   │
│                                                     │
│  2. TEA (Murat) → [AT] ATDD                        │
│     Feed: Phase N story                             │
│     Output: failing acceptance tests +              │
│             implementation checklist                 │
│                                                     │
│  3. Dev (Amelia) → [DS] Dev Story                   │
│     Feed: Phase N story + ATDD test suite           │
│     Discipline: task-by-task, tests pass before     │
│                 proceeding, file list tracked        │
│                                                     │
│  4. TEA (Murat) → [RV] Review Tests                │
│     Feed: new/modified test files from Phase N      │
│     Evaluates: determinism, isolation,              │
│                maintainability, coverage             │
│                                                     │
│  5. Architecture conformance review                 │
│     (see checklist below)                           │
│                                                     │
│  6. Commit only when:                               │
│     ✓ Full test suite green                         │
│     ✓ Phase acceptance criteria met                 │
│     ✓ Architecture rules still clean                │
│     ✓ Definition of done satisfied                  │
└─────────────────────────────────────────────────────┘
```

### Phase 4 receives additional scrutiny

After the apply engine extraction but before idempotency hardening:

- Dev (Amelia) → **[CR] Code Review** — multi-facet quality review
- Focus areas: boundary violations, import direction, error handling at trust boundaries, transactionality gaps

---

## After all phases complete

1. **TEA (Murat) → [TR] Trace Requirements** — map every acceptance criterion from the redesign plan back to a passing test. This is the final quality gate.
2. **Final boundary audit** — full import graph review, confirm all 15 original violations are resolved.
3. **Final regression review** — end-to-end proposal → apply flows, including edge cases: partial failures, duplicate handling, replay safety, location choice round-trips.

---

## Architecture conformance checklist (run after every phase)

- [ ] Did route ownership actually shrink? Are route files smaller and less responsible than before?
- [ ] Did logic land in the correct layer (coordinator/service, not route)?
- [ ] Did any new import violations appear? (AI → base wizard? Base wizard → AI? Client → server internals?)
- [ ] Did the base wizard stay AI-agnostic? No imports from `lib/events/ai-wizard/**`.
- [ ] Did adapters (routes) remain thin? No planning, reprojection, preflight, or domain execution logic.
- [ ] No "temporary" helpers that become new coupling points?
- [ ] No contract duplication added (parallel types for the same concept)?
- [ ] Existing UX contract preserved unless intentionally changed?
- [ ] Telemetry or observability added where phase required it?

---

## Definition of done (per phase)

Beyond green tests, each phase requires:

1. **No forbidden imports introduced** — verified by static check or manual audit
2. **Route files smaller and less responsible** — measurable diff in LOC and concern count
3. **Ownership moved to target modules** — logic lives where the redesign plan says it should
4. **No contract duplication** — one type for one concept, exported from one location
5. **Existing UX contract preserved** — unless the change is intentional and documented
6. **Telemetry / observability** — added where the phase requires it (especially Phases 4 and 6)

---

## Phase summary and risk profile

| Phase | Scope | Risk | Key deliverables |
|---|---|---|---|
| 1 | Canonical contracts + neutral extraction | Low | `SETUP_STEP_IDS`, `SetupStepDefinition`, datetime utilities extracted to `lib/events/datetime/`, shared contract modules |
| 2 | Proposal finalization + projection seam | Medium | `ProposalCore` / `ProposalMeta` split, projection logic extracted from route, `ExecutionPlan` contract |
| 3 | Stream coordinator + execution planning | Medium | `ScopedAssistantContext`, stream coordinator extracted from route, prompt/model concerns isolated |
| 4 | Apply engine + idempotency | Medium-High | `ApplyEngineInput` / `ApplyEngineResult`, transactional apply, replay-safe ops, idempotency guarantees |
| 5 | Client decomposition | Medium | Transport/proposal/continuity/apply/location hooks, 8 presentational components from monolith panel |
| 6 | Enforcement + telemetry | Low | Lint rules for import direction, dependency graph enforcement, telemetry instrumentation |

---

## Phase 5 parallelization guidance

Phase 5 (client decomposition) **may** run in parallel with Phases 3–4 server work, but only if:

- Phase 1 contracts are done and stable
- Phase 2 proposal/finalization shape is green and unlikely to shift
- No server-side patch/meta contract is still moving

**Default posture: keep sequential.** Client decomposition touches user-visible behavior and gets messy when server contracts are still settling.

---

## BMAD agents and workflows used

| Step | Agent | Workflow | Purpose |
|---|---|---|---|
| Story creation | SM (Bob) | `[CS] Context Story` | Implementation-ready story per phase |
| Acceptance tests | TEA (Murat) | `[AT] ATDD` | Failing tests + implementation checklist before dev |
| Implementation | Dev (Amelia) | `[DS] Dev Story` | Strict task-by-task execution with test gates |
| Test quality | TEA (Murat) | `[RV] Review Tests` | Determinism, isolation, maintainability review |
| Code review | Dev (Amelia) | `[CR] Code Review` | Multi-facet quality review (Phase 4 especially) |
| Traceability | TEA (Murat) | `[TR] Trace Requirements` | Final quality gate after all phases |

### What is explicitly excluded

| Agent/Workflow | Why excluded |
|---|---|
| PM agent / PRD workflow | Requirements exist. No product discovery needed. |
| Architect agent | Architecture is settled. Do not re-open. |
| UX Designer | UI decomposition is already specified in the redesign plan. |
| Quick Flow (Barry) | Too lean for this risk profile. Full Dev Agent discipline required. |
| Sprint Planning | Not planning sprints. Phasing a refactor with known scope. |
| Course Correction | Only invoke if something goes genuinely sideways mid-execution. |
| Test Design `[TD]` | ATDD is the right level. Test Design is for epic/system scope planning already done. |

---

## Phase completion record

Each phase, upon completion, must document concrete boundary wins and new invariants. This is the evidence that the refactor is actually moving ownership — not just reshuffling code.

### Boundary wins introduced (template — fill per phase)

> Record what actually moved, what was removed, and what is now correctly owned.

- Moved X from route → coordinator
- Removed wizard import from AI module
- Eliminated duplicated step mapping
- Proposal meta now server-owned only

### New invariants created (template — fill per phase)

> Record the new rules that the codebase now enforces — things that were previously possible and are no longer.

- `route.ts` no longer computes Y
- Wizard domain no longer imports Z
- Patch finalization always passes through A

### Per-phase log

<!-- After completing each phase, add a dated entry below with the actual boundary wins and invariants. -->

_(No phases completed yet.)_

---

## Current status

| Phase | Status | Date |
|---|---|---|
| Phase 1 | **Next up** | 2026-03-25 |
| Phase 2 | Pending | — |
| Phase 3 | Pending | — |
| Phase 4 | Pending | — |
| Phase 5 | Pending | — |
| Phase 6 | Pending | — |
