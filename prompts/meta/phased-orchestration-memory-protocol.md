---
title: Phased orchestration memory protocol
scope: Optional, non-authoritative orchestration memory for long-running phased work across repo AI agent ecosystems
when_to_load: When defining, implementing, or operating optional phased-memory behavior for orchestrators or other task-routing agent adapters
keywords:
  - phased memory
  - orchestration continuity
  - resume
  - checkpoint
  - implementation index
  - re-plan
  - blast radius
surfaces:
  - prompts/meta/**
  - .opencode/**
  - .claude/**
  - AGENTS.md
  - opencode.json
  - opencode.strict.json
pair_with:
  - AGENTS.md
  - prompts/meta/ai-guidance-governance.md
  - prompts/standards/README.md
owner: Platform architecture / standards maintainers
---

# Phased Orchestration Memory Protocol

This document governs an **optional orchestration memory capability** for long-running, multi-phase work.

It exists to improve control, recoverability, and context efficiency when work spans multiple phases or sessions. It does **not** replace the codebase, canonical standards, approved plans, or actual implementation results.

## 1. Core principles

- Keep the capability optional and mode-gated.
- Prefer the smallest robust design that preserves control.
- Use memory for orchestration control, not as a second source of truth.
- Plan the current phase in detail and keep future phases intentionally light.
- Re-plan later phases from actual outcomes, not from stale earlier assumptions.
- Keep memory compact; do not let it become a running journal.

## 2. Authority and non-goals

User scope and task constraints determine what work is in or out of scope. They always bound the task. Within that approved scope, canonical standards, governance, and live repo reality govern how phased memory is operated and reconciled.

Apply conflicts in this order:

1. Canonical runtime and testing guidance under `prompts/standards/**` and `prompts/auth-stack/**`
2. `AGENTS.md`
3. Actual repo state, git diff, tests, and completed implementation results
4. Canonical meta guidance under `prompts/meta/**`
5. Phased-memory summaries or artifacts

Phased memory is non-authoritative. It must not:

- restate or duplicate canonical standards
- override actual repo state or implementation results
- silently absorb unrelated working-tree changes
- force tracked repo artifacts just to preserve memory
- expand future-phase planning beyond what is needed for control

## 3. Eligibility and activation

Use phased memory only for genuinely multi-phase or deep orchestration work.

Strong indicators include:

- the task is clearly phased or expected to span multiple sessions
- later phases depend on actual outcomes from earlier phases
- checkpoint count or handoff risk is non-trivial
- cross-module or boundary-sensitive coordination increases recovery risk

Do not activate phased memory for ordinary one-shot work, localized edits, or tasks that can be safely reconstructed from canonical docs and the live repo state with little overhead.

## 4. Mode selection and escalation

If phased memory is warranted at all, start in `lightweight` mode unless deep-mode triggers are clearly met.

### Lightweight mode

- May use ephemeral checkpoints only.
- Does not guarantee durable recovery.
- Is appropriate when interruption risk is still modest, checkpoint count is still low, and later phases do not yet materially depend on actual prior implementation outcomes.

### Deep mode

- Requires a durable, non-tracked memory artifact.
- Is appropriate when interruption risk, checkpoint count, or dependency on actual prior outcomes materially increases.
- Should remain exceptional rather than routine.

Promote from `lightweight` to `deep` only when the control benefits clearly outweigh the overhead.

## 5. Storage policy

Deep-mode storage must use the safest non-tracked writable scratch location available.

For adapters choosing storage, prefer this order:

1. prefer an existing ignored workspace-local area when present
2. otherwise use runtime scratch

Never create tracked repo files for phased memory.

If no safe non-tracked writable scratch location is available:

- do not invent tracked repo storage
- remain in `lightweight` mode
- recover from canonical docs + repo state instead

## 6. Phase planning model

- Fully plan the current phase.
- Keep future phases as minimal stubs until they become active.
- When a later phase starts, plan it from the current codebase reality plus verified outcomes from prior phases.

Future-phase stubs should stay compact and contain only what is needed to preserve control, such as:

- phase objective
- prerequisites and dependencies
- major risks
- what must be revalidated before detailed planning

Do not turn future-phase stubs into full execution plans before their turn.

## 7. Deep-memory artifact requirements

Every deep-memory artifact must stay compact and must include:

- task identity
- authoritative source paths
- current phase and status
- last verified checkpoint
- actual outcomes from completed work that later phases must respect
- active constraints, assumptions, and blockers
- future-phase stubs
- next safe step
- implementation index

### Required implementation index

The implementation index is mandatory in deep mode and must compactly track:

- touched surfaces and modules
- contracts and invariants confirmed or changed
- boundary impacts
- remaining migration points
- deferred cleanup
- next safe step

The implementation index is a compact re-entry summary for resume, scope checks, and re-planning. It records pointers and verified summaries only; contracts, invariants, and boundary truth remain authoritative in canonical docs, code, diffs, and tests.

## 8. Memory update policy

Update phased memory only at stable checkpoints:

- after current-phase plan lock
- after phase completion
- after blocker discovery that changes later work
- before stop or handoff

When updating memory:

- rewrite or compress instead of appending endlessly
- keep the artifact compact
- avoid turning it into a running journal

## 9. Resume and startup alignment

Resume must still follow the normal `AGENTS.md` startup and read policy.

After that baseline startup behavior:

- re-read only the smallest additional canonical sections needed for the active phase and touched boundaries
- widen rereads only when conflict, uncertainty, or scope expansion requires it

Do not defeat context efficiency with blanket rereads unless the situation genuinely requires them.

## 10. Recovery and reconstruction

Recovery is always reconcile-first.

When resuming:

1. follow the normal `AGENTS.md` startup path
2. load the smallest necessary additional canonical sections for the active phase
3. load the deep-memory artifact if one exists
4. inspect actual repo state and relevant diffs
5. compare the live state against the implementation index
6. reconstruct the current-phase brief
7. continue only after reconciliation

If memory conflicts with the codebase, git diff, tests, or canonical docs, trust the live state and canonical docs.

Without deep mode, recover from canonical docs + repo state first and treat any ephemeral checkpoint as convenience only.

## 11. Repo-state reconciliation and unrelated diffs

On activation and resume, inspect pre-existing working-tree diffs.

If unrelated changes intersect current touchpoints:

- record the intersection in phased memory when deep mode is active
- narrow scope or re-plan before continuing
- do not let phased memory silently absorb those changes as part of the active work

Phased memory should reflect the active orchestration scope, not blur ownership of unrelated edits.

## 12. Blast-radius stop rule

If touched surfaces materially exceed the current phase scope or the recorded implementation index:

- stop
- update phased memory with the new scope signal when deep mode is active
- re-plan before continuing

Do not continue under the original phase plan once the blast radius has materially expanded.

## 13. Integration expectations for adapters

Tool-specific orchestrators and adapters may implement this protocol, but they must remain adapters rather than independent policy systems.

They should:

- decide whether phased memory activates
- choose `lightweight` or `deep` mode
- maintain compact checkpoint behavior
- preserve the authority order defined here
- reference this protocol instead of restating it in tool-specific files

They should not:

- make phased memory always-on
- create separate competing protocol definitions
- store phased memory in tracked repo files
- let memory artifacts replace canonical plans, standards, or live repo inspection

## 14. Anti-bloat rules

- Keep phased memory compact.
- Prefer summaries over logs.
- Prefer implementation-index updates over narrative accumulation.
- Remove stale detail when it no longer helps the current phase.
- Preserve only what is required to control the next safe step and reconstruct the active phase.
