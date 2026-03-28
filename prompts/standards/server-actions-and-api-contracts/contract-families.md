---
title: Contract Families
scope: Canonical result and response families for forms, domain actions, and HTTP routes.
when_to_load: When choosing or reviewing mutation result shapes, display semantics, machine-readable codes, or cross-boundary contract changes.
keywords:
  - formactionresult
  - actionresult
  - http envelope
  - status code
  - machine semantics
  - display message
surfaces:
  - lib/forms/types.ts
  - lib/forms/use-form.ts
  - lib/**/actions.ts
  - app/api/**
pair_with:
  - prompts/standards/server-actions-and-api-contracts/auth-and-error-mapping.md
  - prompts/standards/forms-implementation.md
owner: web-platform
---

# Contract Families

Use one canonical contract family per boundary.

## 1. Form-facing action contract

Canonical home: `lib/forms/types.ts`

Use `FormActionResult<TData>` for Server Actions that feed `useForm` and form UX.

- **Approved default** for app forms.
- Carries form-friendly semantics:
  - `ok`
  - machine-readable `error`
  - optional `fieldErrors`
  - optional display `message`
  - success `data`

### Display vs machine semantics

- `error` is for branching logic and consistent classification.
- `message` is for user-facing display.
- `fieldErrors` is for field-level display.

Do not rely on `message` alone for machine behavior.

### Current `useForm` limitations

`lib/forms/use-form.ts` currently:

- surfaces only the first message per field
- maps only fields that exist in the submitted values object into `form.errors`

That means multi-message field UIs or server-only field keys need a coordinated migration before they can become standard behavior.

## 2. Domain action results

Canonical home: domain modules under `lib/**`

Use domain `ActionResult`-style contracts for reusable workflows that are not inherently tied to form rendering or HTTP status codes.

- **Approved default** inside domain and orchestration layers.
- Useful for reusable modules such as event workflows and migration-sensitive compatibility facades under `lib/**/actions.ts`, which remain legacy surfaces rather than the preferred new boundary.
- Keep these results machine-oriented and stable for their consumers.

When a domain action is surfaced through a form or route handler, adapt it at the boundary instead of leaking transport-specific concerns inward.

## 3. HTTP route envelopes

Canonical home: `app/api/**`

Use HTTP responses and status codes for route handlers.

- **Approved default** for browser fetches, uploads, external integrations, and webhook-style flows.
- Distinguish transport status from body payload.
- Prefer stable JSON envelopes per route family instead of implicitly mirroring `FormActionResult`.

## 4. Mapping rules between families

- **Form boundary**: convert validation/auth/domain failures into `FormActionResult`.
- **HTTP boundary**: convert auth/domain failures into status codes plus route-specific JSON.
- **Domain boundary**: keep transport-neutral results where practical.

## 5. Legacy and migration guidance

- Current direct client imports from `@/lib/**/actions` remain **legacy compatibility**, not the preferred default for new code.
- Stable facades named in `AGENTS.md` are **migration-sensitive** even if they do not match the preferred default.
- Unifying all mutation contracts under one shape is a **coordinated migration**, not a Phase 1 doc default.
