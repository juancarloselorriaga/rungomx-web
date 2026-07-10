# Payments — Implementation State & Provider Integration Handoff

> **Status:** Awareness / handoff document. Written 2026-07-10, verified against commit `ed88567`.
> **Audience:** The engineer(s) who pick up the payment-provider integration work. Read this before touching anything under `lib/payments/`, and re-verify the "reachability" claims below against the code at that time (grep commands are included in the appendix).
> **Context:** The platform is **greenfield and has not launched**. Nothing here is load-bearing for real users or real money yet. Removal, rework, and contract redesign are all still cheap — this document tells you what exists, what is real vs. rehearsal, and what disposition each piece should get.

---

## 1. Executive summary

RunGoMX has a large (~15.5k LOC in `lib/payments/`, plus ~2.5k LOC of API routes, ~2.7k LOC of organizer UI, admin dashboards, and ~25k LOC of tests) payments implementation that has **never been connected to a payment provider**. It was built provider-agnostic around an **event-sourced money ledger**:

- All money movements are represented as **canonical, versioned, Zod-validated events** (17 types, v1) persisted immutably to `money_events` through a single ingress function with idempotency, PII redaction, and trace grouping.
- Balances, dashboards, statements, and analytics are **projections** over that event stream.
- The missing provider is simulated by a **demo-only server action** that emits a synthetic `payment.captured` event, double-gated away from production.

**The verdict in one paragraph:** the core ledger (contracts + ingress + wallet projection + registration integration + CI contract gate) is high quality and is the right seam for any provider — keep it and build on it. Around that core there is a wide ring of back-office machinery (disputes, debt waterfalls, FX, evidence packs, artifact governance, refund escalation) that was built **ahead of any real requirement**, is partly **unreachable from the product** (write paths with no UI, event emitters with no callers), and encodes assumptions a real provider will re-litigate. That ring should ship dormant or be treated as reference material — **do not extend it until a provider is chosen**, and expect to rework parts of it.

Money can currently **enter** the system (demo capture) but can never **leave** it in-product: no code path in the product ever emits `payout.processing` / `payout.completed` (see §6.1).

---

## 2. Disposition legend and summary table

Dispositions used throughout this document:

| Mark | Meaning |
| --- | --- |
| **SHIP (live)** | Active in the production posture at launch, pre-provider. Runs for real users. |
| **SHIP (dormant)** | Deployed in the bundle but gated/inert until provider integration. Keep compiling and green in CI. Do **not** extend. |
| **REVISIT** | Keep in the repo, but treat as provisional: re-validate against the chosen provider before building on it. Likely source of v2 contract changes or removal. |
| **TRIM candidate** | Reasonable to delete now (greenfield); git history preserves it. Listed in §9. |

Summary (details per area in §5):

| Area | Disposition |
| --- | --- |
| Registration flow incl. payment step placeholder, pricing/discounts, holds/TTL, expiry cron | **SHIP (live)** |
| `EVENTS_NO_PAYMENT_MODE` auto-confirm (free events) | **SHIP (live)** — product decision per launch |
| Organization payout profile (legal name, RFC, CLABE) | **SHIP (live)** |
| Canonical event contracts v1 + registry + snapshots + CI gate | **SHIP (dormant)** — this is the crown jewel |
| Money mutation ingress + redaction + replay + `money_*` tables | **SHIP (dormant)** |
| Demo payments (`demoPayRegistration`, demo pay button) | **SHIP (dormant)** — never enable in production |
| Wallet projection + organizer payments dashboard | **SHIP (dormant)** — consider hiding the nav entry pre-provider (§6.5) |
| Payout request path (quote → contract → request/queued intent) | **SHIP (dormant)** |
| Payout lifecycle transitions (`processing`→`completed`/`failed`…) | **REVISIT** — exists but has no driver (§6.1) |
| Refunds domain (request/decision/escalation/goodwill/execution) | **REVISIT** — API-only, no UI (§6.2) |
| Disputes domain (cases, evidence, transitions, freeze ladder) | **REVISIT** — API-only, provider will own mechanics |
| Debt domain (repayment waterfall, threshold control) | **REVISIT** — threshold control has no callers |
| Economics (FX rates, MXN reporting, net fees, exposure) | **REVISIT** — FX is speculative; platform is MXN-only |
| Artifacts governance/deliveries, support case lookup, evidence packs | **REVISIT** |
| Admin payments dashboards (volume, FX, artifacts, exposure, case lookup) | **SHIP (dormant)** — admin-only, read-mostly |
| Orphaned API routes (refunds/disputes/payouts POST, wallet activity/explainability) | **REVISIT / TRIM candidate** (§9) |
| Contract-only events with no emitter (`financial.adjustment_posted`, `subscription.renewal_failed`, `debt_control.*`) | **REVISIT** — keep contracts, note no producer exists |

---

