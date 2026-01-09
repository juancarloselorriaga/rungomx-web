---
name: clean-commit
description: Create best-practice git commits (Conventional Commits, clear scope/body) with zero AI attribution or co-author trailers.
metadata:
  short-description: Clean, human-style commits (no AI signature)
---

# Clean Commit Skill (Codex)

When the user asks to "commit", "make a commit", "commit these changes", or similar:

## Goals
- Produce a high-quality commit message using Conventional Commits:
  - Format: `type(scope): summary`
  - Types: feat, fix, refactor, chore, docs, test, build, ci, perf, revert
  - Summary: imperative mood, <= 72 chars, no trailing period
- Include a body when useful:
  - Explain what and why, not how
  - Wrap at ~72 chars per line
- Include footers when needed:
  - `Refs: XYZ-123` or `Closes: XYZ-123`
  - `BREAKING CHANGE:` when applicable

## Hard rules
- Never include any AI attribution, signatures, links, or trailers:
  - Do NOT include "Generated with ...", "Codex", "Claude", "Anthropic"
  - Do NOT include "Co-authored-by:" lines
- Commit only what is staged. If nothing is staged:
  - Stage only the files relevant to the user's intent (minimal diff)
  - If unclear, ask a single question: "Which files should I include?"

## Workflow
1. Inspect `git status` and `git diff --staged`.
2. If changes look too broad, suggest splitting into multiple commits.
3. Draft the best commit message.
4. Run the repo's fastest relevant checks if they exist (lint/unit), unless user asked not to.
5. Perform `git commit` using an editor or `-m` with body lines.
