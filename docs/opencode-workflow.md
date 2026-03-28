# OpenCode Workflow

The repository's primary OpenCode workflow lives in `.opencode/agents/orchestrator.md`.

Role summary:

- `orchestrator`: primary repo-safe intake agent and the canonical OpenCode workflow adapter.
- `boundary-planner`: read-only specialist for architecture, contracts, auth boundaries, and blast-radius analysis.
- `change-builder`: execution specialist that makes the smallest production-safe code change.
- `diff-reviewer`: read-only specialist for standards compliance and regression review of the diff; the blocking review gate for non-trivial code changes.
- `coherence-reviewer`: read-only final-pass specialist for simplification, coherence, and standards-aligned normalization before validation.
- `validation-planner`: read-only specialist for minimum reliable test and validation scope.
- `/task-flow`: thin one-shot wrapper that routes through `orchestrator`.

Typical flow when applicable:

- classify the task
- read `AGENTS.md`, follow the baseline reading order defined there, then use `prompts/standards/README.md` to discover only the smallest sufficient set of additional standards
- route to `boundary-planner`, `change-builder`, `diff-reviewer`, conditional `coherence-reviewer`, and `validation-planner` as needed
- treat non-trivial code work as incomplete while `diff-reviewer` still has blocking findings

Rename map:

- `strict-build` + `standards-first` -> `orchestrator`
- `architect` -> `boundary-planner`
- `implementer` -> `change-builder`
- `reviewer` -> `diff-reviewer`
- `test-guardian` -> `validation-planner`

See `docs/opencode-omo-playbook.md` for the isolated profile workflow.
