# Phased Memory Support

This directory provides adapter-support templates for the optional phased-memory workflow.

- Canonical rules live in `prompts/meta/phased-orchestration-memory-protocol.md`.
- Governance for tool-specific guidance still lives in `prompts/meta/ai-guidance-governance.md`.
- These files are support shapes only; they are not a second policy source.

Preferred durable scratch location for OpenCode adapter support in this repo:

- `.tmp/opencode-phased-memory/`

Why:

- `.tmp/` is already ignored by the repo root `.gitignore`.
- It is workspace-local and avoids tracked memory artifacts.

Fallbacks:

- If `.tmp/opencode-phased-memory/` is not safe or writable, use another safe non-tracked scratch location.
- If no safe non-tracked writable location is available, stay in `lightweight` mode and recover from canonical docs plus repo state.

Support files:

- `lightweight-checkpoint-template.md` - minimal ephemeral checkpoint shape
- `deep-memory-template.md` - compact deep-mode artifact shape
- `validation-exercise-ai-wizard.md` - concrete dry-run example of activation, escalation, and resume behavior on a realistic phased task

Helper command:

```bash
pnpm opencode:phased-memory:init --title "Task title" --phase "Phase 1"
```

Useful options:

- `--task-id <slug>` to control the artifact filename
- `--canonical <path>` to add canonical source docs
- `--plan <path>` to capture the active plan or spec
- `--checkpoint <label>` to seed the first stable checkpoint
- `--next-step <text>` to seed the next safe step
- `--touchpoint <path>` to seed touched surfaces
- `--force` to refresh an existing scratch artifact while preserving untouched fields

Resume note:

- Resume still starts from `AGENTS.md` and `prompts/standards/README.md` according to the normal startup policy.
- The deep-memory artifact is secondary context for reconstruction, not a replacement for canonical startup reads.
