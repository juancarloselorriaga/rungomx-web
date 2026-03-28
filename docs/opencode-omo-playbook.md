# OpenCode + OMO Playbook

This repository already has a strong repo-native OpenCode setup:

- `AGENTS.md` as the memory and safety entrypoint
- canonical standards under `prompts/standards/**`
- repo-local agents under `.opencode/agents/**`
- repo-local skills under `.claude/skills/**` and `.agents/skills/**`

The goal of this playbook is **not** to replace that workflow with `oh-my-openagent`.
Instead, it captures the useful parts of the OMO style while keeping RunGoMX on a
repo-safe, standards-led agent workflow.

## What we adopted

### 1. Lightweight orchestration instead of a full harness swap

Use the repo-local slash command:

```text
/task-flow <task>
```

It applies a small OMO-inspired loop:

1. categorize the task (`quick`, `deep`, `visual`, `writing`)
2. follow the baseline reading order in `AGENTS.md`, then use `prompts/standards/README.md` to load only additional relevant standards
3. plan the smallest viable change
4. use repo-native agents (`boundary-planner` when needed, `change-builder`, `diff-reviewer`, `coherence-reviewer` when applicable, `validation-planner`)
5. report boundary impacts, tests, and remaining risks

Category guidance:

- `quick`: localized implementation, smaller validation scope
- `deep`: architecture-first, stronger review and validation discipline
- `visual`: UI-heavy work with explicit server/client boundary review
- `writing`: docs/process/copy work with minimal code churn

### 2. Primary orchestration agent

Use the custom OpenCode primary agent:

- `.opencode/agents/orchestrator.md`

This keeps the repository on its existing invariants while borrowing OMO's habit of explicit
task classification and orchestration.

Notes:

- `orchestrator` is the repo's default OpenCode intake agent.
- Specialist work is delegated to clearly named agents under `.opencode/agents/`, and those specialists remain directly selectable when needed.
- The repo no longer depends on a custom mode for this workflow.
- `diff-reviewer` is the blocking review gate for non-trivial code changes.
- `coherence-reviewer` is a conditional final-pass reviewer used for visual, writing, and non-trivial UX/copy/pattern-coherence work after diff review and before validation.

Rename map:

- `strict-build` + `standards-first` -> `orchestrator`
- `architect` -> `boundary-planner`
- `implementer` -> `change-builder`
- `reviewer` -> `diff-reviewer`
- `test-guardian` -> `validation-planner`

### 3. Isolated profile instead of global replacement

Use `scripts/opencode-omo-profile.sh` to create a separate OpenCode config directory.
This avoids modifying `~/.config/opencode/opencode.json` directly.

## Safe isolated OMO workflow

Initialize a dedicated profile:

```bash
scripts/opencode-omo-profile.sh init
```

This creates a profile at:

```text
~/.config/opencode-profiles/rungomx-omo
```

By default the script:

- copies `~/.config/opencode/opencode.json`
- appends `oh-my-openagent@latest` to the `plugin` array
- leaves your main OpenCode profile untouched

Launch OpenCode with the isolated profile:

```bash
scripts/opencode-omo-profile.sh run
```

Or explicitly:

```bash
OPENCODE_CONFIG_DIR="$HOME/.config/opencode-profiles/rungomx-omo" opencode
```

## Optional OMO installer step

If you want to continue the experiment, run the OMO installer against the isolated profile:

```bash
OPENCODE_CONFIG_DIR="$HOME/.config/opencode-profiles/rungomx-omo" npx oh-my-openagent install --no-tui --claude=<yes|no|max20> --openai=<yes|no> --gemini=<yes|no> --copilot=<yes|no>
```

Add any other provider flags you actually use.

## Recommended decision rule

Keep the repository on the current repo-native OpenCode workflow unless the isolated OMO profile
proves materially better for real tasks.

Good candidates to borrow from OMO without a full install:

- explicit task categories
- orchestrator -> change-builder -> diff-reviewer -> coherence-reviewer -> validation-planner sequencing when applicable
- non-trivial code work stays open until `diff-reviewer` has no blocking findings
- stronger model specialization by task type
- one-command orchestration for repetitive work

Avoid replacing the repo-native setup just to gain a heavier harness. This project's standards,
public boundaries, and server-first architecture already benefit from a tighter workflow.

## Notes

- Trial OMO artifacts created during evaluation were intentionally cleaned from the `ai-event`
  worktree.
- OMO licensing and provider behavior should be reviewed before broader adoption.
