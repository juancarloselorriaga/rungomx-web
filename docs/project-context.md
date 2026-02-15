# Project Context (AI + Humans)

This repo is a Next.js (App Router) web app for a running events platform. This file captures the "don't-miss" context that matters when implementing new features, especially around events creation.

## Stack Snapshot

- Next.js `16.0.10`, React `19.2.1`, TypeScript
- Drizzle ORM + Neon serverless Postgres (`db/schema.ts` is the DB source of truth)
- Server actions + Zod validation live under `lib/**/actions.ts`
- i18n via `next-intl` (routes are under `app/[locale]/...`)

## Events Domain Model (critical)

- Dashboard routes use `eventId` but it is actually an **event edition id**: `event_editions.id`.
- A public-facing event is the combination of:
  - `event_series` (org-scoped; required: `organizationId`, `name`, `slug`, `sportType`)
  - `event_editions` (draft/publish lifecycle; many nullable fields)
  - `event_distances` + `pricing_tiers` (required before publish)

## Existing Create Flow (baseline to extend, not replace)

- Create page: `app/[locale]/(protected)/dashboard/events/new/page.tsx`
- Wizard form: `app/[locale]/(protected)/dashboard/events/new/create-event-form.tsx`
- After creation: redirects to `app/[locale]/(protected)/dashboard/events/[eventId]/settings/page.tsx` with `?wizard=1`

## Publish Preconditions (server-enforced)

- Publishing is done via `lib/events/editions/actions.ts` `updateEventVisibility`.
- Transitioning to `published` fails unless:
  - the edition has at least one distance (`MISSING_DISTANCE`)
  - every distance has at least one pricing tier (`MISSING_PRICING`)
- Permission for publish is org role `canPublishEvents` (owners/admins), unless internal staff (`canManageEvents`).

## Permissions Pattern

- Use `checkEventsAccess(authContext)` for organizer dashboard access (`lib/events/shared/action-helpers.ts`).
- For org-scoped permissions, use `lib/organizations/permissions.ts` (`requireOrgPermission`, `canUserAccessSeries`, etc.).
- Internal staff permission bypass is via `authContext.permissions.canManageEvents`.

## Notes For An LLM-Assisted Event Creation Wizard

- The safest way to persist "draft" state is to create a real `event_editions` row with `visibility = draft` once minimum required fields are confirmed, then update via existing server actions (keeps validation/audit consistent).
- If we need a "messy start" before org/series is known, add a session table for conversation + partial JSON draft, then materialize to series/edition later.
- Always keep a fallback path: existing settings pages are the canonical editor surfaces.