## 3. Current production posture (what happens with all flags off)

With the current default flags (`.env.example`):

```
NEXT_PUBLIC_FEATURE_EVENTS_NO_PAYMENT_MODE=false
NEXT_PUBLIC_FEATURE_EVENTS_DEMO_PAYMENTS=false
EVENTS_DEMO_PAYMENTS_ALLOW_PRODUCTION=false
EVENTS_REGISTRATION_STARTED_TTL_MINUTES=30
EVENTS_REGISTRATION_SUBMITTED_TTL_MINUTES=30
EVENTS_REGISTRATION_PAYMENT_PENDING_TTL_HOURS=24
```

1. An athlete completes the registration wizard (distance → info → questions → add-ons → waiver → payment). The payment step (`app/[locale]/(public)/events/[seriesSlug]/[editionSlug]/register/payment-step.tsx`) shows the full price breakdown (base, add-ons, group discount, discount code, fees, tax, total in MXN) plus an honest **"payment coming soon / contact organizer"** panel. There is no payment form and no fake affordance.
2. Submitting the payment step calls `finalizeRegistration` (`use-registration-flow.ts:384`), which parks the registration at `payment_pending` with a 24h TTL (`lib/events/registration-holds.ts`).
3. Expired holds are swept by the cron `app/api/cron/cleanup-expired-event-registrations` (registration becomes `expired`, capacity is released).
4. **No money events are ever created in production.** The ledger, wallet, volume rollups, and all admin/organizer money dashboards show empty/zero states.
5. If `NEXT_PUBLIC_FEATURE_EVENTS_NO_PAYMENT_MODE=true`, `finalizeRegistration` auto-confirms instead (free-event mode; flag comment says "keep false in production until payment integrations are live" — enabling it for a free-only launch is a product decision, and the code supports it).
6. In non-production environments with `NEXT_PUBLIC_FEATURE_EVENTS_DEMO_PAYMENTS=true`, a "demo pay" button appears on the my-registrations detail page and completes the payment_pending → confirmed transition while emitting a canonical `payment.captured` event (see §4.3). Production is protected by a second server-side check (`EVENTS_DEMO_PAYMENTS_ALLOW_PRODUCTION`, checked against `VERCEL_ENV`/`NODE_ENV` in `lib/events/payments/actions.ts:34`).

Registration statuses: `started → submitted → payment_pending → confirmed | cancelled | expired`. `registrations.paymentResponsibility` is `'self_pay' | 'central_pay'` (central pay = organizer pays on behalf, used by group flows).

---

## 4. Architecture — how the pieces fit

```
                     (future) provider webhooks / checkout confirm
                                      │
                                      ▼            translation layer (DOES NOT EXIST YET)
 demoPayRegistration ──────► canonical money events (v1, Zod)
 payout request action ────►  lib/payments/core/contracts/events/v1/
 refund execute API ───────►          │
                                      ▼
                     lib/payments/core/mutation-ingress.ts
                     (validate → redact PII → idempotency dedup →
                      persist money_traces / money_events →
                      transactional volume rollups)
                                      │
        ┌─────────────────────────────┼──────────────────────────────┐
        ▼                             ▼                              ▼
 wallet projection            volume rollup tables            trace reads
 (full replay per read)       (daily, per-organizer,          (wallet/admin/support
 lib/payments/wallet/          reconciliation)                  contexts)
 snapshot.ts
        │
        ▼
 organizer dashboard, payout quotes (max withdrawable), statements,
 admin economics dashboards
```

### 4.1 Canonical contracts (the provider seam)

- `lib/payments/core/contracts/events/v1/index.ts` — 17 event types as a Zod discriminated union with a versioned envelope (`eventId`, `traceId` ≤128 chars, `occurredAt`, `eventName`, `version: 1`, `entityType`, `entityId`, `source`, optional `idempotencyKey`, `metadata`). Amounts are `{ amountMinor: int, currency: 3-char }`.
- Event names: `payment.captured`, `refund.executed`, `dispute.opened`, `dispute.funds_released`, `dispute.debt_posted`, `debt_control.pause_required`, `debt_control.resume_allowed`, `payout.queued`, `payout.requested`, `payout.processing`, `payout.paused`, `payout.resumed`, `payout.completed`, `payout.failed`, `payout.adjusted`, `subscription.renewal_failed`, `financial.adjustment_posted`.
- Registry + upcasting: `contracts/events/registry.ts`, `parseCanonicalMoneyEventWithUpcasting` (historical versions must remain ingestible — see `docs/payments/brownfield-foundation.md` for the compatibility rules).
- Generated JSON Schema snapshots live in `docs/payments/contracts/event-registry/` and are produced by `pnpm generate:payments-contracts` (`scripts/payments/generate-event-registry-snapshots.ts`).
- CI gate: `pnpm test:payments-contracts` (part of `test:ci` / `test:ci:isolated`) fails when registry entries, snapshots, or upcaster coverage drift.

