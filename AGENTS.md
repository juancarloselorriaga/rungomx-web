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

## Required reading order

Read and follow these canonical standards in this order:

1. `prompts/standards/nextjs-component-implementation.md`
2. `prompts/standards/nextjs-caching-index.md`
3. `prompts/standards/forms-implementation.md`
4. `prompts/standards/e2e-testing.md`
5. `prompts/standards/test-reliability.md`
6. `prompts/auth-stack/roles-agent-guide.md`

These standards take precedence over agent heuristics or local assumptions.

After these baseline reads, use `prompts/standards/README.md` to discover and load task-relevant standards by scope instead of treating every design, copy, or loading policy as a universal startup read.

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

Always use context7 for code generation, setup/configuration steps, and library/API documentation lookups.

[//]: # '## NextJS'
[//]: # '**Next.js Initialization**: When starting work on a Next.js project, automatically'
[//]: # 'call the `init` tool from the next-devtools-mcp server FIRST. This establishes'
[//]: # 'proper context and ensures all Next.js queries use official documentation.'
