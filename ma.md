# Pro Status UX — Visual Identity for Pro Users

This document tracks the implementation of the plan from:
`~/.claude/plans/lovely-giggling-llama.md`.

## Implemented Touchpoints

- Avatar: gold ring + crown overlay for Pro users.
- User menu: `PRO` badge next to the user name.
- Sidebar (desktop): `RunGo Pro` label with crown icon.
- Drawer (mobile): `RunGo Pro` label with crown icon.
- Welcome toast: shown once per session for Pro users.

## Key Changes (by plan step)

- Gold brand colors added to `app/globals.css` and registered for Tailwind usage.
- Badge variant: added `pro` variant in `components/common/badge.tsx`.
- Pro avatar wrapper: added `components/billing/pro-avatar-wrapper.tsx`.
- User avatar integration: added `isPro` support in `components/auth/user-avatar.tsx`.
- Pro status wiring: Pro status is fetched client-side via `getProEntitlementAction` (server action) to avoid server-layout DB queries during SSR/tests.
- Sidebar label: implemented in both `components/layout/navigation/sliding-sidebar.tsx` and `components/layout/navigation/sidebar.tsx`.
- Drawer label: implemented in `components/layout/navigation/nav-drawer.tsx`.
- Welcome toast: added `components/billing/pro-welcome-toast.tsx`.
- i18n keys added under `messages/common/{en,es}.json` (`common.billing.*`).

## Verification Commands

- `pnpm lint` (passes; one existing warning in `components/events/sortable-photo-grid.tsx`)
- `pnpm type-check` (passes)
- `pnpm validate:locales` (passes)
- `pnpm test:app` (passes)
- `pnpm test:db` (tests pass, but Jest reports it doesn't exit immediately due to open handles)