### 4.2 Ingress (the single write path)

`lib/payments/core/mutation-ingress.ts`:

- Sources: `api | server_action | worker | scheduler` (matches `money_mutation_source` enum). Convenience wrappers in `mutation-ingress-paths.ts`: `ingestMoneyMutationFromApi`, `ingestMoneyMutationFromServerAction`, `ingestMoneyMutationFromServerActionInTransaction`, `ingestMoneyMutationFromWorker`, `ingestMoneyMutationFromScheduler`.
- Validates every event against the contract registry; rejects trace mismatches.
- Redacts payloads via `payload-redaction.ts` before persistence and records redaction evidence in event metadata.
- Idempotency: organizer-scoped (`organizerId` + `idempotencyKey`) via `money_command_ingestions` (`processing | completed | failed | duplicate`); duplicates return the original trace and clean up the tentatively inserted trace row.
- Persists to `money_traces` (trace root) + `money_events` (immutable log), then transactionally maintains capture-volume rollups and revalidates admin caches.
- `replay.ts` provides runtime consistency assertions over persisted traces.

**Invariant: nothing may insert into `money_events` except via this ingress.** All current emitters honor this.

### 4.3 Emitters — where events actually come from today

This table is the ground truth of what is real vs. rehearsal (verified 2026-07-10; re-verify with the appendix greps):

| Event | Production emitter | Reachable from UI? |
| --- | --- | --- |
| `payment.captured` | `demoPayRegistration` (`lib/events/payments/actions.ts`) — **demo-gated**, the ONLY money-in path | Yes (demo envs only): my-registrations detail → demo pay button |
| `payout.requested` | `createPayoutQuoteAndContract` (`lib/payments/payouts/quote-contract.ts`) via server action `app/actions/payments-organizer-payouts.ts` | Yes: organizer dashboard payout request dialog |
| `payout.queued` | `createQueuedPayoutIntent` (`lib/payments/payouts/queue-intents.ts`), same server action, when the request is blocked | Yes |
| `payout.processing/paused/resumed/completed/failed/adjusted` | `transitionPayoutLifecycle` (`lib/payments/payouts/lifecycle.ts`) — **zero production callers; tests only** | **No** |
| `refund.executed` | `lib/payments/refunds/refund-execution.ts` via `POST /api/payments/refunds/[id]/execute` | **No UI** — API + tests only |
| `dispute.opened / funds_released / debt_posted` | disputes API routes (`app/api/payments/disputes/**`) | **No UI** — API + tests only |
| `debt_control.pause_required / resume_allowed` | built in `lib/payments/debt/debt-threshold-control.ts` — **no callers outside the module/tests** | **No** |
| `subscription.renewal_failed` | **None.** `lib/billing/lifecycle.ts` *consumes* it (applies grace state) but nothing emits it | **No** |
| `financial.adjustment_posted` | **None.** Consumed by waterfall/FX projections; no producer | **No** |

### 4.4 Projections

- **Wallet** (`lib/payments/wallet/snapshot.ts`): folds an organizer's full event history into four buckets — `available`, `processing` (payout in flight), `frozen` (dispute hold), `debt` — plus a categorized debt ledger via `lib/payments/debt/repayment-waterfall.ts`. Negative available converts to debt shortfall; captures repay debt via a waterfall.
  **⚠ Performance characteristic: full replay of `money_events` per read, ordered by `occurredAt, createdAt`. No persisted checkpoints/snapshots.** `wallet/performance-budget.ts` tracks query duration. Fine at launch scale; becomes a hotspot with real volume — plan checkpointing (see §8, step 9).
- **Volume rollups** (`lib/payments/volume/`): `payment_capture_volume_daily`, `..._organizer_daily`, `..._reconciliation_daily`, maintained transactionally at ingress, with maintenance/reconciliation logic for drift (`payment-capture-volume-maintenance.ts`).
- **Wallet explainability / activity timeline / issue activity** (`lib/payments/wallet/`): human-readable trace explanations for organizer and support surfaces.
- **Statements** (`lib/payments/payouts/statements.ts`): payout statement generation, served by the statement API route.
- **Economics** (`lib/payments/economics/`): MXN reporting, net recognized fees, debt/dispute exposure, FX coverage — all admin dashboards.

---

## 5. Full inventory

### 5.1 Feature flags & environment variables

