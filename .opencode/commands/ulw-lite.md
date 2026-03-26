---
description: Standards-first lightweight orchestration for repo tasks
---

Treat the following as a lightweight OMO-style orchestration request for this repository.

Workflow:

1. Categorize the task as `quick`, `deep`, `visual`, or `writing` and state the category briefly.
   - `quick`: short, localized changes; prefer direct execution after a compact plan.
   - `deep`: architecture-sensitive, cross-module, or contract-sensitive work; consult `architect`
     first and bias toward a fuller written plan.
   - `visual`: UI/UX-heavy work; still obey repo standards, but explicitly inspect server/client
     boundaries and keep client components leaf-local.
   - `writing`: docs, plans, or copy updates; prefer minimal or no code changes.
2. Read `AGENTS.md` and `prompts/standards/README.md`.
3. Load only the relevant standards under `prompts/standards/` and `prompts/auth-stack/`.
4. Draft a short execution plan focused on the smallest viable change.
5. Route by category:
   - `quick`: implement directly or use `implementer` if editing is non-trivial.
   - `deep`: consult `architect` first, then `implementer`.
   - `visual`: use `implementer`, and call out server/client boundary placement explicitly.
   - `writing`: prefer direct execution; use `reviewer` if the wording affects policy or process.
6. Regardless of category, if the task is auth-sensitive, contract-sensitive, release-critical, or
   cross-module, consult `architect` before implementation.
7. After changes, consult `reviewer` for standards and boundary review.
8. Consult `test-guardian` for minimum reliable validation and run the appropriate checks.
9. Favor cheaper/faster models for `quick` and `writing` work, and stronger reasoning models for
   `deep` work when model choice is available.
10. Final output must call out:

- affected modules and boundaries
- server/client boundary impacts
- auth, caching, and form contract impacts when relevant
- tests run and any remaining risks

User request:

$ARGUMENTS
