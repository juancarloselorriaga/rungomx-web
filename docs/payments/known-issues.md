# Payments — Known Issues & Suspected Bugs

> **Status:** Findings register. Written 2026-07-10, verified against commit `ed88567`.
> **Companion to:** `docs/payments/provider-integration-handoff.md` (architecture, reachability map, dispositions).
> **How to use:** Each finding is self-contained — evidence (file:line), a concrete failure scenario, how to verify, and a suggested fix direction — so an agent or engineer can pick one up independently. Confidence describes how sure we are the *defect is real as described*; severity assumes real money flowing (post-provider). Pre-provider, none of these can lose real money (demo mode only), which is exactly why they should be fixed before integration.
>
> Confidence scale: **CONFIRMED** = the failing path was verified by direct code reading; **HIGH** = code verified, failure needs a specific but realistic trigger; **MEDIUM** = behavior verified, but it may be intended design — needs a product/intent decision; **LOW** = edge case or cosmetic.

---

## Priority findings

### BUG-1 — Payout request creation is non-atomic; a crash strands an active request with no ledger movement

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

- **Severity:** High (financial integrity) · **Confidence:** HIGH (paths confirmed; trigger = failed case update followed by cross-outcome retry)
- **Where:** `lib/payments/disputes/lifecycle.ts` — `transitionDisputeCase` (:1098-1173) calls `settleDisputeOutcome` (:474-546) *before* the guarded `dispute_cases` update, non-transactionally; settlement trace/idempotency key is `dispute-settlement:{disputeCaseId}` regardless of outcome (:391).
- **What:** Money events for the outcome (`dispute.funds_released`, and for `lost` also `dispute.debt_posted`) are committed via ingress first. The case-row update afterwards is a compare-and-set on `status = fromStatus`. If that update fails (concurrent transition won the race, transient DB error, crash), the settlement postings stand while the case remains `under_review`.
- **The nasty part:** On retry with the **opposite** outcome (`won` after a failed `lost`, or vice versa), `buildDisputeSettlementEvents` produces different events but the **same traceId and idempotency key**, so ingress deduplicates and silently keeps the *first* outcome's postings while the case row now records the *second* outcome. Concrete result: case says `won`, wallet carries `dispute.debt_posted` debt from the discarded `lost` attempt — the organizer is charged debt for a dispute they won.
- **Verify:** DB test — transition `under_review → lost` with the case update forced to fail (e.g., concurrently flip the status), then transition `under_review → won`; assert wallet debt is non-zero while the case status is `won`.
- **Fix direction:** Make settlement ingress and the case update one transaction (transactional ingress variant exists), and/or include the outcome in the settlement idempotency key (`dispute-settlement:{id}:{outcome}`) plus a guard that refuses to settle when a settlement trace with a different outcome already exists.

### BUG-3 — Dispute intake can freeze funds with no case record; retry double-freezes

