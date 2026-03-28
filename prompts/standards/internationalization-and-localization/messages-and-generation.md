---
title: Messages and Generation
scope: Canonical message namespace organization, generated i18n artifacts, and validation/generation maintenance gates.
when_to_load: When adding translation strings, creating namespaces, reviewing generated files, or updating localization maintenance scripts.
keywords:
  - messages
  - namespaces
  - generate i18n
  - validate locales
  - generated files
surfaces:
  - messages/**/*.json
  - i18n/loaders.generated.ts
  - i18n/types.generated.ts
  - scripts/generate-i18n-loaders.ts
  - scripts/generate-i18n-types.ts
  - scripts/validate-locales.ts
owner: web-platform
---

# Messages and Generation

## Normative source vs derived artifacts

- The normative message source is the JSON content under `messages/`.
- Generated files such as:
  - `i18n/loaders.generated.ts`
  - `i18n/types.generated.ts`
    are derived artifacts.
- Do not hand-edit generated files as the primary workflow.

## Namespace organization

- Root namespaces live under `messages/{common,navigation,auth,errors,emails}`.
- Component namespaces live under `messages/components/*`.
- Page namespaces live under `messages/pages/*`.
- Keep namespace names explicit and task-readable so generation and review stay predictable.

## Loading model

- `i18n/request.ts` and `i18n/utils.ts` own request-time selection, route normalization, and route-scoped message loading.
- Route-scoped loading is an optimization and payload-control mechanism; it does not change the normative source of the messages.

## Maintenance gates

- `pnpm generate:i18n` is the canonical regeneration path.
- `pnpm validate:locales` is the canonical locale-parity check.
- Build/type-check workflows already depend on i18n generation and validation gates through repo scripts.

## Review rule

- When editing message JSON, review the source JSON first, then regenerate derived artifacts if needed.
- Do not treat the generated code shape as the public API to optimize around.

## Avoid

- Introducing a parallel message registry outside the existing namespace model.
- Treating generated type/loaders output as the new policy source.
- Adding translations in one locale without parity validation across supported locales.

## Legacy / implementation-detail note

- Route-namespace maps and payload-size guardrails in `i18n/utils.ts` are implementation details supporting the current architecture. They are important operationally, but the canonical authoring surface remains the namespace JSON plus generation/validation scripts.
