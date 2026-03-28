---
title: Proxy Routing and SEO
scope: Canonical guidance for localized pathnames, default-locale prefix behavior, proxy localization helpers, and hreflang/canonical metadata derivation.
when_to_load: When reviewing locale redirects, proxy localization behavior, localized URLs, sitemap/robots/alternates, or SEO metadata across locales.
keywords:
  - proxy localization
  - localized routes
  - hreflang
  - canonical urls
  - default locale rewrite
surfaces:
  - proxy.ts
  - proxy/localization.ts
  - proxy/i18n.ts
  - i18n/routing.ts
  - utils/seo.ts
owner: web-platform
---

# Proxy Routing and SEO

## Routing source of truth

- `i18n/routing.ts` is the canonical source for localized pathnames and locale-prefix behavior.
- Proxy localization behavior and SEO alternate generation should derive from that same routing config.

## Proxy role

- The proxy/localization layer handles:
  - locale-aware path normalization
  - default-locale rewrite behavior for `localePrefix: 'as-needed'`
  - root-path preferred-locale redirect behavior
  - handoff to `next-intl` middleware where appropriate

## Important boundary note

- Localization proxy behavior is about routing and URL normalization.
- It is **not** a replacement for auth/authorization boundaries.
- If a task touches both localization and security flow, defer auth ownership to the existing auth/proxy standards rather than documenting a blended rule here.

## SEO rule

- Canonical URLs, alternates, and hreflang metadata should derive from routing/pathname config rather than hand-maintained parallel maps.
- Use the shared SEO utilities that already resolve localized paths from routing definitions.

## Avoid

- Hardcoding alternate locale URLs independently from `i18n/routing.ts`.
- Adding one-off per-page locale redirect logic when the shared proxy/localization layer already owns it.
- Describing proxy behavior as if it owns security enforcement.

## Legacy / implementation-detail note

- Internal rewrite headers, normalization helpers, and route-context mechanics are implementation details that support the current behavior. Preserve their intent, but do not elevate every internal helper to a stable public contract.