- **Severity:** Medium-high · **Confidence:** HIGH (structure confirmed; trigger = insert failure after ingress)
- **Where:** `lib/payments/disputes/lifecycle.ts` — `openDisputeCase` (:743-810): `dispute.opened` is ingested (committed, freezing `amountAtRisk` in the wallet) *before* the `dispute_cases` insert; `disputeCaseId` is `randomUUID()` per call (:708).
- **What:** If the case insert fails (`DISPUTE_INTAKE_INSERT_FAILED`, connection drop, constraint), frozen funds exist with **no case to ever resolve them** — there is no compensating release path for an orphan freeze. Retrying mints a *new* disputeCaseId → new trace → a **second** freeze on top of the orphan.
- **Verify:** DB test forcing the insert to fail after ingress; assert `frozenMinor` > 0 with zero dispute_cases rows; call again successfully; assert frozen equals 2× amountAtRisk.
- **Fix direction:** Same transaction for ingress + insert; derive `disputeCaseId` deterministically from the external case reference (post-provider, the provider's dispute id) so retries reuse the same trace.

### BUG-4 — Escalated (non-goodwill) refund requests are undecidable — a status with no exit

- **Severity:** Medium (operational dead-end) · **Confidence:** CONFIRMED (no code path exists)
- **Where:** `lib/payments/refunds/decision-submission.ts:113` (decision CAS only from `pending_organizer_decision`); `lib/payments/refunds/refund-execution.ts:388-397` (execution only from `approved`, or `escalated_admin_review` *when goodwill*).
- **What:** A refund request that reaches `escalated_admin_review` via expiry escalation (`escalateExpiredRefundRequests`) can never be approved, denied, executed, or cancelled — no function transitions out of that status for non-goodwill requests. The "admin review queue" route can only *list* them. Distinct from the known "no admin UI" gap: this is missing *domain logic*, not just missing UI.
- **Verify:** Grep for transitions out of `escalated_admin_review` (only the goodwill execution branch exists); or DB test: escalate a pending request, then attempt decision (throws `REFUND_REQUEST_NOT_PENDING`) and execution (throws `REFUND_REQUEST_NOT_EXECUTABLE`).
- **Fix direction:** Add an admin decision function (escalated → approved/denied) when building the refund admin surface; until then, don't enable the escalation route in any scheduled job.

### BUG-5 — Queued payout intents can be created but never activate

- **Severity:** Medium (organizer-visible feature silently never progresses) · **Confidence:** CONFIRMED (zero callers)
- **Where:** `lib/payments/payouts/queue-intents.ts:539` — `activateQueuedPayoutIntent` has no callers anywhere outside tests; intents are created via the payout-request conflict fallback (`queueOrganizerPayoutIntentAction`) and via `POST /api/payments/payouts/queued-intents`.
- **What:** The organizer UI actively offers "queue" as the fallback when an active payout exists (`activeConflictPolicy: 'queue'`); the intent row is created, `payout.queued` is emitted… and nothing ever activates, converts, or expires the intent. It sits `queued` forever (the wallet is unaffected since `payout.queued` is a zero-delta event — that part is intentional).
- **Fix direction:** Belongs to the payout execution driver work (handoff doc §8, step 6): activation should fire when the blocking request reaches a terminal state.

### BUG-6 — "Goodwill" refunds bypass admin review end-to-end using organizer permissions

- **Severity:** Medium · **Confidence:** MEDIUM that it's a defect (behavior CONFIRMED; may be intended organizer self-service — needs an intent decision)
- **Where:** `app/api/payments/refunds/goodwill/route.ts:51` (guard: `requireOrganizerWriteAccess`); `app/api/payments/refunds/[refundRequestId]/execute/route.ts:72-77` (guard: organizer `canEditRegistrationSettings`); `lib/payments/refunds/refund-execution.ts:388-390` (executable from `escalated_admin_review` when the request is goodwill).
- **What:** An organizer can initiate a goodwill refund (created directly in `escalated_admin_review` with goodwill markers) and then execute it themselves — no internal admin/staff involvement at any point, despite the status name, the `admin/review-queue` framing, and the handoff doc describing goodwill as an admin-level override. Mitigations: `isGoodwill` derives from stored snapshot data (`refund-execution.ts:383-386`), not caller input, and the refund debits the organizer's own wallet — so abuse potential is limited to the organizer moving their own funds outside a review gate.
- **Fix direction:** Product decision: if goodwill is meant to be admin-gated, the goodwill initiation and/or goodwill execution branches need an internal-role guard; if organizer self-service is intended, rename away from `admin_review` and update the handoff doc.

---

## Secondary notes (lower grade)

### NOTE-7 — Wallet "available" is not the withdrawable amount

- **Confidence:** behavior CONFIRMED; MEDIUM that it causes real confusion. **Severity:** Low-medium (UX/comprehension).
- The bucket model deliberately keeps `available` gross and treats `debt` as a lien: after a lost dispute, the full hold is released *to available* and equal debt is posted; true withdrawable = `available − debt`, enforced only at quote time (`quote-contract.ts:466-476`). The organizer wallet summary shows `available` and `debt` as separate tiles (`components/payments/organizer-wallet-summary.tsx:37-40`) but never the derived max-withdrawable, so an organizer reading "available" as spendable hits `PAYOUT_NOT_ELIGIBLE`/`PAYOUT_REQUEST_EXCEEDS_MAX_WITHDRAWABLE` only after submitting. Consider surfacing max-withdrawable directly. (The underlying accounting was verified coherent — see "verified clean" below.)

### NOTE-8 — Contract envelope `source` cannot represent `server_action`

- **Confidence:** CONFIRMED · **Severity:** Low (cosmetic/telemetry).
- Envelope enum is `['api','worker','scheduler','admin']` (`contracts/events/v1/index.ts:55`); ingress command sources are `['api','server_action','worker','scheduler']`. Server-action emitters (demo pay) label the *event* `api` while the *row* says `server_action`, and the `admin` envelope source has no ingress counterpart. Harmless today; align the enums in the v2 contract pass.

### NOTE-9 — Ingress without an idempotency key permits duplicate event appends

- **Confidence:** CONFIRMED behavior · **Severity:** Low today (every current emitter passes a key); a footgun for future emitters.
- `moneyMutationIngress` only deduplicates when `idempotencyKey` is provided; re-ingesting the same traceId without a key appends duplicate events to the existing trace (`onConflictDoNothing` on the trace, unconditional event insert) and double-counts volume rollups and wallet buckets. The webhook handler built during provider integration **must** always pass idempotency keys (provider event ids); consider making the key mandatory at the ingress signature level.

### NOTE-10 — Demo-pay gross fallback ignores discount columns

- **Confidence:** CONFIRMED · **Severity:** Low (demo-only, legacy rows only).
- `lib/events/payments/actions.ts:169-176`: when `totalCents` is null, gross falls back to `base + fees + tax`, ignoring `discountAmountCents`/`groupDiscountAmountCents`. Normal finalize always sets `totalCents`, so this only affects malformed/legacy rows — but the same fallback shape should not be copied into the real capture path.

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
