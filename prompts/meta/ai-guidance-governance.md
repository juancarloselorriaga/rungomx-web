---
title: AI guidance governance
scope: Governance for repository AI instructions, standards references, and drift control
when_to_load: When changing agent guidance, tool-specific instruction files, standards indexes, or repo AI policy wiring
keywords:
  - governance
  - authority hierarchy
  - startup reads
  - standards discovery
  - drift control
  - compatibility stubs
surfaces:
  - AGENTS.md
  - prompts/standards/**
  - prompts/auth-stack/**
  - prompts/meta/**
  - CLAUDE.md
  - .claude/**
  - .opencode/**
  - opencode.json
  - PROJECT_CONTEXT.md
pair_with:
  - prompts/standards/README.md
  - AGENTS.md
owner: Platform architecture / standards maintainers
---

# AI Guidance Governance

This document governs **AI guidance surfaces only**. It does not define runtime architecture, product behavior, or implementation rules for app code.

## 1. Authority hierarchy

Apply conflicts in this order:

1. `prompts/standards/**` and `prompts/auth-stack/**` — canonical runtime, architecture, testing, and auth guidance.
2. `AGENTS.md` — repo entrypoint, invariant summary, required baseline reading order, and stable boundary reminders.
3. `prompts/meta/**` — canonical governance for how AI guidance is organized, referenced, and maintained.
4. Tool-specific guidance such as `CLAUDE.md`, `.claude/**`, `.opencode/**`, and `opencode.json` — referential adapters only.
5. `PROJECT_CONTEXT.md` — descriptive background only.

If a lower-level file conflicts with a higher-level file, update the lower-level file or mark it as legacy/follow-up. Do not canonize the conflict by duplicating both versions.

## 2. Normative vs informative documents

### Normative

- `prompts/standards/**`
- `prompts/auth-stack/**`
- `AGENTS.md`
- `prompts/meta/ai-guidance-governance.md`

These may define required behavior for agents or canonical conflict resolution.

### Informative / referential

- `CLAUDE.md`
- `.claude/**`
- `.opencode/**`
- `opencode.json`
- `PROJECT_CONTEXT.md`

These should summarize, route, or contextualize. They should not become independent policy sources.

## 3. Startup-read policy

- Keep startup reads lean.
- `AGENTS.md` remains the repo entrypoint.
- `prompts/standards/README.md` remains the shared discovery/index layer.
- Only baseline reads explicitly required by `AGENTS.md` should be treated as default startup standards.
- Do not add new baseline startup reads unless the rule is truly universal across most implementation tasks.

## 4. Task-scoped loading policy

- After baseline reads, load only standards relevant to the current task.
- Use `prompts/standards/README.md` and focused indexes such as `prompts/standards/nextjs-caching-index.md` to discover what to load.
- Prefer loading the smallest sufficient set of canonical docs rather than broad prompt bundles.
- For governance edits, pair this doc with `AGENTS.md` and `prompts/standards/README.md`.

## 5. Compatibility stub policy

Tool-specific files may exist to satisfy product, agent, or MCP conventions, but they must remain compatibility stubs:

- point to canonical docs instead of restating them in full
- keep repo-specific workflow notes concise
- avoid duplicating large standards inventories
- label legacy or ecosystem-specific exceptions explicitly

If a tool requires embedded instructions, keep them minimal and link back to the canonical source.

## 6. Deprecation and change management

- Prefer one normative home per rule.
- When moving or consolidating guidance, update the canonical source first, then reduce older files to references.
- Mark superseded content as `legacy`, `exception`, or `follow-up` instead of silently leaving conflicting copies in place.
- Avoid breaking discovery paths without updating the relevant index or entrypoint.
- Governance changes should be documentation/config-only unless a broader migration is explicitly approved.

## 7. Anti-drift rules

- Do not duplicate standards into agent memory files, skills, or tool configs.
- Do not let descriptive docs become normative by accident.
- Do not expand tool-specific files into parallel standards systems.
- When a rule already exists canonically, reference it by path instead of rewriting it.
- When inconsistency is discovered, resolve toward the canonical source and document any remaining exceptions.

## 8. Review ownership and cadence

- Owner: platform architecture / standards maintainers.
- Review this governance whenever AI instruction surfaces are added, renamed, or materially expanded.
- At minimum, re-check this policy during major standards-system updates or release-process changes.
- Tool-specific guidance updates should include a quick drift check against `AGENTS.md`, `prompts/standards/README.md`, and any cited canonical docs.
