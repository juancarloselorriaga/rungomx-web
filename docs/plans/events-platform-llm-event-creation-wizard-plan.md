# Events Platform — LLM-Assisted Event Creation Wizard (Conversational + Schema-Backed)

Owner: TBD  
Status: DISCOVERY (prototype spec)  
Context: Next.js (App Router) on Vercel; Drizzle + Neon Postgres

## Goal

Prototype a new event creation experience that feels conversational and adaptive, but always produces valid structured data in our existing events schema.

Intent: "structured data out, magical experience in".

## Non-goals (for this plan)

- Replace or delete the existing event editor pages.
- Auto-publish events without explicit organizer confirmation.
- Automate legally/financially sensitive policies (refunds/waivers/transfers) beyond guided data entry.
- Solve model selection, cost controls, or provider abstraction long-term (prototype-first).

## Current Codebase Snapshot (important constraints)

### Stack

- Next.js `16.0.10`, React `19.2.1`
- TypeScript + Zod validation (server actions)
- Drizzle ORM (`drizzle-orm`) against Neon serverless Postgres (`@neondatabase/serverless`)
- i18n via `next-intl`
- Organizer access controls: role/permission gates + org membership permissions + audit logs

### Event Domain Model (IMPORTANT)

In this repo, "an event" is not a single table/object.

- Series: `event_series`
  - Required: `organizationId`, `name`, `slug`, `sportType`
  - Slug uniqueness is scoped to organization: (`organizationId`, `slug`) unique
- Edition: `event_editions`
  - This is what dashboard routes call `eventId` (it is `event_editions.id`)
  - Required: `seriesId`, `editionLabel`, `slug`, `publicCode`
  - Many fields are nullable and can support partial drafts
  - `visibility` defaults to `draft`
- Distances: `event_distances`
  - Required: `editionId`, `label` (plus initial price via `pricing_tiers` at creation time)
- Pricing tiers: `pricing_tiers`
  - At least one tier per distance is required to publish (see guardrails below)

### Existing Event Creation Flow (baseline UX)

- Create page: `/dashboard/events/new`
  - Client wizard: `app/[locale]/(protected)/dashboard/events/new/create-event-form.tsx`
  - Creates: organization (optional) -> series (optional) -> edition (always)
  - Redirects to: `/dashboard/events/[eventId]/settings?wizard=1`
- Settings page already supports a light "wizard mode" banner and can prompt adding the first distance.

### Publish Guardrails Already Enforced Server-Side

Publishing is not just a UI toggle; server action enforces preconditions:

- When transitioning to `visibility = published`, `updateEventVisibility` rejects if:
  - there are zero distances for the edition (`MISSING_DISTANCE`)
  - any distance has zero pricing tiers (`MISSING_PRICING`)
- Publishing requires org permission `canPublishEvents` (owners/admins), unless internal staff (`canManageEvents`).

## Product Idea (what we are exploring)

We want a creation flow where organizers can start messy and natural (chat-like), while the system incrementally builds a structured draft behind the scenes.

Key mental model:

- The schema remains the source of truth.
- The LLM is a translator between natural language and structured fields.
- Users can provide multiple data points at once; we parse and apply updates.
- Validation happens inline ("You said March 2; that's a Monday. Is that intended?").
- The UI is a hybrid: streamed assistant text plus small interactive "UI intents".
- The experience must degrade gracefully to existing compact forms/editors.

## Proposed UX Direction: Hybrid Chat + Wizard Components

### Primary Interaction

- Assistant response streams (ChatGPT-like).
- Assistant can emit "UI intents" that render interactive controls:
  - select organization
  - select sport type
  - choose existing series vs create new series
  - date picker for `startsAt`/`endsAt`
  - location picker (existing Mapbox-based component)
  - distances builder (label + distance + price)
  - confirmation prompts (publish, policy changes, registration windows)
- UI intents are shortcuts; the user can ignore them and type freeform.

### Layout Option (recommended for prototype)

Two-pane:

- Left: conversation + prompts + quick actions
- Right: live-updating draft preview (editable), plus a "Show remaining fields" mini-form fallback

## Draft Mental Model (maps to existing schema)

Define an internal `EventDraft` aggregation shape (not necessarily persisted 1:1):

- `organizationId?`
- `seriesId?`
- `editionId?` (becomes the canonical "eventId" for dashboard routes)
- `series`: `{ name, slug, sportType }`
- `edition`: `{ editionLabel, slug, visibility, startsAt, endsAt, timezone, locationDisplay, city, state, country, latitude, longitude, externalUrl, description, registrationOpensAt, registrationClosesAt }`
- `distances[]`: `{ label, distanceValue, distanceUnit, kind, terrain, isVirtual, capacity, capacityScope, priceCents, currency }`
- optional future extensions: policies, waivers, FAQ, website content blocks

Note: the canonical state should be the DB tables + existing server actions; this draft object can be a derived view.

## Persistence Options (decide for MVP)

### Option A (DB-backed early, preferred)

Create real entities as soon as we know the minimum required data:

1. Choose (or create) `organization`
2. Choose (or create) `event_series` (needs `name`, `slug`, `sportType`)
3. Create `event_editions` draft (needs `editionLabel`, `slug`; other fields nullable)

