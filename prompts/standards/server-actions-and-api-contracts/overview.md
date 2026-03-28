---
title: Server Actions and API Contracts Overview
scope: Canonical mutation boundary model, ownership, and approved vs legacy contract surfaces.
when_to_load: When adding or reviewing mutations, deciding import surfaces, or explaining how app/actions, lib/, and app/api relate.
keywords:
  - mutation boundary
  - server actions
  - route handlers
  - lib ownership
  - client imports
  - legacy compatibility
surfaces:
  - AGENTS.md
  - app/actions/*
  - app/api/**
  - lib/**
  - lib/forms/use-form.ts
pair_with:
  - prompts/standards/server-actions-and-api-contracts/contract-families.md
  - prompts/standards/server-actions-and-api-contracts/server-actions-vs-route-handlers.md
  - prompts/standards/forms-implementation.md
owner: web-platform
---

# Server Actions and API Contracts Overview

This family defines the canonical mutation boundary model for the app.

## Approved default

- `app/actions/*` is the default app-facing Server Action boundary for product mutations.
- `lib/` owns reusable domain logic, orchestration, and policy. It is not the default client import surface.
- `app/api/**` is the HTTP contract boundary. Use it when the caller needs an HTTP request/response contract rather than a direct Server Action call.
- Keep Server Actions as the mutation entrypoint for app-facing writes, consistent with `AGENTS.md`.

## Boundary ownership

- **Server Components** load data and pass prepared props down, per `prompts/standards/nextjs-component-implementation.md`.
- **Client Components** should call Server Actions exposed from `app/actions/*` when they need app-local mutations.
- **Domain modules in `lib/`** should hold validation helpers, workflows, policy, and shared mutation logic that can be invoked by Server Actions or route handlers.
- Route handlers in `app/api/**` own transport details such as HTTP methods, request parsing, status codes, upload handshakes, and third-party webhook-style interactions.

## Legacy or exception surfaces

- Direct client imports from `@/lib/**/actions` are **legacy compatibility surfaces**, not the preferred default for new work.
- Some stable facades listed in `AGENTS.md` remain migration-sensitive public surfaces and cannot be casually rehomed or reshaped.
- The profile-picture flow is an explicit split-flow exception: `app/api/profile-picture/route.ts` handles the upload HTTP flow, while `app/actions/profile-picture.ts` confirms app-facing mutation and session refresh.

## Coordinated migration only

The following changes require deliberate migration planning, not opportunistic cleanup:

- Moving existing consumers from stable facades to new entrypoints.
- Changing the shape of `FormActionResult` in `lib/forms/types.ts`.
- Changing HTTP response envelopes in `app/api/**` that external or cross-module callers rely on.
- Moving current legacy `lib/**/actions.ts` client imports without updating all callers and tests together.

## Client-boundary rule

Per `prompts/standards/nextjs-component-implementation.md`, the entire transitive import graph of a Client Component becomes client-reachable. That means:

- Prefer importing mutations from `app/actions/*` in client code.
- Do not treat `lib/` as a general-purpose client boundary just because some legacy action modules are currently imported there.
- If domain types or constants are needed in client code, extract or reuse boundary-safe modules rather than pulling server-only dependencies across the boundary.

## Form-specific note

`FormActionResult` is the canonical form-facing contract from `lib/forms/types.ts`, but current `lib/forms/use-form.ts` has important limitations:

- only the first message per field is surfaced
- only keys present in submitted values are mapped into `form.errors`

Keep those constraints visible in form guidance and do not silently assume richer field error support.
