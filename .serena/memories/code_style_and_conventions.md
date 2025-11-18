# Code Style and Conventions

## TypeScript Configuration
- **Target**: ES2017
- **Strict mode**: Enabled
- **JSX**: react-jsx (React 19)
- **Module resolution**: bundler
- **Path alias**: `@/*` maps to project root

## Prettier Configuration
- **Print width**: 100 characters
- **Single quotes**: Yes
- **Trailing commas**: All
- **Bracket spacing**: Yes
- **Arrow parens**: Always
- **Semicolons**: Yes
- **Tab width**: 2 spaces
- **Bracket same line**: No

## Naming Conventions
Based on code analysis:
- **Files**: kebab-case (e.g., `auth-controls.tsx`, `nav-drawer.tsx`)
- **Components**: PascalCase for function components (e.g., `ThemeSwitcher`, `NavItems`)
- **Constants**: camelCase for exported constants (e.g., `publicNavItems`, `protectedNavItems`)
- **Utility functions**: camelCase (e.g., `capitalize`, `cn`)
- **Type files**: `.ts` extension, constants files use `.constants.ts` suffix

## File Organization Patterns
- Component files export main component as named export
- Constants are separated into `.constants.ts` files
- Types are separated into `types.ts` files when needed
- Server components use `async function` syntax
- Client components have `'use client'` directive at top

## Import Style
- Absolute imports using `@/` path alias
- Group imports logically (external packages, then internal modules)

## Component Patterns
- Use `export function ComponentName()` for components
- Use `export const constantName` for constants
- Server components are async by default in Next.js App Router
- Client interactivity separated into `-interactive` component variants