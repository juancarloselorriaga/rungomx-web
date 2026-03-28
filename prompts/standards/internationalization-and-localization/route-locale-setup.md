---
title: Route Locale Setup
scope: Canonical server-side locale setup for app/[locale] routes, layouts, and localized cached rendering.
when_to_load: When adding or reviewing localized pages/layouts, setRequestLocale usage, or locale-aware message loading in server routes.
keywords:
  - configPageLocale
  - setRequestLocale
  - app locale layout
  - server locale setup
  - cached translations
surfaces:
  - utils/config-page-locale.tsx
  - app/[locale]/layout.tsx
  - i18n/request.ts
  - i18n/utils.ts
owner: web-platform
---

# Route Locale Setup

## Canonical pattern

- Localized routes under `app/[locale]/*` should establish locale context on the server before localized rendering work runs.
- Use the current shared route-level helper pattern (currently `utils/config-page-locale.tsx`).
- `app/[locale]/layout.tsx` is the shell-level provider boundary for localized rendering.

## Route-level expectations

- Validate the locale segment early.
- Call `setRequestLocale(locale)` before localized rendering or cached translation helpers depend on locale context.
- When route-scoped message loading depends on the internal pathname, use the current shared helper pattern that records route context before messages are loaded.

## Layout-level expectations

- `app/[locale]/layout.tsx` should remain the place where localized messages are loaded and passed into the client provider.
- Keep layout setup server-first: validation, locale setup, and message selection happen before crossing into the client provider.

## Caching note

- Locale setup matters for static rendering and cached translations.
- Do not call localized cached helpers without first establishing request locale context.
- For caching semantics and `'use cache'` behavior, defer to `prompts/standards/nextjs-caching-index.md`.

## Client boundary rule

- Client components may call `useTranslations`, `useLocale`, or localized UI hooks only after the server-established provider boundary exists.
- Do not move locale bootstrap, request validation, or route message loading into client code.

## Avoid

- Ad-hoc locale parsing inside arbitrary client components.
- Route files that skip the standard locale setup helper and then patch around missing-locale behavior later.
- Mixing request-specific locale setup with unrelated client-side state logic.
