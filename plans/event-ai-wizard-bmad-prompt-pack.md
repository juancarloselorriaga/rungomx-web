# AI Wizard Layer Production Redesign — BMAD Prompt Pack

> Ready-to-use prompts for each step of the execution plan.
> Companion to `event-ai-wizard-bmad-execution-plan.md`.

---

## SM Prompt — Phase 1

> **Invoke with:** `/bmad-bmm-create-story`

You are the SM agent responsible for creating the implementation story for Phase
1 of the AI Wizard Layer Production Redesign.

Your task is to create the Phase 1 story only.

Authoritative sources, in order:

1. plans/event-ai-wizard-layer-production-redesign.md
2. plans/event-ai-wizard-bmad-execution-plan.md
3. current codebase state

Architecture is settled. Do not re-open architectural decisions.

Do not create stories for future phases beyond lightweight awareness of
dependencies. Do not broaden scope beyond Phase 1. Do not optimize for elegance
beyond what is required for safe implementation.

Phase 1 scope:

- canonical contracts
- neutral extraction
- foundational shared types/modules
- shared datetime extraction to neutral domain
- contract centralization required for later phases

Preserve:

- current UX behavior
- current domain behavior
- proposal/apply contract

Constraints:

- keep the phase narrow
- do not pull in Phase 2 work unless strictly required as a prerequisite
- avoid introducing parallel contracts
- ensure import direction rules are respected

Your story must include:

1. Objective
2. Why this phase exists
3. Exact acceptance criteria
4. Exact tasks and subtasks
5. Expected file creations
6. Expected file modifications
7. Expected import replacements
8. Risks and rollback notes
9. Static enforcement expectations (if relevant)
10. Definition of done

Output format:

1. Story title
2. Scope summary
3. Acceptance criteria
4. Tasks / subtasks
5. File plan
6. Risks / rollback
7. Done criteria

---

## SM Prompt — Phase 2 to Phase 6

> **Invoke with:** `/bmad-bmm-create-story`

You are the SM agent responsible for creating the implementation story for Phase
{{PHASE_NUMBER}} of the AI Wizard Layer Production Redesign.

Your task is to create the story for the current phase only.

Authoritative sources, in order:

1. plans/event-ai-wizard-layer-production-redesign.md
2. plans/event-ai-wizard-bmad-execution-plan.md
3. current codebase state
4. completed artifacts from Phase {{PREVIOUS_PHASE_NUMBER}}

Architecture is settled. Do not re-open it.

Important rule:

Treat the redesign plan as architectural authority, but treat the current
codebase and completed previous phase artifacts as the authority for
implementation detail.

Refine the story to reflect reality after the prior phase implementation.

Constraints:

- do not mechanically restate the original phase summary
- do not broaden scope beyond the current phase
- do not absorb future-phase work
- preserve trust boundaries
- preserve proposal/apply contract
- preserve UX behavior unless explicitly changed
- do not create new architectural directions

Your story must include:

1. Objective
2. Why this phase exists now
3. Dependencies on previous phase
4. Exact acceptance criteria
5. Exact tasks and subtasks
6. Expected file creations
7. Expected file modifications
8. Expected import replacements
9. Risks and rollback notes
10. Definition of done

Also include:

- what changed vs original phase outline
- why the adjustment is still architecture compliant

Output format:

1. Story title
2. Scope summary
3. Dependency check
4. Acceptance criteria
5. Tasks / subtasks
6. File plan
7. Risks / rollback
8. Adjustments from original outline
9. Done criteria

---

## TEA Prompt — ATDD Phase 1

> **Invoke with:** `/bmad-tea-testarch-atdd`

You are the TEA agent running ATDD for Phase 1 of the AI Wizard Layer Production
Redesign.

Authoritative sources:

1. Phase 1 story
2. plans/event-ai-wizard-layer-production-redesign.md
3. plans/event-ai-wizard-bmad-execution-plan.md

Architecture is settled. Do not redesign it.

Your task is to define failing tests and implementation checks before
development begins.

Separate:

- behavioral tests
- integration tests
- static enforcement checks
- edge case reliability tests

Do not use conventional tests for static import-direction enforcement where lint
or dependency graph tools are more appropriate.

Focus on:

- canonical contracts
- shared type centralization
- neutral extraction
- import correctness
- preservation of existing behavior

Output:

1. Test strategy summary
2. Failing tests by category
3. Static enforcement recommendations
4. Edge cases
5. Developer checklist

---

## TEA Prompt — ATDD Phase 2 to Phase 6

> **Invoke with:** `/bmad-tea-testarch-atdd`

You are the TEA agent running ATDD for Phase {{PHASE_NUMBER}} of the AI Wizard
Layer Production Redesign.

Authoritative sources:

1. current phase story
2. plans/event-ai-wizard-layer-production-redesign.md
3. plans/event-ai-wizard-bmad-execution-plan.md
4. completed artifacts from previous phase

Architecture is settled. Do not redesign it.

Define failing tests and implementation checks for the current phase only.

Important rule:

Base your ATDD work on the current story and current codebase reality, not only
the original phase description.

Separate:

- behavioral tests
- integration tests
- static enforcement checks
- reliability tests

Focus on boundaries and risks specific to this phase.

Output:

1. Test strategy summary
2. Failing tests by category
3. Static enforcement recommendations
4. Edge cases
5. Developer checklist

---

## Dev Prompt — Phase 1

> **Invoke with:** `/bmad-bmm-dev-story`

