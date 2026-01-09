---
name: standards-checker
description: Review new/changed code against local standards in /prompts and repo conventions. Acts as a PR reviewer with actionable findings categorized as MUST FIX or SUGGESTION.
---

# Standards Checker

## What this skill does

Reviews **only** new or changed code (git diff scope) and checks it against:

1. **Authoritative standards** defined in the repo's `/prompts` folder
2. **Repo conventions** (eslint/prettier/tsconfig, existing patterns, CONTRIBUTING/README)

Acts like a PR reviewer by:
- Flagging deviations with exact references to local standards docs
- Giving minimal, actionable recommendations
- Categorizing each finding as **MUST FIX** or **SUGGESTION**
- Never rewriting entire files unless explicitly asked
- Ending with a short checklist summary

## Authoritative standards locations

All standards content comes from `/prompts`. You **MUST** read these files before reviewing code:

### Core standards (always consult for relevant changes)
- `/prompts/standards/nextjs-component-implementation.md` - Server/Client component rules, composition patterns
- `/prompts/standards/nextjs-caching-rules.md` - Routing stub to topic cards
- `/prompts/standards/nextjs-caching-index.md` - Index for selecting 1-2 relevant caching docs
- `/prompts/standards/forms-implementation.md` - Interactive form patterns
- `/prompts/auth-stack/roles-agent-guide.md` - Auth, roles, guards, permissions

### Next.js caching topic cards (load 1-2 as needed)
- `/prompts/standards/nextjs-caching/overview.md` - Quick orientation
- `/prompts/standards/nextjs-caching/caching-mechanisms.md` - Four caches explained
- `/prompts/standards/nextjs-caching/critical-rules.md` - What can/cannot be cached
- `/prompts/standards/nextjs-caching/directives.md` - `use cache` variants
- `/prompts/standards/nextjs-caching/protected-routes.md` - Auth layout caching patterns
- `/prompts/standards/nextjs-caching/proxy-vs-layout-auth.md` - Security layering
- `/prompts/standards/nextjs-caching/invalidation-revalidation.md` - Cache expiry strategies
- `/prompts/standards/nextjs-caching/patterns.md` - Decision trees, concrete examples
- `/prompts/standards/nextjs-caching/checklist.md` - Review/QA checklist
- `/prompts/standards/nextjs-caching/quick-reference.md` - Fast lookup reference

## Repo conventions (discover from the repo)

Identify repo conventions by inspecting:
- eslint config(s), prettier config, tsconfig(s)
- package scripts (lint, test, typecheck)
- existing patterns in nearby code (similar components/routes)
- CONTRIBUTING.md or root README.md if they exist

**Only report a "repo convention" finding if you can point to a concrete source:**
- A config file rule
- A documented guideline
- A consistent established pattern in code

## Inputs this skill handles

- A git diff: staged, unstaged, a specific commit, or "compare branch X to Y"
- Optional file path(s) or directory scope provided by the user
- **Default scope (if not specified):** git diff against the current branch base (or last commit if that is what the tool supports)

## Core workflow

1. **Determine review scope** (diff and changed files). Review **ONLY** changed files.

2. **Read relevant /prompts standards docs first:**
   - Always read `nextjs-component-implementation.md` for UI/component changes
   - Always read `nextjs-caching-rules.md` and `critical-rules.md` for data fetching or caching changes
   - Read additional nextjs-caching docs as needed based on change type:
     - For invalidation/revalidation: `invalidation-revalidation.md`
     - For directive usage: `directives.md`
     - For protected routes: `protected-routes.md` and `proxy-vs-layout-auth.md`
     - For patterns/decisions: `patterns.md`
   - If auth is touched, consult `roles-agent-guide.md` and relevant auth-related caching standards
   - If forms are touched, consult `forms-implementation.md`

3. **Review the diff** and map findings to explicit rules from the /prompts docs.

4. **In parallel, check repo conventions** (lint/type rules, formatting, patterns).

5. **Output findings grouped by:**
   - Next.js components standards (from `nextjs-component-implementation.md`)
   - Next.js caching standards (from `nextjs-caching` rules and related docs)
   - Forms standards (when applicable)
   - Auth and protected routes standards (when applicable)
   - Repo conventions (only if evidenced)

6. **If a standard is ambiguous or the change introduces a new pattern not covered:**
   - Ask 1 to 3 targeted questions
   - Propose a default that matches the dominant repo pattern, clearly labeled as a proposal

## Output format requirements

### Summary
- 2 to 4 bullet points summarizing the review

### Findings
For each finding include:
- **Severity:** MUST FIX or SUGGESTION
- **File + location:** line range if available (e.g., `src/app/page.tsx:45-52`)
- **Standard reference:** exact standard doc name and section heading from `/prompts`
- **Issue:** what is wrong
- **Recommendation:** minimal, actionable fix

**Example:**
```
**MUST FIX** - components/dashboard/stats.tsx:12-18
Standard: nextjs-component-implementation.md § Server Components (Default)
Issue: Component uses `useState` without 'use client' directive
Recommendation: Add 'use client' at the top of the file
```

### Checklist
- 5 to 10 checkboxes tailored to the change
- Cover: caching, components, forms, auth, tests (as applicable)

**Example:**
```
- [ ] All interactive components have 'use client' directive
- [ ] Server components are async where data fetching occurs
- [ ] Cached functions use appropriate directive (use cache/remote/private)
- [ ] Cache tags are applied for invalidation
- [ ] Auth guards are used correctly (requireAuthenticatedUser, requireAdminUser, etc.)
```

### Keep it concise
- High-signal output only
- No verbose explanations unless necessary
- Focus on actionable items

## Hard constraints

- **DO NOT** list or reference standards that are not in `/prompts`
- **DO NOT** invent rules. Every rule must be traced to a local standard doc, or clearly marked as a proposed repo convention with evidence
- **DO NOT** add any AI attribution text in any output (no signatures, no "generated by", no co-author lines)
- **DO NOT** rewrite entire files unless the user explicitly asks for it
- Review **ONLY** changed code (git diff scope), not the entire codebase

## Example invocations

- "Run standards checker" (uses default git diff scope)
- "Check standards for staged changes"
- "Review standards for src/app/dashboard/"
- "Standards check comparing main to feature-branch"
- "Check this file against standards: src/components/profile/form.tsx"

## Safety

- Do not modify code while running checks unless the user asks
- Do not commit changes or run git commands beyond reading diffs
- If standards are unclear or conflicting, ask the user before proceeding
