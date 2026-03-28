---
title: Server Actions and API Contracts Checklist
scope: Review checklist for mutation boundaries, contracts, auth mapping, cache refresh, and regression risk.
when_to_load: When reviewing a PR, making a non-trivial mutation change, or checking whether a new boundary follows repo standards.
keywords:
  - checklist
  - review
  - contracts
  - boundaries
  - auth
  - invalidation
  - tests
surfaces:
  - app/actions/*
  - app/api/**
  - lib/**/actions.ts
  - lib/forms/use-form.ts
pair_with:
  - prompts/standards/test-reliability.md
  - prompts/standards/e2e-testing.md
owner: web-platform
---

# Server Actions and API Contracts Checklist

- [ ] **Boundary choice:** `app/actions/*` is used for app-facing mutations unless an HTTP contract is required.
- [ ] **HTTP choice:** `app/api/**` is used only when the flow truly needs route-handler semantics.
- [ ] **Domain ownership:** reusable business logic lives in `lib/`, but `lib/` is not being treated as the new default client import surface.
- [ ] **Contract family:** the boundary uses the right contract family (`FormActionResult`, domain `ActionResult`, or HTTP route envelope).
- [ ] **Form compatibility:** form-facing actions respect current `lib/forms/use-form.ts` limitations.
- [ ] **Auth enforcement:** auth and authorization are enforced server-side using `lib/auth/guards.ts` and, where appropriate, `lib/auth/action-wrapper.ts`.
- [ ] **Error mapping:** machine-readable codes and user-facing messages are separated.
- [ ] **Cache behavior:** mutated data is invalidated or refreshed according to `prompts/standards/nextjs-caching-index.md` and `lib/next-cache.ts` patterns.
- [ ] **Session behavior:** auth-sensitive mutations refresh session-visible state when required.
- [ ] **Stable facades:** migration-sensitive surfaces from `AGENTS.md` are preserved or explicitly called out for coordinated migration.
- [ ] **Legacy labeling:** any continued direct client import from `@/lib/**/actions` is documented as legacy compatibility, not blessed as the new default.
- [ ] **Tests:** affected unit, integration, and e2e coverage is updated or intentionally preserved, following `prompts/standards/test-reliability.md` and `prompts/standards/e2e-testing.md`.
