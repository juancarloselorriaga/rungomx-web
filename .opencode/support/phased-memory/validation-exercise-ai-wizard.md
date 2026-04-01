# Validation Exercise: AI Wizard Redesign

> Support validation note only.
> Protocol authority: `prompts/meta/phased-orchestration-memory-protocol.md`

## Scenario

Use the phased-memory protocol against the real multi-phase redesign flow defined in:

- `plans/event-ai-wizard-bmad-execution-plan.md`
- `plans/event-ai-wizard-bmad-prompt-pack.md`

This is a realistic fit because it spans six phases, depends on completed artifacts from earlier phases, and explicitly keeps future stories light until their turn.

## Activation Decision

- Task classification: `deep`
- Phased-memory eligibility: yes

Why it qualifies:

- phase count is high
- later phases depend on actual prior implementation outcomes
- checkpoint count is expected to grow
- resume and handoff risk are materially real

## Start Mode Decision

Start in `lightweight` mode at Phase 1 intake.

Why not start `deep` immediately:

- the current need is to lock the first phase plan, not preserve a long artifact yet
- durable memory is overhead until the work proves session-spanning or checkpoint-heavy

Initial lightweight checkpoint shape:

- current phase: Phase 1
- touched surfaces: redesign plan, execution plan, prompt pack, target implementation surfaces once selected
- blockers or scope risks: none yet beyond cross-phase drift risk
- next safe step: lock the Phase 1 plan and confirm phase boundaries

## Escalation To Deep Mode

Promote to `deep` after the current-phase plan is locked and the run becomes clearly multi-session or checkpoint-heavy.

Concrete trigger set for this task:

- current-phase plan lock completed
- more than one stable checkpoint is expected
- later phases now depend on actual Phase 1 implementation results
- interruption or handoff risk is no longer theoretical

Preferred durable scratch path in this repo:

- `.tmp/opencode-phased-memory/event-ai-wizard-redesign.md`

Why this path is acceptable:

- `.tmp/` is already ignored in the repo root `.gitignore`
- the path remains workspace-local and non-tracked

## Deep Artifact Contents For This Task

Minimal deep artifact should capture:

- task identity and authoritative source paths
- current phase and last verified checkpoint
- implementation index for actual Phase 1 outcomes
- Phase 2 stub based on prerequisites and risks only
- blockers, deferred cleanup, and next safe step

Example implementation-index content after Phase 1:

- touched surfaces: canonical contracts, neutral extraction modules, import replacement points
- contracts or invariants confirmed: shared contract ownership, no duplicate contract shapes, import direction preserved
- contracts or invariants changed: only those intentionally centralized in Phase 1
- boundary impacts: route ownership unchanged or reduced, neutral modules introduced, no AI leakage into base wizard domain
- remaining migration points: proposal finalization seam, execution-plan contract, later apply-engine work
- deferred cleanup: any temporary import bridge still needed for next phase
- next safe step: create the Phase 2 story from actual Phase 1 outputs

## Resume Behavior

On resume, the orchestrator should:

1. follow normal `AGENTS.md` startup policy
2. re-read only the smallest additional canonical sections needed for the active phase
3. load the deep artifact from `.tmp/opencode-phased-memory/event-ai-wizard-redesign.md`
4. inspect actual repo state and relevant diffs
5. compare live implementation against the implementation index
6. re-plan the active phase only if the repo reality has shifted

Selective reread set for a Phase 2 resume:

- `AGENTS.md`
- `prompts/meta/phased-orchestration-memory-protocol.md`
- `plans/event-ai-wizard-bmad-execution-plan.md`
- the current Phase 2 story once it exists
- only the feature standards touched by the active implementation surfaces

## Unrelated Diff Handling

If pre-existing unrelated diffs intersect current touchpoints, the orchestrator should:

- record the intersection in the deep artifact
- narrow the active scope or re-plan
- avoid silently treating those changes as part of the phased run

Example:

- if unrelated edits already touch the same shared contract file targeted by Phase 2, the run should stop and re-plan around the new repo reality before proceeding

## Blast-Radius Stop Rule

If actual touched surfaces grow beyond the recorded current-phase scope or implementation index, stop and re-plan.

Example:

- if Phase 2 starts touching apply-engine internals originally reserved for Phase 4, the run should stop, update the deep artifact, and re-plan before continuing

## Validation Outcome

This exercise illustrates how the current protocol and adapter wiring are intended to behave:

- activation is selective
- start mode is `lightweight`
- escalation to `deep` is justified by real continuity needs
- durable memory stays in ignored scratch space
- future phases stay stubbed until activated
- resume remains selective and repo-reconciled
- scope drift triggers a stop and re-plan instead of silent expansion
