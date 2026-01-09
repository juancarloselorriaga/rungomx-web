---
name: clean-commit
description: Create best-practice git commits (Conventional Commits, clear scope/body) with zero AI attribution or co-author trailers.
---

# Clean Commit Skill (Claude Code)

Apply whenever committing changes.

## Non-negotiables
- No AI attribution or co-author lines in the commit message.
- No mention of Claude, Anthropic, Codex, or "Generated with ...".

## Commit message standard
- Subject: `type(scope): summary` (<= 72 chars, imperative, no period)
- Body: why + impact, wrap ~72 chars
- Footer: `Refs:` / `Closes:` and `BREAKING CHANGE:` when needed

## Process
1. `git status`, review staged diff only.
2. If nothing staged, stage minimal relevant files.
3. Propose message if ambiguous; otherwise commit.
4. Prefer small commits. If the diff is mixed, split commits.
