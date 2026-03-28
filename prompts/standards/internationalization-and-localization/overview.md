---
title: Internationalization and Localization Overview
scope: Canonical next-intl ownership model, source-of-truth files, and high-level boundary rules.
when_to_load: When adding or reviewing localization architecture, explaining source-of-truth ownership, or orienting a task touching locale-aware behavior.
keywords:
  - i18n overview
  - next-intl
  - routing source of truth
  - locale ownership
surfaces:
  - i18n/routing.ts
  - i18n/request.ts
  - app/[locale]/layout.tsx
  - utils/config-page-locale.tsx
owner: web-platform
---

# Internationalization and Localization Overview

This family defines the canonical localization model for the app.

## Stack and source of truth

- `next-intl` is the localization stack.
- `i18n/routing.ts` is the source of truth for:
  - supported locales
  - default locale
  - locale-prefix mode
  - localized pathnames
- `i18n/request.ts` configures request-time locale + message loading for `next-intl`.
- `app/[locale]/layout.tsx` is the shell-level provider composition point.

## Core boundary model

- Server routes and layouts establish locale context before localized rendering.
- Client components consume the established translation context; they do not become the source of truth for locale bootstrap.
- Locale preference persistence remains a server-side mutation concern, consistent with `AGENTS.md` and `prompts/standards/server-actions-and-api-contracts-index.md`.

## Message model

- Message content lives under `messages/`.
- Generated files under `i18n/*.generated.ts` are derived artifacts, not the normative source.
- Generation and parity validation scripts are maintenance gates, not alternate policy documents.

## Routing and SEO model

- Localized navigation, proxy localization behavior, and hreflang alternates all derive from the same routing source.
- Do not maintain parallel per-locale route maps outside `i18n/routing.ts` unless a coordinated migration is explicit.

## Refer instead of duplicating

- For server/client component boundaries, defer to `prompts/standards/nextjs-component-implementation.md`.
- For cache behavior around localized message loading, defer to `prompts/standards/nextjs-caching-index.md`.
- For locale persistence as a mutation boundary, defer to `prompts/standards/server-actions-and-api-contracts-index.md`.

## Legacy or implementation-detail notes

- Thin client wrappers used for locale sync after auth are implementation details, not a separate persistence model.
- AsyncLocalStorage route-context helpers are operational implementation details, not public contracts.
- Direct use of `routing.locales` in UI option lists is acceptable for presentation, but routing authority still belongs to `i18n/routing.ts`.
