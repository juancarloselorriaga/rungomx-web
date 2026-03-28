---
title: Internationalization and Localization Checklist
scope: Review checklist for locale setup, message sources, generated artifacts, locale persistence, and localized routing/SEO behavior.
when_to_load: When reviewing a PR, making a non-trivial localization change, or checking whether a new i18n change follows repo standards.
keywords:
  - checklist
  - i18n review
  - locale review
  - next-intl review
surfaces:
  - i18n/routing.ts
  - utils/config-page-locale.tsx
  - app/[locale]/layout.tsx
  - messages/**/*.json
  - app/actions/locale.ts
  - proxy.ts
  - utils/seo.ts
owner: web-platform
---

# Internationalization and Localization Checklist

- [ ] **Routing authority:** locale list, default locale, and localized pathnames come from `i18n/routing.ts`.
- [ ] **Server setup:** localized routes/layouts establish locale context on the server before localized rendering or cached translation work runs.
- [ ] **Client boundary:** client components consume translations and localized navigation; they do not own locale bootstrap.
- [ ] **Message source:** message JSON under `messages/` remains the normative source.
- [ ] **Generated artifacts:** `i18n/*.generated.ts` files are treated as derived outputs, not hand-authored policy.
- [ ] **Maintenance gates:** changes that require regeneration/parity checking use the existing `generate:i18n` and `validate:locales` scripts.
- [ ] **Persistence boundary:** authenticated locale preference writes go through `app/actions/locale.ts` or an explicitly coordinated replacement Server Action boundary, not a client-only mutation path.
- [ ] **Auth/session sync:** locale sync behavior after auth remains session-aware and server-backed.
- [ ] **Proxy scope:** localization proxy behavior is described as routing/normalization only, not as a replacement for auth boundaries.
- [ ] **SEO source:** canonical/alternate/hreflang metadata derives from shared routing-aware SEO utilities.
- [ ] **Legacy labeling:** any implementation-detail wrappers or exceptional patterns are labeled as such rather than promoted to universal defaults.
