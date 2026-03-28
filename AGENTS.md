# Project Agents Guide

## Purpose

This repository hosts the RunGoMX web platform built with a server-first Next.js App Router architecture. This guide is the OpenCode memory entrypoint for navigating canonical standards, preserving invariants, and making safe, auditable changes.

## Architecture summary

- Next.js App Router is the top-level structure for route composition, data loading, and UI boundaries.
- Server Actions are the mutation entrypoint and must remain the boundary where writes are initiated.
- Domain modules live under `lib/` and own core business logic; UI layers should orchestrate, not re-implement.
- Proxy and API boundaries enforce authentication/authorization and must remain the security edge.
- Pro feature enforcement is centralized and should remain server-side.
- Typed `FormActionResult` is the contract for action outcomes and must remain stable for callers.

## Startup reading policy

`AGENTS.md` is the universal entrypoint. After initial classification, choose one of the two startup paths below.

### Lightweight path

Use the lightweight path only when the task is limited to guidance-only, docs-only, classification-only, or guidance-review work with no runtime, product-behavior, auth, contract, policy, or cross-module impact.

- Use `prompts/standards/README.md` only as the discovery layer.
- Load `prompts/meta/ai-guidance-governance.md` when the task touches AI guidance surfaces such as `AGENTS.md`, `prompts/**`, `.opencode/**`, `.claude/**`, `opencode*.json`, or `PROJECT_CONTEXT.md`.
- Load additional scoped standards only when the request clearly touches them.

### Full baseline path

Use the full baseline path for any implementation, runtime, policy-sensitive, auth-sensitive, contract-sensitive, or cross-module work.

Read and follow these canonical standards in this order:

1. `prompts/standards/nextjs-component-implementation.md`
2. `prompts/standards/nextjs-caching-index.md`
3. `prompts/standards/forms-implementation.md`
4. `prompts/standards/e2e-testing.md`
5. `prompts/standards/test-reliability.md`
6. `prompts/auth-stack/roles-agent-guide.md`

These standards take precedence over agent heuristics or local assumptions.

After the full baseline reads, use `prompts/standards/README.md` to discover and load task-relevant standards by scope instead of treating every design, copy, or loading policy as a universal startup read.

If uncertain, use the full baseline path.

## Stable public boundaries

Treat the following as stable facades:

- `lib/events/results/actions.ts`
- `lib/events/group-upload/actions.ts`
- `app/actions/billing-admin.ts`
- `registration-flow.tsx`
- `app/api/**`

Stable boundaries are consumed by multiple modules, tests, and external flows; preserve signatures and behavior unless a coordinated, explicit migration is required.

## Mutation architecture

- Server Actions are the mutation entrypoint.
- `lib/` contains reusable domain logic for mutations, orchestration, and policy.
- `db/schema.ts` is the source of truth for persistent data structure.

## Safety rules

- Prefer extending existing modules over introducing new patterns.
- Preserve server/client component boundaries.
- Avoid introducing global state libraries unless already standardized.
- Respect proxy-based auth boundaries.
- Never move security logic to the client layer.

## Testing contract

- `pnpm test:ci:isolated` is the release-level green signal.
- Partial validation is not accepted for completion claims.
- Database tests must respect foreign-key cleanup ordering.

## Output expectations for agents

Agents should always:

- Explain architectural fit for each proposed change.
- Identify boundary, security, and regression risks.
- Avoid speculative refactors outside task scope.
- Preserve established invariants and public contracts.

## Documentation

Use Context7 when you need to validate framework, library, API, or setup/configuration documentation before relying on external guidance in implementation work.
