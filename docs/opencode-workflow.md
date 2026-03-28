# OpenCode Workflow

- `orchestrator`: primary repo-safe intake agent that classifies work, loads standards, delegates to specialist agents, and owns final risk reporting.
- `boundary-planner`: read-only specialist for architecture, contracts, auth boundaries, and blast-radius analysis.
- `change-builder`: execution specialist that makes the smallest production-safe code change.
- `diff-reviewer`: read-only specialist for standards compliance and regression review of the diff.
- `coherence-reviewer`: read-only final-pass specialist for simplification, coherence, and standards-aligned normalization before validation.
- `validation-planner`: read-only specialist for minimum reliable test and validation scope.
- `/task-flow`: one-shot command wrapper that follows the same orchestration pattern as `orchestrator`.
- Typical sequence when applicable: `orchestrator` -> `boundary-planner` (when needed) -> `change-builder` -> `diff-reviewer` -> `coherence-reviewer` (for visual, writing, and non-trivial UX/copy/pattern-coherence work) -> `validation-planner`.
- Rename map: `strict-build` + `standards-first` -> `orchestrator`, `architect` -> `boundary-planner`, `implementer` -> `change-builder`, `reviewer` -> `diff-reviewer`, `test-guardian` -> `validation-planner`.
- See `docs/opencode-omo-playbook.md` for the isolated profile workflow.
