---
description: One-shot repo-safe orchestration using the orchestrator workflow
---

Treat the following as a repo-safe orchestration request for this repository.

Use the same workflow as the `orchestrator` primary agent:

1. Categorize the task as `quick`, `deep`, `visual`, or `writing` and state the category briefly.
2. Read `AGENTS.md` and `prompts/standards/README.md`.
3. Follow the baseline reading order defined in `AGENTS.md` first, then load only the additional relevant standards under `prompts/standards/` and `prompts/auth-stack/`.
4. If the task changes AI guidance surfaces such as `AGENTS.md`, `prompts/**`, `.opencode/**`, `.claude/**`, `opencode.json`, or `PROJECT_CONTEXT.md`, also load `prompts/meta/ai-guidance-governance.md`.
5. Draft a short execution plan focused on the smallest viable change.
6. Route by category:
   - `quick`: implement directly or use `change-builder` if editing is non-trivial.
   - `deep`: consult `boundary-planner` first, then `change-builder`.
   - `visual`: use `change-builder`, and call out server/client boundary placement explicitly.
   - `writing`: prefer direct execution; use `diff-reviewer` if the wording affects policy or process.
7. Regardless of category, if the task is auth-sensitive, contract-sensitive, release-critical, or cross-module, consult `boundary-planner` before implementation.
8. After changes, consult `diff-reviewer` for standards and boundary review.
9. For non-trivial code changes, do not treat the task as complete until `diff-reviewer` reports no blocking findings.
10. When the task is `visual`, `writing`, or non-trivial UX, copy, or pattern-coherence work, consult `coherence-reviewer` for a final simplification and alignment pass.
11. Consult `validation-planner` for minimum reliable validation and run the appropriate checks.
12. Favor cheaper or faster models for `quick` and `writing` work, and stronger reasoning models for `deep` work when model choice is available.
13. Final output must call out:

- whether `diff-reviewer` reported blocking findings

- affected modules and boundaries
- server/client boundary impacts
- auth, caching, and form contract impacts when relevant
- tests run and any remaining risks

User request:

$ARGUMENTS
