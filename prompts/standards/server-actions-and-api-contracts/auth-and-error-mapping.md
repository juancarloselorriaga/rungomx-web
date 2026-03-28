---
title: Auth and Error Mapping
scope: Guard usage and consistent mapping of auth and failure states across Server Actions and route handlers.
when_to_load: When adding auth checks, converting guard failures into contract outputs, or reviewing result/status mappings.
keywords:
  - auth mapping
  - withauthenticateduser
  - guards
  - unauthenticated
  - forbidden
  - profile incomplete
  - status codes
surfaces:
  - lib/auth/guards.ts
  - lib/auth/action-wrapper.ts
  - app/actions/*
  - app/api/**
pair_with:
  - prompts/auth-stack/roles-agent-guide.md
  - prompts/standards/server-actions-and-api-contracts/contract-families.md
owner: web-platform
---

# Auth and Error Mapping

## Approved default

- Use guards from `lib/auth/guards.ts` for backend auth and authorization decisions.
- App-facing Server Actions should adapt guard failures into stable structured results at the action boundary.
- Use wrapper helpers from `lib/auth/action-wrapper.ts` as the default way to map guard failures into action contracts instead of leaking raw guard throws to frontend-consumed callers.
- Keep auth enforcement at server boundaries. Do not move it to client logic or client-only language.

## Server Action mapping

For Server Actions:

- use `withAuthenticatedUser`, `withProfileCompleteUser`, `withAdminUser`, or `withStaffUser` from `lib/auth/action-wrapper.ts` by default for frontend-consumed or app-facing actions that must return structured results
- map guard failures into action-family error codes such as:
  - `UNAUTHENTICATED`
  - `FORBIDDEN`
  - `PROFILE_INCOMPLETE` when the contract family supports it
- keep user-facing `message` separate from machine-readable `error`

For form actions, adapt these failures into `FormActionResult`.

Raw thrown guard errors are acceptable only inside internal helpers or intermediate layers that are immediately adapted by an outer Server Action or route-handler boundary.

## HTTP route mapping

For route handlers in `app/api/**`:

- auth failures should map to HTTP semantics first
- prefer:
  - 401 for unauthenticated
  - 403 for forbidden
  - route-specific 4xx/5xx responses for other failures
- keep the JSON body route-specific; do not assume `FormActionResult` is the right HTTP body shape

## Validation and unexpected failures

- Validation failures belong in the boundary contract for the caller:
  - `fieldErrors` and `message` for forms
  - route-specific 400-class responses for HTTP routes
- Unexpected failures should not erase classification when the caller depends on it.
- Avoid silently collapsing all server failures into one generic message if the boundary needs a stable machine-readable code.

## Legacy or exception

- Older actions may hand-map auth failures without using `lib/auth/action-wrapper.ts`.
- Preserve behavior for migration-sensitive surfaces unless a coordinated migration is explicitly planned.

## Coordinated migration only

- Expanding or changing error-code vocabularies shared by multiple consumers
- Switching a route family from HTTP status-led handling to action-result-led handling
- Changing profile-incomplete semantics across action families
