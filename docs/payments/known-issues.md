# Payments — Known Issues & Suspected Bugs

> **Status:** Findings register. Written 2026-07-10, verified against commit `ed88567`.
> **Update (2026-07-13):** All findings below (BUG-1..BUG-6, NOTE-7..NOTE-10) are now **RESOLVED** — fixed on a separate branch and rebase-merged into `main` as PR #3 on 2026-07-13. See each finding's **Status** line for the resolving commit(s) on `main`, and the "Resolution status" section near the end for cross-cutting hardening that landed alongside the fixes.
> **Companion to:** `docs/payments/provider-integration-handoff.md` (architecture, reachability map, dispositions).
> **How to use:** Each finding is self-contained — evidence (file:line), a concrete failure scenario, how to verify, and a suggested fix direction — so an agent or engineer can pick one up independently. Confidence describes how sure we are the *defect is real as described*; severity assumes real money flowing (post-provider). Pre-provider, none of these can lose real money (demo mode only), which is exactly why they should be fixed before integration.
>
> Confidence scale: **CONFIRMED** = the failing path was verified by direct code reading; **HIGH** = code verified, failure needs a specific but realistic trigger; **MEDIUM** = behavior verified, but it may be intended design — needs a product/intent decision; **LOW** = edge case or cosmetic.

---

## Priority findings

### BUG-1 — Payout request creation is non-atomic; a crash strands an active request with no ledger movement

