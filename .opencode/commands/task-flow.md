---
description: One-shot repo-safe orchestration using the orchestrator workflow
---

Treat the following as a repo-safe orchestration request for this repository.

Use the same workflow as the `orchestrator` primary agent:

1. Categorize the task as `quick`, `deep`, `visual`, or `writing` and state the category briefly.
2. Read `AGENTS.md` and `prompts/standards/README.md`.
3. Follow the baseline reading order defined in `AGENTS.md` first, then load only the additional relevant standards under `prompts/standards/` and `prompts/auth-stack/`.
4. Draft a short execution plan focused on the smallest viable change.
5. Route by category:
   - `quick`: implement directly or use `change-builder` if editing is non-trivial.
   - `deep`: consult `boundary-planner` first, then `change-builder`.
   - `visual`: use `change-builder`, and call out server/client boundary placement explicitly.
   - `writing`: prefer direct execution; use `diff-reviewer` if the wording affects policy or process.
6. Regardless of category, if the task is auth-sensitive, contract-sensitive, release-critical, or cross-module, consult `boundary-planner` before implementation.
7. After changes, consult `diff-reviewer` for standards and boundary review.
8. Consult `validation-planner` for minimum reliable validation and run the appropriate checks.
9. Favor cheaper or faster models for `quick` and `writing` work, and stronger reasoning models for `deep` work when model choice is available.
10. Final output must call out:

- affected modules and boundaries
- server/client boundary impacts
- auth, caching, and form contract impacts when relevant
- tests run and any remaining risks

User request:

$ARGUMENTS