Then apply subsequent updates directly via existing server actions:

- `updateEventEdition` for edition fields
- `createDistance` / `updateDistance` / `updateDistancePrice` for distances + prices
- `updateEventVisibility` for publish/unpublish with enforced preconditions

Pros:

- "Schema is source of truth" stays true from early on
- We get audit logs for most changes automatically
- Easy fallback to existing editor pages at any time

Cons:

- User must pick org/series relatively early (or we need a temporary holding draft)

### Option B (Session-first, DB later)

Persist a wizard session (JSON draft + messages) before creating DB entities, and only materialize series/edition when user confirms "Create draft".

Pros: truer "messy start" without forcing early org/series decisions  
Cons: more glue code and one-time "materialize draft" complexity

## Conversation History + Patch Audit

We already have `audit_logs` for persisted schema changes (many event actions create audit entries).

To support resumable conversational creation and "what happened" tracing, add a dedicated wizard session store:

- `event_creation_sessions` (or similar): owner user, org/series/edition refs (nullable), status, createdAt/updatedAt
- `event_creation_messages`: sessionId, role, text, createdAt
- optional `event_creation_events`: structured log of applied proposals (patch/intents), validation errors, and resulting entity IDs

Rule: never rely on model output alone; all writes go through validation and authorization.

## Backend Architecture (conceptual, not prescriptive)

### Streaming endpoint

Add an authenticated endpoint (route handler) that supports streaming:

- `POST /api/events/ai-wizard`
- Streaming format: Vercel AI SDK v6 UI message stream protocol (server uses `createUIMessageStreamResponse`; client uses `useChat`).
- Stream parts (suggested):
  - `text` (assistant content chunks)
  - `data-ui-intent` (UI intents to render)
  - `data-event-patch` (structured update proposal)
  - `data-apply-result` (what was persisted, validation errors)
  - `data-draft-snapshot` (optional current aggregated draft)

### Applying updates

Apply proposed changes by calling existing server actions (or underlying shared functions), so we reuse:

- Zod validation
- permission checks (`checkEventsAccess`, org permission matrix)
- audit logs
- cache revalidation tags

## Guardrails / Principles (hard requirements)

- The model can propose values; the system enforces validity.
- High-impact actions require explicit confirmation:
  - publishing (`visibility = published`)
  - registration windows (`registrationOpensAt`, `registrationClosesAt`)
  - policies (refund/transfer/deferral), waivers
  - any future payment setup
- Prefer "next best question" based on missing fields, but allow users to dump info upfront.
- Always provide a fallback: "Show remaining fields" mini-form and deep links to existing editor pages.

## MVP Slice (smallest testable version)

1. User starts with freeform prompt: "Tell me about your event".
2. Wizard extracts and confirms the core:
  - org selection (existing orgs list)
  - series name + sport type (existing series selection allowed)
  - edition label + date + location
3. Wizard creates a draft edition (`visibility = draft`) once minimum required fields are confirmed.
4. Wizard collects at least one distance with an initial price (required before publish).
5. Optional: generate a first draft of the event description after core fields exist.
6. Wizard offers "Publish" only when publish preconditions are met and permission allows it; otherwise explains what is missing.

## Open Questions (BA checklist)

- Who is the primary persona for this wizard?
  - brand-new organizer vs returning organizer with existing series/templates
- Should the wizard auto-create series/edition after extraction, or wait for explicit "Create draft"?
- Locale and language: which language does the wizard speak by default, and how does it relate to `primaryLocale` / website content locales?
- Time handling: do we ask for start time or only date? How do we choose `timezone`?
- Slugs: how aggressively do we auto-generate and when do we confirm? How do we handle collisions?
- Resumability: should a partially complete session be resumable across devices/users (org members), or private to the creator?
- Multi-distance events: do we accept multiple distances in one message, and can we infer units/prices reliably?
- Guardrails UX: how do we present "this requires confirmation" so it feels helpful, not bureaucratic?

## Acceptance Criteria (prototype success)

- An organizer can create a draft event from freeform input, with minimal friction.
- Every persisted update is validated and authorized; errors are shown inline in the conversation.
- Publish is blocked unless distances + pricing exist; wizard clearly explains why.
- The organizer can abandon the chat and finish in existing editor pages without data loss.
- Wizard actions are auditable (existing audit logs + wizard session log).

## Repo Pointers (starting points)

- Baseline create flow:
  - `app/[locale]/(protected)/dashboard/events/new/create-event-form.tsx`
  - `app/[locale]/(protected)/dashboard/events/new/page.tsx`
- Settings + publish enforcement surface:
  - `app/[locale]/(protected)/dashboard/events/[eventId]/settings/event-settings-form.tsx`
  - `lib/events/editions/actions.ts` (`updateEventVisibility`, `createEventEdition`, `updateEventEdition`)
- Distances + initial price (required for publish):
  - `lib/events/distances/actions.ts` (`createDistance`)
  - `db/schema.ts` (`event_distances`, `pricing_tiers`)
- Permissions:
  - `lib/events/shared/action-helpers.ts` (`checkEventsAccess`)
  - `lib/organizations/permissions.ts` (org role matrix, `canPublishEvents`)
- Core schema:
  - `db/schema.ts` (`event_series`, `event_editions`, `event_distances`)
