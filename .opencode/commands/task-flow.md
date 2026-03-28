---
description: One-shot repo-safe orchestration using the orchestrator workflow
---

Treat the following as a repo-safe orchestration request for this repository.

Use `.opencode/agents/orchestrator.md` as the canonical OpenCode workflow adapter for this task.

1. Read `AGENTS.md`.
2. Follow the baseline reading order defined there.
3. Use `prompts/standards/README.md` only as the discovery layer for additional scoped standards.
4. For trivial `quick` and `writing` tasks, do not load additional scoped standards unless clearly relevant.
5. If this request changes AI guidance surfaces, also load `prompts/meta/ai-guidance-governance.md`.
6. Categorize the task, route specialists, and validate according to `orchestrator`.
7. Final output must still call out:

- whether `diff-reviewer` reported blocking findings

- affected modules and boundaries
- server/client boundary impacts
- auth, caching, and form contract impacts when relevant
- tests run and any remaining risks

User request:

$ARGUMENTS
