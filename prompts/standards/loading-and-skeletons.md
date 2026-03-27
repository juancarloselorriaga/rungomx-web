# Loading and Skeleton States

Use this standard when working on:

- `loading.tsx` route fallbacks
- `Suspense` fallbacks
- dynamic imports with `loading: () => ...`
- client-side pending states
- list, table, form, dashboard, or workspace placeholders

This is a lightweight orchestration standard for deciding when loading UI should exist and how it should relate to the final interface.

It complements, but does not replace:

- `prompts/standards/nextjs-component-implementation.md`
- `prompts/standards/dashboard-protected-pages-design.md`
- `prompts/standards/nextjs-caching-index.md`
- `prompts/standards/forms-implementation.md`
- `prompts/standards/e2e-testing.md`
- `prompts/standards/test-reliability.md`

## Intent

Skeletons should preserve trust, calm hierarchy, and spatial continuity while data or client-only UI is still loading.

Good loading states:

- resemble the final layout closely enough to reduce layout shift
- keep the main task visually obvious
- feel calm, restrained, and information-first
- reuse shared primitives before introducing bespoke placeholders

## When to add a skeleton

Usually add a skeleton when the user would otherwise see:

- a blank page or blank section during a meaningful wait
- a large layout shift once content resolves
- a repeated filter/search refresh with no visual continuity
- a delayed client-only field or widget that leaves a broken-looking gap

Usually do not add a skeleton when:

- the wait is near-instant and no blank gap appears
- a small inline spinner or pending affordance is clearer
- the content is secondary and can safely pop in without disorienting the user
- the fallback would add decorative chrome without matching the resolved UI

## Preferred implementation order

When introducing or refactoring loading UI, prefer this order:

1. reuse an existing shared loading primitive
2. reuse a route-local shared loading shell if repetition exists in that area
3. mirror the final page intro and surface structure
4. only then introduce a new reusable loading wrapper

Avoid one-off placeholder markup if a nearby page or component already solved the same loading problem well.

## Anatomy by scope

### 1. Route and page loading

Route-level loading should usually preserve the same top-level composition as the resolved page:

- page intro skeleton if the page has a stable intro
- primary section skeletons for the main task area
- quieter supporting skeletons for metadata or secondary panels

For protected dashboard pages, loading states should follow the same calm intro/surface rhythm described in:

- `prompts/standards/dashboard-protected-pages-design.md`

### 2. Section and workspace loading

For large subsections such as dashboards, workspaces, and tab panels:

- preserve section hierarchy
- keep primary content dominant
- use inset or muted treatments for supporting context

Do not replace a clearly structured workspace with unrelated generic blocks.

### 3. Form and field loading

For delayed client-only fields or async form helpers:

- keep the placeholder footprint close to the final control
- do not collapse spacing that the resolved field will need
- prefer field-level skeletons over large page-level placeholders when only one control is delayed

Keep form behavior consistent with:

- `prompts/standards/forms-implementation.md`

### 4. Search, filter, and refresh states

When refreshing filtered data or search results:

- preserve filter controls when possible
- skeletonize the result region rather than the entire screen
- keep `aria-busy` scoped to the updating area when appropriate

### 5. Navigation and session placeholders

For nav/session UI:

- keep placeholders compact
- match the eventual footprint of the control
- avoid loading treatments that dominate the header or cause header reflow

## Shared primitives

Prefer shared building blocks when they already exist in the codebase, especially:

- `components/ui/skeleton.tsx`
- route-local shared loading shells for repeated page families

If introducing a new shared skeleton helper, keep it generic to a product area rather than tied to a single one-off screen.

## Accessibility and behavior

- Use `role="status"`, `aria-live`, and `aria-busy` only where they help users understand an updating region.
- Do not over-announce decorative loading placeholders.
- Preserve approximate final dimensions to reduce layout shift.
- Keep motion restrained and compatible with a calm, dependable UI.

## Architectural boundaries

This standard is not permission to:

- move auth or authorization logic into client code
- add client wrappers solely to show loading UI when server boundaries already exist
- change server action contracts or API behavior
- alter caching strategy without following `prompts/standards/nextjs-caching-index.md`

Continue to follow:

- `prompts/standards/nextjs-component-implementation.md`
- `prompts/standards/nextjs-caching-index.md`
- `prompts/standards/forms-implementation.md`

## Anti-patterns

Avoid:

- centered spinners as the default fallback for full pages with stable layout
- skeletons that do not resemble the final screen structure
- duplicated bespoke placeholder markup across nearby routes
- replacing a localized refresh state with a full-page loading reset
- loud or overly decorative loading surfaces that compete with the eventual content

## Output expectation for agents

When adding or changing loading UI, explicitly note:

- why a skeleton or loading state is needed
- whether it mirrors the resolved page or section structure
- which shared primitives were reused or extended
- that auth, server, caching, and public contract boundaries were preserved
