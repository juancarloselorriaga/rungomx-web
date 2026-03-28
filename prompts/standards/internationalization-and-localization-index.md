---
title: Internationalization and Localization Index
scope: Discovery index for locale routing, server locale setup, message namespaces, generated i18n artifacts, locale switching, persistence, and localization-aware proxy/SEO behavior.
when_to_load: When a task changes or reviews next-intl routing, locale setup, translations, localized navigation, locale persistence, message generation, or locale-aware SEO/proxy behavior.
keywords:
  - i18n
  - l10n
  - localization
  - next-intl
  - locale routing
  - translations
  - message namespaces
  - locale switching
  - validate locales
surfaces:
  - i18n/routing.ts
  - i18n/request.ts
  - i18n/navigation.ts
  - i18n/utils.ts
  - utils/config-page-locale.tsx
  - app/[locale]/layout.tsx
  - app/actions/locale.ts
  - hooks/use-locale-change.ts
  - hooks/use-locale-sync-on-auth.ts
  - proxy.ts
  - proxy/localization.ts
  - utils/seo.ts
  - messages/**/*.json
  - scripts/generate-i18n-types.ts
  - scripts/generate-i18n-loaders.ts
  - scripts/validate-locales.ts
pair_with:
  - prompts/standards/nextjs-component-implementation.md
  - prompts/standards/nextjs-caching-index.md
  - prompts/standards/forms-implementation.md
  - prompts/standards/server-actions-and-api-contracts-index.md
owner: web-platform
---

# Internationalization and Localization Index

Usage for AI agents: scan this index first, then load the 1–2 most relevant topic files (max 2 unless the task spans multiple localization boundaries).

- scenario: Orientation or source-of-truth questions; keywords: next-intl stack, locales, default locale, routing source; read: prompts/standards/internationalization-and-localization/overview.md
- scenario: Set locale in routes/layouts correctly; keywords: setRequestLocale, configPageLocale, app/[locale], server routes, cached translations; read: prompts/standards/internationalization-and-localization/route-locale-setup.md
- scenario: Add or review translation files and generators; keywords: messages, namespaces, generated files, validate locales, generate i18n; read: prompts/standards/internationalization-and-localization/messages-and-generation.md
- scenario: Change locale in UI or persist language preference; keywords: locale switcher, useLocaleChange, updateUserLocale, session sync; read: prompts/standards/internationalization-and-localization/locale-switching-and-persistence.md
- scenario: Review redirects, localized URLs, or hreflang metadata; keywords: proxy, localization, localized pathnames, alternates, seo; read: prompts/standards/internationalization-and-localization/proxy-routing-and-seo.md
- scenario: Review or PR checklist; keywords: checklist, review, parity, locale boundary, generated artifacts; read: prompts/standards/internationalization-and-localization/checklist.md