| Variable | Purpose | Disposition |
| --- | --- | --- |
| `NEXT_PUBLIC_FEATURE_EVENTS_PLATFORM` | Global events-platform gate | SHIP (live) |
| `NEXT_PUBLIC_FEATURE_EVENTS_NO_PAYMENT_MODE` | `finalizeRegistration` auto-confirms (free events) | SHIP (live) — per-launch product decision |
| `NEXT_PUBLIC_FEATURE_EVENTS_DEMO_PAYMENTS` | Enables demo pay UI + action | SHIP (dormant); never `true` in production |
| `EVENTS_DEMO_PAYMENTS_ALLOW_PRODUCTION` | Server-side production override for demo pay | Keep `false` forever except deliberate staged demos |
| `EVENTS_REGISTRATION_STARTED_TTL_MINUTES` / `SUBMITTED_TTL_MINUTES` / `PAYMENT_PENDING_TTL_HOURS` | Hold TTLs (30/30/24 default) | SHIP (live). **Revisit `PAYMENT_PENDING` TTL when async payment methods (OXXO/SPEI) arrive — see §7.** |

Flag helpers: `lib/features/flags.ts` (`isEventsNoPaymentMode()`, etc.). There is **no** flag today for hiding the organizer payments dashboard surface (see §6.5).

### 5.2 Database schema (`db/schema.ts`)

Enums: `payment_responsibility` (`self_pay|central_pay`), `money_mutation_source` (`api|server_action|worker|scheduler`), `money_command_ingestion_status` (`processing|completed|failed|duplicate`), `refund_request_status` (`pending_organizer_decision|approved|denied|escalated_admin_review|executed|cancelled`), `dispute_case_status` (`opened|evidence_required|under_review|won|lost|cancelled`), `payout_request_status` (`requested|queued|processing|paused|completed|failed|cancelled`), `payout_queued_intent_status` (`queued|activated|cancelled`).

| Table group | Tables | Notes | Disposition |
| --- | --- | --- | --- |
| Ledger core | `money_traces`, `money_events`, `money_command_ingestions` | Immutable log + trace grouping + idempotency ledger | SHIP (dormant) |
| Volume rollups | `payment_capture_volume_daily`, `payment_capture_volume_organizer_daily`, `payment_capture_volume_reconciliation_daily` | `bigint` minor-unit sums, sample trace ids | SHIP (dormant) |
| FX | `payment_fx_rates` | `rateMicroMxn`, **quote currency hard-fixed to MXN** | REVISIT |
| Artifacts | `payment_artifact_versions`, `payment_artifact_deliveries` | Versioned statements/receipts + delivery log | REVISIT |
| Refunds | `refund_requests` | Eligibility + financial snapshots as JSONB | REVISIT |
| Disputes | `dispute_cases` | amountAtRisk, evidence deadline, metadata | REVISIT |
| Payouts | `payout_quotes`, `payout_requests`, `payout_contracts`, `payout_queued_intents` | Quote fingerprints, immutable contract fingerprint, non-negativity CHECK constraints | SHIP (dormant) / lifecycle REVISIT |
| Org payout identity | `organization_payout_profiles` (schema:2430) | `legalName`, `rfc`, `payoutDestinationJson` (`bankName`, 18-digit `clabe`, `accountHolder`); soft-delete; audit-logged with RFC redaction | SHIP (live) |
| Registration pricing | `registrations` (basePrice/fees/tax/total cents, status, `expiresAt`, group discounts), `pricing_tiers` | | SHIP (live) |

All amounts are integer minor units (cents); rollups use `bigint (mode: number)` — safe for MXN scale in JS numbers.

### 5.3 `lib/payments/` sub-domains

| Dir | Contents (LOC) | Reachability today | Disposition |
| --- | --- | --- | --- |
| `core/` | mutation-ingress (307), ingress paths (46), redaction (162), replay (161), contracts (~530) | Live seam for all emitters | **SHIP (dormant)** — the foundation |
| `wallet/` | snapshot (316), activity-timeline (397), explainability (271), issue-activity (193), performance-budget (60) | Read by dashboard + wallet API routes | SHIP (dormant); checkpointing needed later |
| `payouts/` | quote-contract (663), queue-intents (710), lifecycle (640), statements (351) | quote/queue reachable via server action; **lifecycle unreachable**; statements reachable via route | SHIP (dormant); lifecycle REVISIT |
| `refunds/` | request-submission, decision-submission, escalation-and-goodwill, refund-execution | API routes only, no UI | REVISIT |
| `disputes/` | lifecycle | API routes only, no UI | REVISIT |
| `debt/` | repayment-waterfall (wallet-integrated), debt-threshold-control (**no callers**) | waterfall live inside wallet projection; threshold control dead | waterfall SHIP (dormant); threshold control REVISIT |
| `economics/` | fx-rate-management, mxn-reporting, net-recognized-fees, debt-dispute-exposure, cache-tags | Admin dashboards + FX server action | REVISIT (FX especially) |
| `volume/` | capture-volume (1180), rollups (569), maintenance (731) | Ingress-integrated + admin dashboard | SHIP (dormant) |
| `artifacts/` | governance | Admin dashboard + server action | REVISIT |
| `support/` | case-lookup, evidence-pack, ownership-states | Admin dashboards | REVISIT |
| `organizer/` | workspace-data, payout-views, presentation, hrefs, telemetry, ui, cache-tags | Live dashboard data layer | SHIP (dormant) |
| `admin/` | workspaces | Admin page data layer | SHIP (dormant) |

