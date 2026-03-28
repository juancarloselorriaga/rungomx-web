# Engineering Principles

Use this standard for non-trivial code changes when maintainability, readability, naming, duplication, or side-effect clarity are part of the task or review.

This standard is intentionally narrow.

- It helps agents and reviewers judge whether changed code became easier or harder to understand.
- It does not replace architecture, auth, forms, caching, workflow, database, or testing standards.
- It does not justify broad rewrites outside the requested task.

Pair it with the task-relevant canonical standards already discovered through `prompts/standards/README.md`.

## Intent

Prefer code that is easier to understand, safer to change, and clearer about where important decisions live.

When tradeoffs exist:

- preserve canonical boundaries first
- prefer the smallest auditable improvement
- fix clarity problems in the changed code without reopening unrelated design decisions

## 1. Intent-revealing names

Names in changed code should make purpose obvious at the level where they are used.

Especially important for:

- exported functions
- Server Actions
- public helpers and facades
- components
- types and result shapes

Prefer names that communicate domain intent over generic names such as `data`, `item`, `helper`, `handler`, or `utils` when a more specific name is available.

Local short names are acceptable when the scope is tiny and the meaning is obvious.

### Blocking review examples

- a newly exported helper or action has a name that hides what it mutates or returns
- a public type name is so generic that callers cannot infer its role
- a rename makes behavior less clear at a boundary

### Advisory examples

- a local variable could be renamed for readability with no behavioral risk

## 2. Keep units focused at their level

Changed functions, modules, and components should have one clear job at their own level of abstraction.

Good signs:

- the reader can summarize the unit in one short sentence
- control flow is easy to follow
- the unit is not mixing unrelated orchestration, formatting, and policy decisions without a clear reason

Do not extract tiny helpers just to make code look smaller if the result becomes harder to follow.

### Blocking review examples

- a new helper mixes unrelated behaviors behind ambiguous flags or branching that hides intent
- a changed unit combines domain policy and presentation logic in a way that obscures ownership

### Advisory examples

- a function could be split into two clearer steps, but the current version is still understandable

## 3. Avoid duplicated domain logic

Do not duplicate authoritative business rules, validation logic, transition policy, or contract mapping across layers.

Prefer one authoritative home for a rule, with other layers orchestrating or presenting the result.

This is especially important across:

- `app/` and `lib/`
- Server Actions and route handlers
- server and client components
- workflow/state-machine policy and UI flow helpers

Small presentational repetition is sometimes acceptable. Repeated domain decisions are not.

### Blocking review examples

- server-side validation or authorization logic is re-implemented in the client as if it were authoritative
- the same mapping or business rule is copied into multiple modules instead of calling the canonical source

### Advisory examples

- nearby presentation markup could share a helper, but no domain rule is duplicated yet

## 4. Make side effects obvious

Changed code should make important side effects visible and easy to reason about.

Important side effects include:

- writes and mutations
- cache invalidation or refresh behavior
- network calls
- auth and permission checks
- time-dependent behavior
- environment-dependent branching

Do not hide meaningful side effects inside innocuous-looking helpers or generic utility names.

Prefer naming and structure that make the orchestration boundary obvious.

### Blocking review examples

- a helper that appears to compute a value also performs a write, refresh, or permission-changing action
- a mutation path hides invalidation or refresh behavior in a way that makes caller behavior hard to predict

### Advisory examples

- a helper could be renamed to better signal a side effect that is already clear from context

## 5. Prefer direct code over speculative abstraction

Only add a new abstraction when it meaningfully improves clarity, reuse, or boundary preservation.

Prefer:

- extending an existing local pattern
- a direct implementation that matches nearby code
- extraction when it gives a reusable or clearer unit with a stable purpose

Avoid:

- generic wrappers that only forward arguments without adding domain meaning
- new indirection introduced only in case it might be reused later
- abstraction layers that hide the main control flow of the changed behavior

### Blocking review examples

- a new abstraction obscures the behavior more than it simplifies it
- a new wrapper duplicates an existing pattern while making ownership less clear

### Advisory examples

- a helper is slightly premature but still understandable and low-risk

## 6. Comments should explain why, not narrate the obvious

Prefer code that is readable without line-by-line narration.

Use comments for:

- invariants and constraints
- non-obvious tradeoffs
- boundary or migration-sensitive behavior
- domain rules that are not clear from structure alone

Avoid comments that merely restate the code.

### Blocking review examples

- a comment contradicts the code or hides an important assumption that should be modeled more clearly

### Advisory examples

- a comment repeats obvious behavior and can be removed for clarity

## 7. Use this standard without widening scope

This standard is not permission to:

- move security or authorization logic across boundaries
- rewrite stable public facades casually
- refactor unrelated modules for style reasons alone
- replace canonical task-specific standards with generic maintainability opinions

When a maintainability cleanup would materially reshape architecture or contracts, treat it as follow-up work unless the task explicitly includes that migration.

## Review contract

When this standard is used during review:

- review changed code in context, not the whole codebase
- reserve blocking findings for clear violations that make the changed code materially harder or less safe to maintain
- keep advisory findings narrow and high-leverage

### Usually blocking

- misleading names at exported or boundary-facing surfaces
- duplicated domain logic across layers
- hidden side effects that obscure mutation or refresh behavior
- new abstraction that makes changed behavior harder to follow

### Usually advisory

- local naming polish
- extraction opportunities
- comment cleanup
- small readability improvements that do not affect safety or ownership

## Related standards

- `prompts/standards/nextjs-component-implementation.md`
- `prompts/standards/server-actions-and-api-contracts-index.md`
- `prompts/standards/database-and-drizzle-implementation-index.md`
- `prompts/standards/workflow-state-machines.md`
- `prompts/standards/forms-implementation.md`
- `prompts/standards/test-reliability.md`

Use those standards when the task crosses those boundaries. This document only adds maintainability review guidance for the changed code.
