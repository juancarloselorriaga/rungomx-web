# Dashboard Protected Pages Design

Use this standard for logged-in protected dashboard pages such as:

- user settings
- my registrations
- organizer events
- organizations
- payments

This standard exists to keep dashboard experiences coherent without forcing every page into an identical template.

## Intent

Dashboard pages should feel like they belong to the same product area:

- calm
- editorial
- information-first
- lightly framed
- operationally clear

Protected pages should avoid competing hero patterns, over-nesting, and one-off card systems that make adjacent flows feel unrelated.

## Core rules

### 1. Prefer a shared page intro anatomy

Top-level protected pages should usually begin with a consistent intro block:

- title
- short description
- optional eyebrow for current section/state
- optional primary actions
- optional compact aside/meta summary

Prefer shared primitives such as:

- `components/dashboard/page-intro.tsx`
- route-local wrappers built on top of it

Do not create bespoke hero structures for each page unless the page has a materially different interaction model.

### 2. Use whitespace and section rhythm before adding more surfaces

A new surface should clarify structure, not merely add decoration.

Prefer:

- one clear page intro surface
- section surfaces only where a block needs identity
- muted/inset surfaces for secondary metadata, summaries, and grouped details

Avoid:

- card-inside-card-inside-card stacking
- repeated full-width banners that restate the same context
- unnecessary borders around already grouped content

### 3. Keep section headers consistent

Operational sections should generally use:

- concise title
- one supporting sentence when needed
- optional eyebrow for categorization
- optional action area aligned with the header

Section headers should explain purpose, not repeat the page title.

### 4. Separate primary content from supporting context

Primary content should dominate visually:

- forms
- tables
- workflows
- queues
- actionable summaries

Supporting context should be quieter:

- counts
- status summaries
- organization/event/account metadata
- help text
- empty-state guidance

Use muted or inset treatments for supporting context so the main task remains obvious.

### 5. Reuse stable surface semantics

When adding or refactoring dashboard UI, prefer shared surface primitives over ad-hoc wrappers.

Use:

- `Surface` for primary sections
- `InsetSurface` for grouped secondary blocks
- `MutedSurface` for low-emphasis support blocks
- shared dashboard/settings section wrappers where available

If a new reusable shell is needed, make it generic and scoped to dashboard protected pages rather than a single route.

### 6. Keep action placement predictable

Page-level actions belong in the intro area.

Section-level actions belong in the section header or footer.

Avoid scattering equally important CTAs across multiple unrelated surfaces on the same screen.

### 7. Empty, warning, and degraded states should match the page system

State panels should feel like part of the same design language as normal sections:

- same spacing cadence
- same typography hierarchy
- same restrained use of color

Warnings and destructive areas may use stronger color cues, but keep them calm and readable.

### 8. Favor consistency over local cleverness

If a nearby protected page already solved a similar layout problem well, extend that pattern.

Do not invent a new hero, tab, settings card, or summary block if an existing shared version is close enough.

## Practical heuristics

### Good signs

- a page is understandable from title, description, and one glance at its first section
- the eye naturally lands on the main task
- secondary metadata is available without dominating the layout
- adjacent dashboard pages feel visually related

### Warning signs

- multiple top sections all look equally important
- the same status/context appears in more than one large box
- there is heavy border density without better comprehension
- each route has a different header composition for no product reason

## Scope and boundaries

This is a visual/system coherence standard, not permission to:

- move server logic into client components
- change auth boundaries
- alter server action contracts
- refactor unrelated domain logic

Continue to follow:

- `prompts/standards/nextjs-component-implementation.md`
- `prompts/standards/forms-implementation.md`
- `prompts/standards/nextjs-caching-index.md`
- `prompts/standards/e2e-testing.md`
- `prompts/standards/test-reliability.md`

## Implementation preference order

When normalizing a protected page, prefer this order:

1. reuse an existing shared intro
2. reuse an existing shared section surface
3. simplify nesting and repeated context
4. only then introduce a new shared wrapper if repetition is real

## Output expectation for agents

When making dashboard protected-page UI changes, explicitly note:

- which page intro pattern is being used or extended
- which sections are primary vs supporting
- whether any repeated chrome/context was removed
- that auth/server boundaries and public contracts were preserved
