# OpenCode Workflow

The repository's primary OpenCode workflow lives in `.opencode/agents/orchestrator.md`.

## Config profiles

- `opencode.json` is the default repo-safe profile. It keeps startup reads lean, sets `orchestrator` as the default agent, and relies on `AGENTS.md` plus `prompts/standards/README.md` to route additional standards loading.
- `opencode.strict.json` is a supported experimental profile. It intentionally preloads a broader standards/auth bundle for experimentation, but it still relies on the same canonical sources and should not be treated as a second policy system.

Both profiles should route through the same repo-native agent set, with `orchestrator` as the default intake agent.

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
- read `AGENTS.md`, follow the startup-read policy defined there, then use `prompts/standards/README.md` to discover only the smallest sufficient set of additional standards
- route to `boundary-planner`, `change-builder`, `diff-reviewer`, conditional `coherence-reviewer`, and `validation-planner` as needed
- treat non-trivial code work as incomplete while `diff-reviewer` still has blocking findings

Tooling notes:

- Use Context7 when work depends on validating framework, library, API, or setup/configuration documentation.
- `next-devtools` is optional and disabled by default in the repo configs. It can help with targeted Next.js investigation, but it is not part of the canonical startup policy.
- Specialists remain directly usable for focused tasks; `orchestrator` is the preferred intake layer for ambiguous or multi-step work.

Rename map:

- `strict-build` + `standards-first` -> `orchestrator`
- `architect` -> `boundary-planner`
- `implementer` -> `change-builder`
- `reviewer` -> `diff-reviewer`
- `test-guardian` -> `validation-planner`

See `docs/opencode-omo-playbook.md` for the isolated profile workflow.