- **Status:** RESOLVED (2026-07-13) — quote insert, request insert, contract insert, and the `payout.requested` ingress append now run inside one `db.transaction`, using the new in-transaction ingress wrapper family (`ingestMoneyMutationFromApiInTransaction`), so a mid-sequence failure rolls back cleanly instead of stranding an active request. Fixed by `7918a1c` (`fix(payments): make payout request creation atomic`) on `main`, built on `1a32fdc` (`feat(payments): add in-transaction api and worker ingress wrappers`).
- **Severity:** High (post-provider) · **Confidence:** HIGH (structure confirmed; trigger = failure mid-sequence)
- **Where:** `lib/payments/payouts/quote-contract.ts:534-642` (`createPayoutQuoteAndContract`), key generation at `app/actions/payments-organizer-payouts.ts:88-90`
- **What:** The flow performs four sequential, independently committed writes: quote insert → payout request insert → contract insert → `payout.requested` ledger ingress (`appendPayoutRequestedEvent`, itself a separate transaction). There is no wrapping transaction, even though a transactional ingress variant exists (`moneyMutationIngressInTransaction` — demo pay uses it; this path doesn't).
- **Failure scenarios:**
  1. Crash/error after the request insert but before ingress: an active `payout_requests` row exists (status `requested`), which the partial unique index `payout_requests_active_organizer_unique_idx` uses to **block all future payout requests for that organizer** — while the wallet never moved funds `available → processing` (no `payout.requested` event). Organizer is stuck; no admin tooling exists to repair; fixing requires manual DB surgery.
  2. Crash after the quote insert only: orphan quote row. Retrying with the *same* idempotency key throws `PAYOUT_BASELINE_INCOMPLETE` (quote without request/contract is unrecoverable through that key).
  3. The theoretical same-key self-heal (idempotent replay re-runs the ingress) is never exercised in practice because the server action generates a **fresh random idempotency key per attempt** (`${prefix}:${crypto.randomUUID()}`), so every user retry takes the fresh-create path and hits the active-conflict error from scenario 1.
- **Verify:** DB test that makes the contract insert (or ingress) throw after the request insert commits; assert the organizer's next `createPayoutQuoteAndContract` call fails with an active conflict while `getOrganizerWalletBucketSnapshot` still shows the funds in `available`.
- **Fix direction:** Wrap quote+request+contract+ingress in one `db.transaction` using `ingestMoneyMutationFromServerActionInTransaction`/`moneyMutationIngressInTransaction`; alternatively add a reconciliation sweep that cancels active requests with no matching `payout.requested` event.

### BUG-2 — Dispute settlement can record one outcome in the ledger and the opposite on the case

- **Status:** RESOLVED (2026-07-13) — settlement ingress (freeze release + optional debt posting) and the guarded `dispute_cases` CAS update now run inside one `db.transaction`, so a mid-sequence update failure rolls back the postings instead of stranding them against an unchanged case. The outcome-scoped settlement idempotency key floated in "Fix direction" below was deliberately **not** added: atomicity plus the existing terminal transition map (`won`/`lost`/`cancelled` have no outgoing transitions) already closes the cross-outcome retry race, since a case that reaches an outcome status can never accept a second, opposite-outcome transition. Fixed by `849f8fc` (`fix(payments): make dispute settlement postings and case update atomic`) on `main`.
- **Severity:** High (financial integrity) · **Confidence:** HIGH (paths confirmed; trigger = failed case update followed by cross-outcome retry)
- **Where:** `lib/payments/disputes/lifecycle.ts` — `transitionDisputeCase` (:1098-1173) calls `settleDisputeOutcome` (:474-546) *before* the guarded `dispute_cases` update, non-transactionally; settlement trace/idempotency key is `dispute-settlement:{disputeCaseId}` regardless of outcome (:391).
- **What:** Money events for the outcome (`dispute.funds_released`, and for `lost` also `dispute.debt_posted`) are committed via ingress first. The case-row update afterwards is a compare-and-set on `status = fromStatus`. If that update fails (concurrent transition won the race, transient DB error, crash), the settlement postings stand while the case remains `under_review`.
- **The nasty part:** On retry with the **opposite** outcome (`won` after a failed `lost`, or vice versa), `buildDisputeSettlementEvents` produces different events but the **same traceId and idempotency key**, so ingress deduplicates and silently keeps the *first* outcome's postings while the case row now records the *second* outcome. Concrete result: case says `won`, wallet carries `dispute.debt_posted` debt from the discarded `lost` attempt — the organizer is charged debt for a dispute they won.
- **Verify:** DB test — transition `under_review → lost` with the case update forced to fail (e.g., concurrently flip the status), then transition `under_review → won`; assert wallet debt is non-zero while the case status is `won`.
- **Fix direction:** Make settlement ingress and the case update one transaction (transactional ingress variant exists), and/or include the outcome in the settlement idempotency key (`dispute-settlement:{id}:{outcome}`) plus a guard that refuses to settle when a settlement trace with a different outcome already exists.

### BUG-3 — Dispute intake can freeze funds with no case record; retry double-freezes

- **Status:** RESOLVED (2026-07-13) — the `dispute.opened` ingress append and the `dispute_cases` insert now run inside one `db.transaction`, so an insert failure after ingress rolls back the freeze instead of stranding it with no case to ever resolve it. Fixed by `5901829` (`fix(payments): make dispute intake freeze and case insert atomic`) on `main`.
- **Severity:** Medium-high · **Confidence:** HIGH (structure confirmed; trigger = insert failure after ingress)
- **Where:** `lib/payments/disputes/lifecycle.ts` — `openDisputeCase` (:743-810): `dispute.opened` is ingested (committed, freezing `amountAtRisk` in the wallet) *before* the `dispute_cases` insert; `disputeCaseId` is `randomUUID()` per call (:708).
- **What:** If the case insert fails (`DISPUTE_INTAKE_INSERT_FAILED`, connection drop, constraint), frozen funds exist with **no case to ever resolve them** — there is no compensating release path for an orphan freeze. Retrying mints a *new* disputeCaseId → new trace → a **second** freeze on top of the orphan.
- **Verify:** DB test forcing the insert to fail after ingress; assert `frozenMinor` > 0 with zero dispute_cases rows; call again successfully; assert frozen equals 2× amountAtRisk.
- **Fix direction:** Same transaction for ingress + insert; derive `disputeCaseId` deterministically from the external case reference (post-provider, the provider's dispute id) so retries reuse the same trace.

### BUG-4 — Escalated (non-goodwill) refund requests are undecidable — a status with no exit

- **Status:** RESOLVED (2026-07-13) — added `submitAdminRefundDecision` (CAS-scoped to `escalated_admin_review`, mirroring the organizer decision function's shape) behind a new staff-gated `PATCH /api/payments/refunds/admin/[refundRequestId]/decision` route, giving escalated non-goodwill requests a real approve/deny exit. Fixed by `3e4fc6a` (`feat(payments): add admin decision path for escalated refund requests`) on `main`.
- **Severity:** Medium (operational dead-end) · **Confidence:** CONFIRMED (no code path exists)
- **Where:** `lib/payments/refunds/decision-submission.ts:113` (decision CAS only from `pending_organizer_decision`); `lib/payments/refunds/refund-execution.ts:388-397` (execution only from `approved`, or `escalated_admin_review` *when goodwill*).
- **What:** A refund request that reaches `escalated_admin_review` via expiry escalation (`escalateExpiredRefundRequests`) can never be approved, denied, executed, or cancelled — no function transitions out of that status for non-goodwill requests. The "admin review queue" route can only *list* them. Distinct from the known "no admin UI" gap: this is missing *domain logic*, not just missing UI.
- **Verify:** Grep for transitions out of `escalated_admin_review` (only the goodwill execution branch exists); or DB test: escalate a pending request, then attempt decision (throws `REFUND_REQUEST_NOT_PENDING`) and execution (throws `REFUND_REQUEST_NOT_EXECUTABLE`).
- **Fix direction:** Add an admin decision function (escalated → approved/denied) when building the refund admin surface; until then, don't enable the escalation route in any scheduled job.

### BUG-5 — Queued payout intents can be created but never activate

- **Status:** RESOLVED (2026-07-13) — `activateQueuedPayoutIntent` now has real callers: `transitionPayoutLifecycle` invokes it as a best-effort hook right after a blocking payout request reaches `completed`/`failed`, and a new durable, idempotent `sweepQueuedPayoutIntentActivations` (independently retryable; isolates one intent's failure from the rest of the scan) is exposed via a staff-gated `POST /api/payments/payouts/queued-intents/activations` route. The global sweep was later hardened with keyset (`createdAt`, `id`) cursor pagination so still-ineligible intents stop starving intents queued past the first page. Fixed by `d9aa005` (terminal-transition hook), `3b18386` (durable sweep), `b0cc86b` (staff sweep route), hardened by `ba40ba2` (keyset cursor pagination) — all on `main`.
- **Severity:** Medium (organizer-visible feature silently never progresses) · **Confidence:** CONFIRMED (zero callers)
- **Where:** `lib/payments/payouts/queue-intents.ts:539` — `activateQueuedPayoutIntent` has no callers anywhere outside tests; intents are created via the payout-request conflict fallback (`queueOrganizerPayoutIntentAction`) and via `POST /api/payments/payouts/queued-intents`.
- **What:** The organizer UI actively offers "queue" as the fallback when an active payout exists (`activeConflictPolicy: 'queue'`); the intent row is created, `payout.queued` is emitted… and nothing ever activates, converts, or expires the intent. It sits `queued` forever (the wallet is unaffected since `payout.queued` is a zero-delta event — that part is intentional).
- **Fix direction:** Belongs to the payout execution driver work (handoff doc §8, step 6): activation should fire when the blocking request reaches a terminal state.

### BUG-6 — "Goodwill" refunds bypass admin review end-to-end using organizer permissions

- **Status:** RESOLVED (2026-07-13) — resolved as staff-gating, not a rename: goodwill refund initiation, the admin review-queue read, the escalation-trigger endpoint, and goodwill refund execution are now all behind `requireInternalStaffAccess`; ordinary (non-goodwill) organizer refund execution is unchanged. Fixed by `9aaa4a6` (goodwill initiation), `10a1118` (review-queue + escalations), `69fee93` (goodwill execution) — all on `main`.
- **Severity:** Medium · **Confidence:** MEDIUM that it's a defect (behavior CONFIRMED; may be intended organizer self-service — needs an intent decision)
- **Where:** `app/api/payments/refunds/goodwill/route.ts:51` (guard: `requireOrganizerWriteAccess`); `app/api/payments/refunds/[refundRequestId]/execute/route.ts:72-77` (guard: organizer `canEditRegistrationSettings`); `lib/payments/refunds/refund-execution.ts:388-390` (executable from `escalated_admin_review` when the request is goodwill).
- **What:** An organizer can initiate a goodwill refund (created directly in `escalated_admin_review` with goodwill markers) and then execute it themselves — no internal admin/staff involvement at any point, despite the status name, the `admin/review-queue` framing, and the handoff doc describing goodwill as an admin-level override. Mitigations: `isGoodwill` derives from stored snapshot data (`refund-execution.ts:383-386`), not caller input, and the refund debits the organizer's own wallet — so abuse potential is limited to the organizer moving their own funds outside a review gate.
- **Fix direction:** Product decision: if goodwill is meant to be admin-gated, the goodwill initiation and/or goodwill execution branches need an internal-role guard; if organizer self-service is intended, rename away from `admin_review` and update the handoff doc.

---

## Secondary notes (lower grade)

### NOTE-7 — Wallet "available" is not the withdrawable amount

- **Status:** RESOLVED (2026-07-13) — added `deriveMaxWithdrawableMinor` (available minus debt, floored at zero), surfaced as its own wallet summary tile, and wired the same derivation into the live organizer payout CTA so "request payout" only renders when funds are genuinely withdrawable. Fixed by `c542ee6` (`feat(payments): surface max withdrawable in organizer wallet`) and `35945b3` (`fix(payments): net debt against available in the live payout CTA`) on `main`.
- **Confidence:** behavior CONFIRMED; MEDIUM that it causes real confusion. **Severity:** Low-medium (UX/comprehension).
- The bucket model deliberately keeps `available` gross and treats `debt` as a lien: after a lost dispute, the full hold is released *to available* and equal debt is posted; true withdrawable = `available − debt`, enforced only at quote time (`quote-contract.ts:466-476`). The organizer wallet summary shows `available` and `debt` as separate tiles (`components/payments/organizer-wallet-summary.tsx:37-40`) but never the derived max-withdrawable, so an organizer reading "available" as spendable hits `PAYOUT_NOT_ELIGIBLE`/`PAYOUT_REQUEST_EXCEEDS_MAX_WITHDRAWABLE` only after submitting. Consider surfacing max-withdrawable directly. (The underlying accounting was verified coherent — see "verified clean" below.)

### NOTE-8 — Contract envelope `source` cannot represent `server_action`

- **Status:** RESOLVED (2026-07-13) — added `server_action` to the canonical event envelope `source` enum (`admin` retained), regenerated all 17 event registry contract snapshots, and switched demo-pay's capture event source from the generic `api` to the more precise `server_action`. Fixed by `9f90f23` (`feat(payments): add server_action to canonical event source enum`) on `main`.
- **Confidence:** CONFIRMED · **Severity:** Low (cosmetic/telemetry).
- Envelope enum is `['api','worker','scheduler','admin']` (`contracts/events/v1/index.ts:55`); ingress command sources are `['api','server_action','worker','scheduler']`. Server-action emitters (demo pay) label the *event* `api` while the *row* says `server_action`, and the `admin` envelope source has no ingress counterpart. Harmless today; align the enums in the v2 contract pass.

### NOTE-9 — Ingress without an idempotency key permits duplicate event appends

- **Status:** RESOLVED (2026-07-13) — `idempotencyKey` is now required on the money mutation ingress command, both at the type level (no longer optional/nullable) and at runtime (ingress throws before opening a transaction when it's missing). Fixed by `ffce55d` (`fix(payments): require idempotency key at money mutation ingress`) on `main`.
- **Confidence:** CONFIRMED behavior · **Severity:** Low today (every current emitter passes a key); a footgun for future emitters.
- `moneyMutationIngress` only deduplicates when `idempotencyKey` is provided; re-ingesting the same traceId without a key appends duplicate events to the existing trace (`onConflictDoNothing` on the trace, unconditional event insert) and double-counts volume rollups and wallet buckets. The webhook handler built during provider integration **must** always pass idempotency keys (provider event ids); consider making the key mandatory at the ingress signature level.

### NOTE-10 — Demo-pay gross fallback ignores discount columns

- **Status:** RESOLVED (2026-07-13) — the `totalCents`-null gross fallback now subtracts both the individual discount-redemption amount and the group discount amount, floored at zero via `Math.max`; the normal finalize path (which always sets `totalCents`) is unaffected, and add-on reconstruction was not attempted for the fallback. Fixed by `87d6d64` (`fix(payments): include discounts in demo-pay gross fallback`) on `main`.
- **Confidence:** CONFIRMED · **Severity:** Low (demo-only, legacy rows only).
- `lib/events/payments/actions.ts:169-176`: when `totalCents` is null, gross falls back to `base + fees + tax`, ignoring `discountAmountCents`/`groupDiscountAmountCents`. Normal finalize always sets `totalCents`, so this only affects malformed/legacy rows — but the same fallback shape should not be copied into the real capture path.

---

## Resolution status (2026-07-13)

All BUG-1..BUG-6 and NOTE-7..NOTE-10 findings above are **RESOLVED** — fixed on a separate branch and rebase-merged into `main` as PR #3 on 2026-07-13. SHAs cited in each finding's **Status** line are commits on `main`; this branch's own code is unchanged by that merge (the **Where** evidence in each finding still reflects commit `ed88567`, i.e. where the defect *was*, not current line numbers on `main`). Additional hardening landed alongside the register fixes, beyond what any single finding above called for:

- Idempotent capture-redelivery reconciliation on a CAS miss, so a provider/webhook redelivery of an already-applied capture returns the prior result instead of looping on an invalid-state error (`86b6798` — `fix(payments): reconcile idempotent capture redeliveries on CAS miss`).
- A canonical event source-mismatch guard at ingress, rejecting events whose `source` disagrees with the command `source` instead of silently persisting under the command's source (`d21be83` — `fix(payments): reject canonical event source mismatches at ingress`).
- Keyset cursor pagination for the queued-payout-intent activation sweep, fixing a starvation bug where the same head page was reselected on every run (`ba40ba2`, also cited under BUG-5).

---

## Verified clean (checked, no defect — don't re-chase)

These were investigated as bug candidates during the same review and found sound; recorded to save future reviewers the work:

1. **Dispute-lost accounting** (release-to-available + equal debt posting) is internally coherent: net position is correct, withdrawable is gated by `available − debt` at quote time, and future captures repay the debt lien via the waterfall with matching available deductions (`wallet/snapshot.ts:245-270`, `debt/repayment-waterfall.ts`). The residual concern is presentation only (NOTE-7).
2. **`payout.adjusted` is decrease-only end to end** — enforced in the lifecycle (`PAYOUT_RISK_ADJUSTMENT_NON_DECREASE`) and the wallet handles exactly that shape.
3. **Concurrent double payout requests** are blocked at the DB level by the partial unique index `payout_requests_active_organizer_unique_idx` (`db/schema.ts:1770`); the race is handled with a specific conflict error.
4. **IDOR on by-id routes**: statement, refund, and dispute lookups all filter by `(id, organizerId)` after the org-permission check — cross-org reads/writes are denied (`statements.ts:167-169`, `refund-execution.ts:360-364`).
5. **Idempotent replay paths dedup correctly**: re-running a quote with the same idempotency key re-emits `payout.requested` with the same trace/key and is deduplicated by `money_command_ingestions`; dispute open/settlement retries with unchanged parameters likewise dedup (the cross-outcome case is BUG-2).
6. **Demo pay is transactional and CAS-guarded**: status flip `payment_pending → confirmed` and the `payment.captured` ingress commit atomically, with ownership, hold-expiry, and production gating checks (`lib/events/payments/actions.ts`).
7. **Positive financial adjustments** correctly both credit available and repay debt without double-counting (`wallet/snapshot.ts` + `repaymentCapacityFromEvent`).
8. **Payout profile writes** are owner/admin-gated, validated (18-digit CLABE, RFC), soft-deleted, and audit-logged with RFC redaction (`lib/organizations/payout/actions.ts`).

---

Findings reflect commit `ed88567` (2026-07-10). Re-verify line numbers before acting; the grep appendix in `provider-integration-handoff.md` covers the reachability claims these findings build on.
