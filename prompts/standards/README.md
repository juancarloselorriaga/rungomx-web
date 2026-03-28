# Canonical Standards Directory

This directory is the canonical source for project implementation and quality standards.

## Baseline standards usually read first

These are the standards most implementation tasks should consult early:

- `nextjs-component-implementation.md`
- `nextjs-caching-index.md`
- `forms-implementation.md`
- `e2e-testing.md`
- `test-reliability.md`

## Task-specific standards loaded by relevance

These standards are discovered through this index and should be loaded when the task calls for them:

- `server-actions-and-api-contracts-index.md` — mutation boundary, contract family, auth/error mapping, invalidation, and stable-facade discovery
- `database-and-drizzle-implementation-index.md` — database entrypoints, schema ownership, import boundaries, query placement, transactions, and DB test utility guidance
- `dashboard-protected-pages-design.md` — visual/system coherence for protected dashboard pages
- `loading-and-skeletons.md` — route fallbacks, Suspense, dynamic loading states, and skeleton policy
- `copy-guidelines.md` — product voice, terminology, labels, and user-facing text
- `pro-features.md` — pro feature gating and rollout rules

## Meta / governance

- `../meta/ai-guidance-governance.md` — governance for AI guidance surfaces, authority hierarchy, startup-read policy, and anti-drift rules; load when editing agent/tool-specific guidance rather than product/runtime code

## Naming guidance for future standards

To make standards easy for humans, agents, and indexers to discover:

- prefer explicit, search-friendly names based on the task or surface area
- use the words a developer is likely to search for, such as `copy`, `loading`, `skeletons`, `dashboard`, `forms`, or `caching`
- prefer names like `loading-and-skeletons.md` over vague names like `ux-polish.md`
- keep one primary concern per standard so the file name maps cleanly to the task
- add every new standard to this index with a one-line description
- place broadly required standards in the baseline list; place scoped standards in the task-specific list

It is consumed by multiple agent/tooling ecosystems in this repository, including:

- Codex
- Claude
- OpenCode

To preserve consistency and avoid drift:

- Add or update standards here rather than duplicating rules in agent configs.
- Keep agent memory/config files referential and concise.
- Treat this directory as the single shared standards baseline across ecosystems.
