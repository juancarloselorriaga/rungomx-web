---
description: Initialize or refresh a deep phased-memory scratch artifact
---

Treat the following as a repo-safe request to initialize or refresh phased memory for the current task.

1. Read `AGENTS.md`.
2. Follow the normal startup path defined there.
3. Load `prompts/meta/phased-orchestration-memory-protocol.md`.
4. If this request changes AI guidance surfaces, also load `prompts/meta/ai-guidance-governance.md`.
5. Only create or refresh durable phased memory when `deep` mode is selected or clearly warranted by the protocol.
6. Use `pnpm opencode:phased-memory:init` with the smallest sufficient args for the task.
7. In this command flow, do not manually edit the deep-memory artifact after the helper runs. The helper is the only writer.
8. Use only safe non-tracked scratch storage; if no safe location is available, do not create tracked storage and remain `lightweight`.
9. Return the artifact path created or updated, plus any still-empty fields that need filling at the next stable checkpoint.

User request:

$ARGUMENTS
