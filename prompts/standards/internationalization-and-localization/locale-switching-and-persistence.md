---
title: Locale Switching and Persistence
scope: Canonical locale-switch UX, persistence boundary, and post-auth locale sync behavior.
when_to_load: When changing locale switchers, locale persistence, auth-aware locale sync, or language preference UI.
keywords:
  - locale switcher
  - updateUserLocale
  - useLocaleChange
  - locale persistence
  - locale sync on auth
surfaces:
  - app/actions/locale.ts
  - hooks/use-locale-change.ts
  - hooks/use-locale-sync-on-auth.ts
  - components/language-switcher.tsx
owner: web-platform
---

# Locale Switching and Persistence

## Boundary model

- Client code owns locale-change intent and interactive UX.
- Server code owns persisted locale mutation.
- `app/actions/locale.ts` remains the canonical persistence boundary for authenticated locale preference changes.

## Preferred flow

- Client switchers and hooks may initiate locale changes through localized navigation helpers.
- If the user is authenticated, persist locale preference through the Server Action boundary.
- If persistence fails, client UX may still switch browser locale, but that does not replace server-side preference ownership.

## Navigation rule

- Use localization-aware navigation wrappers from `i18n/navigation.ts` when changing routes/locales.
- Do not build ad-hoc per-locale URL assembly in client components when existing routing/navigation helpers already model localized pathnames.

## Auth/session sync

- Locale sync after login or session restore should remain server-backed and session-aware.
- Thin client wrappers/hooks that reconcile current route locale with stored profile preference are acceptable as orchestration, but they do not become the source of truth for persistence.

## Profile/settings note

- UI that offers locale selection may use `routing.locales` for available options.
- Persisted user preference still belongs to the server-side mutation boundary, not to uncontrolled client-only storage.

## Avoid

- Writing authenticated locale preference purely in client storage as the preferred model.
- Mutating locale preference outside Server Actions for app-facing flows.
- Coupling locale switching with unrelated auth logic in a way that obscures session refresh behavior.

## Cross-reference

- For mutation and session-refresh expectations, defer to `prompts/standards/server-actions-and-api-contracts-index.md`.
- For forms that edit locale as part of profile preferences, also consult `prompts/standards/forms-implementation.md`.