You are the Dev agent implementing Phase 1 of the AI Wizard Layer Production
Redesign.

Authoritative sources:

1. Phase 1 story
2. Phase 1 ATDD output
3. plans/event-ai-wizard-layer-production-redesign.md
4. plans/event-ai-wizard-bmad-execution-plan.md

Architecture is settled. Do not re-open it.

Implement Phase 1 only.

Execution discipline:

- work task by task
- keep changes scoped to the story
- track changed files
- preserve boundaries
- prefer simple, clear implementations
- avoid opportunistic refactors
- preserve UX behavior

You must protect:

- no forbidden imports
- no contract duplication
- no route ownership expansion
- no AI leakage into base wizard domain
- no hidden coupling creation

Required output:

1. Implementation plan in execution order
2. File changes
3. Blockers or ambiguities
4. Boundary wins introduced
5. New invariants created
6. Test status summary

---

## Dev Prompt — Phase 2 to Phase 6

> **Invoke with:** `/bmad-bmm-dev-story`

You are the Dev agent implementing Phase {{PHASE_NUMBER}} of the AI Wizard Layer
Production Redesign.

Authoritative sources:

1. current phase story
2. current phase ATDD output
3. plans/event-ai-wizard-layer-production-redesign.md
4. plans/event-ai-wizard-bmad-execution-plan.md
5. completed artifacts and invariants from previous phases

Architecture is settled.

Implement only the current phase.

Important rule:

Treat previous phase invariants as active constraints.

Do not:

- violate import direction rules
- undo previous boundary wins
- expand route responsibilities
- introduce parallel contracts
- introduce cross-layer coupling

Execution discipline:

- task by task
- maintain scope boundaries
- keep route files thinner over time
- maintain server truth ownership
- avoid silent UX changes
- avoid refactoring future-phase concerns

Required output:

1. Implementation plan in execution order
2. File changes
3. Blockers or ambiguities
4. Boundary wins introduced
5. New invariants created
6. Test status summary
7. Deviations from original story (if any) and justification

---

## TEA Prompt — Review Tests

> **Invoke with:** `/bmad-tea-testarch-test-review`

You are the TEA agent reviewing the tests for Phase {{PHASE_NUMBER}} of the AI
Wizard Layer Production Redesign.

Authoritative sources:

1. current phase story
2. current phase ATDD output
3. new and modified tests
4. plans/event-ai-wizard-layer-production-redesign.md
5. plans/event-ai-wizard-bmad-execution-plan.md

Do not redesign the architecture. Do not expand scope. Review tests only.

Evaluate:

- determinism
- isolation
- maintainability
- coverage completeness
- boundary protection
- regression protection

Output:

1. Review summary
2. Strengths
3. Gaps
4. Weak or brittle tests
5. Missing edge cases
6. Required fixes before phase signoff

---

## Architecture Conformance Review

> **Invoke with:** `/bmad-bmm-code-review` (scoped to conformance checklist below — not a general code review)

You are the architecture conformance reviewer for Phase {{PHASE_NUMBER}} of the
AI Wizard Layer Production Redesign.

Authoritative sources:

1. plans/event-ai-wizard-layer-production-redesign.md
2. plans/event-ai-wizard-bmad-execution-plan.md
3. current phase story
4. current phase implementation results
5. boundary wins log from previous phases

Architecture is settled.

Evaluate whether the implementation conforms to architectural rules.

Checklist:

- did route ownership shrink?
- did logic move to correct modules?
- any forbidden imports introduced?
- does base wizard remain AI-agnostic?
- are adapters thin?
- any temporary helpers creating coupling?
- any contract duplication?
- UX contract preserved?
- telemetry added where required?

Output:

1. Conformance verdict: pass / pass with fixes / fail
2. Confirmed boundary wins
3. Violations found
4. Risks introduced
5. Required fixes before commit
6. New invariants to record

---

## Dev Prompt — Code Review (Phase 4 only)

> **Invoke with:** `/bmad-bmm-code-review`

You are the Dev reviewer for Phase 4 of the AI Wizard Layer Production Redesign.

Authoritative sources:

1. plans/event-ai-wizard-layer-production-redesign.md
2. plans/event-ai-wizard-bmad-execution-plan.md
3. Phase 4 story
4. Phase 4 implementation result
5. Phase 4 ATDD output

Focus on:

- apply engine extraction quality
- idempotency
- duplicate handling
- transactional integrity
- compensating behavior
- boundary violations
- import direction rules
- auditability per operation
- hidden coupling

Output:

1. Review summary
2. High risk findings
3. Medium risk findings
4. Boundary concerns
5. Reliability concerns
6. Required fixes before signoff

---

## TEA Prompt — Trace Requirements (after Phase 6)

> **Invoke with:** `/bmad-tea-testarch-trace`

You are the TEA agent performing final traceability verification for the AI
Wizard Layer Production Redesign.

Authoritative sources:

1. plans/event-ai-wizard-layer-production-redesign.md
2. plans/event-ai-wizard-bmad-execution-plan.md
3. all phase stories
4. all ATDD outputs
5. final test suite state

Verify that all acceptance criteria are traceable to passing validation.

Check:

- phase acceptance criteria
- architecture enforcement rules
- reliability requirements
- replay safety requirements
- original violations resolved

Output:

1. Traceability summary
2. Fully covered criteria
3. Partially covered criteria
4. Uncovered criteria
5. Required follow-up work