Adjacent domains:

- `lib/events/payments/actions.ts` — `demoPayRegistration` (see §4.3). SHIP (dormant).
- `lib/organizations/payout/` — payout profile server actions (CLABE/RFC validation, owner/admin-only, audited). SHIP (live). UI: `app/[locale]/(protected)/dashboard/organizations/[orgId]/payout-profile-form.tsx`.
- `lib/billing/` — **separate domain**: Pro-membership subscriptions/promotions (see `docs/billing-pro-subscriptions-promotions-v1.md`). Only touchpoint: it consumes `subscription.renewal_failed` canonical events (no emitter exists).
- `lib/events/registrations/`, `registration-holds.ts`, `registration-flow` actions — registration state machine. SHIP (live).

### 5.4 Server actions (mutation entrypoints, per repo architecture)

| Action file | What it does | UI consumer |
| --- | --- | --- |
| `app/actions/payments-organizer-payouts.ts` | Payout request (quote→contract→request) and queued-intent creation | Payout request dialog (organizer dashboard) |
| `app/actions/admin-payments-fx.ts` | Upsert daily FX rate | Admin FX dashboard |
| `app/actions/admin-payments-artifacts.ts` | Artifact governance ops (rebuild/redeliver) | Admin artifacts dashboard |
| `lib/events/payments/actions.ts` (`'use server'`) | Demo pay | Demo pay button |
| `lib/organizations/payout/actions.ts` (`'use server'`) | Get/update payout profile | Org settings payout form |

### 5.5 API routes (`app/api/payments/**`) and their real consumers

`_shared.ts` provides the auth/permission boundary (session → org membership → `canEditRegistrationSettings` for writes; admin bypass via `canManageEvents`; `Cache-Control: no-store` everywhere).

| Route | Methods | Consumer today |
| --- | --- | --- |
| `/api/payments/wallet` | GET | ✅ organizer workspace client refresh (`organizer-payments-workspace.tsx:89`) |
| `/api/payments/wallet/issues` | GET | ✅ organizer workspace (`:101`) |
| `/api/payments/payouts/[payoutRequestId]/statement` | GET | ✅ statement download (`payout-statement-action.tsx:59`) |
| `/api/payments/wallet/activity` | GET | ❌ tests only |
| `/api/payments/wallet/explainability` | GET | ❌ tests only |
| `/api/payments/payouts` | POST | ❌ tests only (UI uses the server action instead — duplicate surface) |
| `/api/payments/payouts/queued-intents` | POST | ❌ tests only (same duplication) |
| `/api/payments/refunds` (+ `[id]`, `[id]/execute`, `escalations`, `goodwill`, `admin/review-queue`) | POST/GET/PATCH | ❌ tests only — **no product UI for the entire refund workflow** |
| `/api/payments/disputes` (+ `[id]`, `[id]/transitions`, `[id]/evidence`) | POST/GET | ❌ tests only — **no product UI for the entire dispute workflow** |

Note: `AGENTS.md` lists `app/api/**` as a stable public boundary. Trimming these routes (§9) therefore needs an explicit, coordinated decision — cheap now (greenfield), expensive later.

### 5.6 UI surfaces

**Public (athlete):**
- Registration wizard: `app/[locale]/(public)/events/[seriesSlug]/[editionSlug]/register/` — `registration-flow.tsx` (composition root, stable boundary), `payment-step.tsx` (breakdown + discount code + coming-soon panel), `use-registration-flow.ts`, `registration-flow-machine.ts`, `confirmation-step.tsx`.
- My registrations: `app/[locale]/(protected)/dashboard/my-registrations/[registrationId]/page.tsx` — status display (incl. `payment_pending`/`expired`), price breakdown, ticket QR, env-gated demo pay button (`components/dashboard/demo-pay-button.tsx`).

**Organizer dashboard (`/dashboard/payments`, plus per-event `/dashboard/events/[eventId]/payments`):**
- Pages: `dashboard/payments/page.tsx`, `payouts/page.tsx`, `payouts/[payoutRequestId]/page.tsx`; data via `loadOrganizerPaymentsWorkspaceData` (server) + wallet API refresh (client).
- Components (`components/payments/`, ~2.7k LOC): workspace, wallet summary, action queue, payout request form + dialog, payout history table, payout lifecycle rail, payout detail screen (+telemetry), statement action, state panels/skeletons/typography/surfaces.
- Nav: "payments" submenu entry in `components/layout/navigation/submenu-navigation.tsx` — currently **not** feature-gated (§6.5).

