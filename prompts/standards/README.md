# Canonical Standards Directory

This directory is the canonical source for project implementation and quality standards.

Key standards used frequently in implementation work include:

- `nextjs-component-implementation.md`
- `dashboard-protected-pages-design.md`
- `nextjs-caching-index.md`
- `forms-implementation.md`
- `e2e-testing.md`
- `test-reliability.md`

It is consumed by multiple agent/tooling ecosystems in this repository, including:

- Codex
- Claude
- OpenCode

To preserve consistency and avoid drift:

- Add or update standards here rather than duplicating rules in agent configs.
- Keep agent memory/config files referential and concise.
- Treat this directory as the single shared standards baseline across ecosystems.