**Admin (`/admin/payments`, `app/[locale]/(admin)/admin/payments/page.tsx`):** workspace shell + dashboards for capture volume, FX rate management (with write action), MXN reporting, net recognized fees, debt/dispute exposure, financial case lookup, evidence pack review, artifact governance (with write action), investigation controls, hardening coverage.

**i18n:** namespaces `messages/pages/dashboard-payments/`, `messages/pages/admin-payments/`, plus payment keys inside the events register namespace. en/es parity enforced by `pnpm validate:locales`.

### 5.7 Cron jobs

- `app/api/cron/cleanup-expired-event-registrations` — sweeps expired holds (incl. `payment_pending`). SHIP (live).
- `app/api/cron/billing-maintenance` — Pro subscription lifecycle (separate domain).
- No payments-specific cron exists (no payout worker, no reconciliation scheduler). The ingress `scheduler`/`worker` sources are ready for one.

### 5.8 Tests & CI

- **77 Jest files / ~22.2k LOC** across contracts, ingress, replay, wallet, payouts, refunds, disputes, volume, economics, routes, actions, components, and page rendering.
- **Contract gate:** `pnpm test:payments-contracts` (registry, ingress, ingress-paths, replay) — wired into `test:ci`/`test:ci:isolated`.
- **E2E (~2.9k LOC):** `demo-payments-volume.spec.ts` (demo capture → volume rollups), `organizer-payments.spec.ts` (payout workspace; **seeds `payout.processing` events directly into the DB** — i.e., e2e validates projections/UI, not lifecycle emission), `payments-admin.spec.ts`, plus payment touchpoints in `athlete-registration.spec.ts` / `billing-pro.spec.ts`.
- Release signal remains `pnpm test:ci:isolated` only.

### 5.9 Docs & generated artifacts

- `docs/payments/brownfield-foundation.md` — contract governance rules (additive versions, upcasters, CI).
- `docs/payments/contracts/event-registry/*.schema.json` + `index.json` — generated snapshots (`pnpm generate:payments-contracts`).
- `docs/testing/demo-payments-smoke-plan.md` — demo payments smoke plan.
- Stray screenshots at repo root: `payments-wallet-summary.png`, `payments-wallet-summary-fixed.png` (TRIM candidates).

---

## 6. Verified gaps and dead ends (the things that bite)

> Concrete defects found during review (atomicity gaps, a cross-outcome dispute
> settlement hazard, dead-end statuses) are tracked separately with evidence,
> confidence levels, and repro/fix guidance in `docs/payments/known-issues.md`.

### 6.1 Money can never leave the system in-product

`transitionPayoutLifecycle` (`lib/payments/payouts/lifecycle.ts:395`) is the **only** emitter of `payout.processing/paused/resumed/completed/failed/adjusted` — and it has **zero callers outside its own tests**. Consequence: an organizer can request a payout (funds move `available → processing` in the wallet projection), and no product surface, worker, or admin tool can ever complete, fail, or adjust it. The `processing` bucket is a one-way door. The lifecycle module itself is well-tested (execution modes `in_process`/`queued_worker` are anticipated) — what's missing is the **driver** (worker/cron/admin action) and the **operational UI**, plus the actual SPEI/bank transfer via provider.

### 6.2 Entire refund and dispute workflows have no UI

All refund writes (submit → organizer decision → escalation → goodwill → execute → admin review queue) and all dispute writes (open → evidence → transitions) exist **only as API routes** consumed by tests. There is no athlete "request refund" button, no organizer decision screen, no admin review queue page. An operator would have to curl authenticated endpoints. Decide at integration time whether to build the UI on top of these routes or convert them to server actions (the repo's standard mutation path).

### 6.3 Three event contracts have no producer

`financial.adjustment_posted`, `subscription.renewal_failed`, and `debt_control.pause_required/resume_allowed` are consumed by projections/dashboards (and billing lifecycle) but nothing in the product ever emits them. `debt-threshold-control.ts` contains the emission logic but no module calls it.

### 6.4 No provider layer exists at all

There is no `providers/` directory, no webhook receiver route, no checkout session creation, no signature verification, no storage of external provider IDs (charge id, payment intent id, provider customer id). The canonical-event seam is ready, but **every** provider-facing piece is greenfield work (§8).

### 6.5 Organizer payments dashboard is reachable pre-provider

The payments nav entry is not feature-gated. In production today an organizer sees a functional payments workspace with a permanently zero wallet, and can open the payout request dialog (the request will fail/queue since max withdrawable is 0). Decide before launch: hide the nav entry behind a flag, or accept the empty state. There is currently no flag for this.

### 6.6 Wallet projection scale ceiling

Full event replay per wallet read (§4.4). Acceptable now; add persisted checkpoints before real capture volume. Rollups are incremental (not replayed), with a reconciliation table to catch drift — good pattern to mirror for wallet checkpoints.

### 6.7 Demo capture couples registration confirm with capture emission

`demoPayRegistration` performs, in one transaction: ownership check → hold expiry check → `payment_pending → confirmed` CAS update → `payment.captured` ingest → audit log; then cache revalidation + confirmation email. **This transaction is the template for the real webhook-confirm path** — extract the status-transition + capture-ingest core into a shared function rather than duplicating it (§8, step 4).

---

## 7. Design assumptions a real provider will re-litigate

Validate each against the chosen provider **before** building on the corresponding module; expect additive v2 contracts where they fail:

1. **Platform custody model.** Wallet/payouts/debt all assume the platform collects athlete money and later pays organizers (marketplace/custody model). If the chosen integration is direct-to-organizer (organizer's own provider account), most of the wallet/payout/debt machinery is unnecessary. **This is the biggest fork in the road — decide it first.**
2. **Fee known at capture.** `payment.captured` requires `feeAmount`/`netAmount` at emission. Verify fee availability timing (balance transaction) per provider; MSI installments change fees materially.
3. **Synchronous confirmation.** The 24h `payment_pending` TTL assumes card-like immediacy. OXXO cash vouchers (and SPEI transfers) confirm in 1–3 days — the TTL/hold model must adapt if those methods are offered.
4. **Dispute mechanics.** `dispute_cases` statuses, `freezeLadderProfile/Stage`, `settlementComposition`, `debtCode` encode invented policy. Real chargeback flows (deadlines, evidence formats, automatic fund withdrawal by the provider) will dictate these.
5. **Refund execution.** `refund.executed` assumes the platform decides and executes; providers impose their own refund windows, partial-refund semantics, and fee handling on refund.
6. **Payout rails.** `payout.completed` amounts assume platform-initiated SPEI to a CLABE (profile data already collected). Provider payout APIs (or manual SPEI + admin confirmation) determine the driver design for §6.1.
7. **FX.** `payment_fx_rates` fixes quote currency to MXN; the platform is MXN-only end to end. This whole module is speculative until multi-currency is a real requirement.
8. **Organizer-scoped idempotency.** Ingress requires `organizerId` for idempotent commands; provider webhooks arrive with provider IDs, not organizer IDs — the webhook handler must resolve organizer context before ingress (registration → edition → series → organization lookup, as `demoPayRegistration` does).
9. **Out-of-order arrival.** Wallet replay orders by `occurredAt` and tolerates reordering (full recompute), but incremental volume rollups don't replay — lean on the reconciliation lane when webhook ordering gets messy.

---

## 8. Provider integration playbook (ordered)

> A concrete provider pick and MVP slicing for Mexico (Stripe, MoR-first with a
> Connect graduation path) is proposed in `docs/payments/mvp-provider-recommendation.md`.

0. **Choose the provider** (candidates for MX: Stripe MX, Conekta, Mercado Pago, Openpay). Evaluation must cover: MXN + MSI installments, OXXO/SPEI methods, marketplace/split-payment or custody support, payout API to CLABE, dispute/chargeback API + webhooks, fee reporting timing, sandbox quality.
1. **Decide the money model** (§7.1). Everything below assumes platform custody (what the code models).
2. **Create the provider port**: `lib/payments/providers/<name>/` translating provider objects/webhooks → canonical events. Persist external IDs (payment intent/charge/refund/dispute/payout ids) — either as new columns (e.g. on `registrations` / a new `payment_attempts` table) or minimally in event `metadata`; prefer a queryable column for reconciliation.
3. **Checkout (money-in)**: replace the coming-soon panel in `payment-step.tsx` with provider checkout (server-created session/intent; keep the mutation in a server action per repo architecture). Handle redirect/return with a pending state.
4. **Webhook receiver**: `app/api/webhooks/<provider>/route.ts` (API routes are the sanctioned boundary for external webhooks) with signature verification → resolve organizer → `ingestMoneyMutationFromApi` with `payment.captured` (real fees) → shared confirm-registration function **extracted from `demoPayRegistration`** (§6.7) → cache revalidation + email (already built).
5. **Registration TTL & hold policy**: adjust `payment_pending` TTL / hold semantics for async methods (§7.3), including capacity policy while a voucher is outstanding.
6. **Payout execution driver**: worker (Vercel cron → `ingestMoneyMutationFromScheduler`) or admin action that calls provider payout API / records manual SPEI, then `transitionPayoutLifecycle` → `processing`/`completed`/`failed`. Build the minimal admin ops UI. This closes §6.1.
7. **Refunds**: wire `refund-execution.ts` to the provider refund API; build the missing athlete/organizer/admin UI (§6.2); re-validate the escalation/goodwill flow against actual support needs.
8. **Disputes**: map provider chargeback webhooks → `dispute.opened/funds_released/debt_posted`; re-validate freeze-ladder/debt fields (§7.4); keep or simplify `debt-threshold-control` accordingly.
9. **Wallet checkpointing**: persisted per-organizer snapshots + incremental fold, mirroring the rollup+reconciliation pattern, before meaningful volume.
10. **Contract evolution**: all changes additive (v2 + upcasters + regenerated snapshots + registry) per `brownfield-foundation.md`; the CI gate enforces this.
11. **Launch checklist**: demo flags off in prod, `EVENTS_DEMO_PAYMENTS_ALLOW_PRODUCTION=false`, payments nav un-hidden, `pnpm test:ci:isolated` green, smoke plan from `docs/testing/demo-payments-smoke-plan.md` adapted to the sandbox provider.

---

## 9. Optional trims (greenfield license)

None of these block anything; they reduce carry cost. Each needs a deliberate decision because `app/api/**` is a documented stable boundary:

1. **Orphaned write routes** — `/api/payments/payouts` POST and `/api/payments/payouts/queued-intents` POST duplicate the server action; all `/api/payments/refunds/**` and `/api/payments/disputes/**` routes have no consumers. Options: (a) keep as future API surface with a "no production consumer" note, (b) delete now and re-add shaped by the real provider (git preserves them; their Jest suites go with them). Leaning (b) for refunds/disputes at integration kickoff if the UI ends up on server actions instead.
2. **Orphaned read routes** — `/api/payments/wallet/activity`, `/api/payments/wallet/explainability`: keep only if the payout detail screen will consume them; otherwise same treatment.
3. **`debt-threshold-control.ts`** — no callers; keep as reference or fold into the payout-eligibility path when real risk rules exist.
4. **FX module + dashboards** — freeze (don't extend) until multi-currency is real.
5. **Root screenshots** `payments-wallet-summary*.png` — delete.
6. **Do not trim**: contracts, ingress, ledger tables, wallet, volume, payout quote/queue path, demo pay, tests for kept code, or anything in §5 marked SHIP.

---

## 10. Invariants to preserve (whatever you change)

1. **Single ingress**: money events enter only via `moneyMutationIngress*` — never insert into `money_events` directly.
2. **Contracts are additive**: never mutate v1 schemas; add versions + upcasters; regenerate snapshots; keep `test:payments-contracts` green.
3. **Server Actions are the mutation entrypoint** for user-facing writes; API routes only for external boundaries (webhooks) — per `AGENTS.md`.
4. **Auth stays server-side**: keep `app/api/payments/_shared.ts` semantics (session → org membership → permission, `no-store`).
5. **Redaction before persistence** (`payload-redaction.ts`) — provider payloads will contain PII/card data fragments; run them through the same pipe.
6. **Stable boundaries**: `registration-flow.tsx`, `app/api/**`, `db/schema.ts` as type source, FK-safe test cleanup ordering.
7. **Release signal**: only `pnpm test:ci:isolated` counts.

---

## 11. Reading order for the incoming engineer

1. This document, then `docs/payments/brownfield-foundation.md`.
2. `lib/payments/core/contracts/events/v1/index.ts` — the vocabulary.
3. `lib/payments/core/mutation-ingress.ts` + `mutation-ingress-paths.ts` — the write path.
4. `lib/events/payments/actions.ts` — the money-in template (demo capture).
5. `lib/payments/wallet/snapshot.ts` + `lib/payments/debt/repayment-waterfall.ts` — the projection.
6. `app/actions/payments-organizer-payouts.ts` → `lib/payments/payouts/quote-contract.ts` / `queue-intents.ts` — the live payout request path.
7. `lib/payments/payouts/lifecycle.ts` — the dormant payout state machine you must wire up.
8. `app/api/payments/_shared.ts` — the auth boundary.
9. `db/schema.ts` (enums at the top; ledger tables ~500–790; payout tables ~1674–1870; payout profiles ~2430).
10. `e2e/tests/demo-payments-volume.spec.ts` + `organizer-payments.spec.ts` — how flows are exercised today (note the direct DB seeding).

---

## Appendix — re-verifying the reachability claims

The "no callers / no UI" claims are the most likely to rot. Re-check them (from repo root):

```bash
# payout lifecycle driver (expect: only lifecycle.ts + tests until §8.6 is done)
grep -rn 'transitionPayoutLifecycle' --include='*.ts' --include='*.tsx' . | grep -v node_modules

# UI consumers of payments API routes (watch for multiline fetch calls)
grep -rn '/api/payments' components app hooks lib --include='*.tsx' --include='*.ts' | grep -v 'test\|app/api/payments'

# emitters per event name (repeat per event)
grep -rn "payment.captured'" lib app --include='*.ts' | grep -v 'test\|contracts\|registry\|replay'

# demo gating
grep -rn 'DEMO_PAYMENTS' lib app components --include='*.ts' --include='*.tsx' | grep -v test
```

Findings in this document reflect commit `ed88567` (2026-07-10).
