# Payments — MVP Provider Recommendation (Mexico)

> **Status:** Recommendation / opinion document (not state). Written 2026-07-10.
> **Companion to:** `provider-integration-handoff.md` (state + playbook) and `known-issues.md` (bugs to fix first).
> Provider facts below were spot-checked against public sources on 2026-07-10; **re-verify pricing and availability at signup** — this landscape shifts.

---

## 1. Recommendation in one paragraph

Use **Stripe Mexico** as the provider. For the MVP, run as **merchant of record with platform custody** (plain Stripe charges into RunGoMX's account; organizer payouts via manual SPEI transfers recorded in-product) — this is exactly the model the existing wallet/payout code was built for, requires zero organizer onboarding, and is the smallest possible slice. Plan a **graduation path to Stripe Connect (Express accounts)** when volume or the legal review demands it — Connect is now available for Mexican platforms, which is the main reason to choose Stripe over the alternatives: you can change custody models later without changing providers or rewriting the webhook layer.

## 2. Why Stripe (and why not the others)

| Criterion | Stripe MX | Mercado Pago | Conekta |
| --- | --- | --- | --- |
| Cards MXN | ✅ ~3.6% + $3 MXN + IVA | ✅ ~3.49% + $4 MXN + IVA | ✅ ~3.4% + $3 MXN + IVA |
| OXXO (cash voucher) | ✅ supported | ✅ supported | ⚠️ OXXO Pay assets sold to Digital@FEMSA (2024); cash flow now routed via FEMSA — verify current state |
| SPEI as payment method | ✅ available | ✅ | ✅ |
| MSI (installments) | ✅, configurable per account | ✅ | ✅ |
| Marketplace/split model | ✅ **Connect available in MX** (Express/Standard/Custom; MSI configurable per connected account) | ✅ Split Payments (sellers need MP accounts) | ⚠️ "Dispersiones a terceros" (disbursements from balance) — not a full marketplace product |
| Webhooks/DX/test tooling | Best in class; maps cleanly onto the canonical-event ledger | Workable; docs weaker | Workable; docs weaker |
| Graduation path (custody → provider-held) | ✅ same provider (Connect) | ✅ but locks organizers into MP accounts | ❌ limited |

- **Stripe**: the canonical-event architecture in `lib/payments/core/` was clearly built for a webhook-driven provider; Stripe's event model (payment_intent, charge.refunded, charge.dispute.\*, payout.\*) maps 1:1 onto the 17 canonical events. Sandbox, CLI webhook forwarding, and test clocks make the E2E story cheap (the demo-payments specs can be adapted).
- **Mercado Pago** is the strongest alternative *if* you decide to offload custody on day one: Split Payments handles the marketplace division automatically. The costs: every organizer must open/verify a Mercado Pago account (friction against the "time-pressured organizer" persona), and much of the wallet/payout domain becomes a mirror of MP's ledger rather than the source of truth.
- **Conekta** is a fine domestic MoR gateway, but the OXXO Pay divestiture adds uncertainty and it has no marketplace graduation path; its "dispersiones" product is, however, a candidate for **automating SPEI payouts later** without changing the charging provider.

## 3. The custody decision (make this first — handoff §7.1/§8.1)

**MVP: merchant of record + platform custody.** Athlete money lands in RunGoMX's Stripe balance → bank account; organizer wallets accrue in the ledger; payouts are SPEI transfers from the company bank to the organizer's CLABE (already collected by `organization_payout_profiles`).

- ✅ Matches the built system exactly (wallet buckets, payout quotes, debt lien, CLABE profiles).
- ✅ Zero organizer onboarding; smallest MVP.
- ⚠️ **Legal caveat (do this before launch):** collecting on behalf of organizers should be papered as *comisión mercantil / mandato* in the organizer terms, and a Mexican fintech lawyer should confirm the model stays outside Ley Fintech (IFPE) territory at your projected volumes. If that review says no → flip to **Stripe Connect Express** before launch; the webhook translation layer is the same work either way.
- ⚠️ Chargebacks land on RunGoMX as MoR — the wallet's freeze/debt model covers the organizer-side accounting, but fix `known-issues.md` BUG-2/BUG-3 before wiring real dispute webhooks.

**Graduation trigger (move to Connect Express):** legal review requires it, payout ops exceed ~a few hours/week, or organizers demand faster/self-serve payouts. Connect with **manual payout schedule** preserves the existing payout-request UX (organizer requests → platform triggers Stripe payout → `payout.completed` webhook).

## 4. MVP scope (money-in first, ~days not weeks given the existing seam)

**Pre-work (from `known-issues.md`):**
1. Extract the confirm-on-capture core out of `demoPayRegistration` (status CAS + `payment.captured` ingest in one transaction) into a shared function — handoff §6.7.
2. Adopt the discipline: webhook ingress idempotency key = **Stripe event id** (NOTE-9); organizer resolution before ingress (handoff §7.8).
3. Fix BUG-1 (payout request atomicity) before enabling the payout ops slice.

**Slice 1 — cards checkout (the actual MVP):**
1. Server action creates a **Stripe Checkout Session** (hosted page — handles 3DS/SPEI redirect states, no PCI surface, least code) with `registrationId` + `editionId` in metadata, amount = `registrations.totalCents`, currency MXN, cards only.
2. Replace the coming-soon panel in `payment-step.tsx` with the redirect; handle the return URL (success → confirmation step; cancel → back to payment step).
3. Webhook route `app/api/webhooks/stripe/route.ts`: verify signature → resolve organizer (registration → edition → series → organization, as demo pay does) → ingest `payment.captured` → confirm registration via the extracted function. `feeAmount` = **RunGoMX's platform fee** (`registrations.feesCents`), not Stripe's processing cost — Stripe's cut is a platform expense, tracked in reconciliation, not in the organizer's net.
4. Persist external IDs (payment intent + checkout session id) in a queryable place (new columns or a small `payment_attempts` table; event `metadata` at minimum).
5. Refunds without UI: execute refunds in the **Stripe dashboard**; handle `charge.refunded` webhook → ingest `refund.executed` + cancel the registration. No in-product refund flow in MVP.
6. Disputes: handle in the Stripe dashboard manually; do **not** wire dispute webhooks until BUG-2/BUG-3 are fixed. At MVP volume this is ~zero cases.
7. Keep the 24h `payment_pending` TTL (cards confirm synchronously).

**Slice 2 — payout ops (can ship days later; money-in works without it):**
1. Fix BUG-1; build the minimal **admin payout action + UI**: mark `processing` → operator does the SPEI transfer from the company bank → mark `completed`/`failed` via `transitionPayoutLifecycle`. This closes handoff §6.1 and known-issues BUG-5's family.
2. Payout policy recommendation: **no payouts before the event has taken place** (event cancellation = mass refund exposure). Enforce operationally via the admin step in MVP; encode later.

**Fast-follow (deliberately not MVP):**
- **OXXO** (and SPEI-as-payment-method): culturally important for unbanked runners, but vouchers confirm in 1–3 days → requires the `payment_pending` TTL/hold redesign (handoff §7.3) and capacity policy for pending vouchers. Do it as fast-follow #1.
- **MSI installments**: enable when organizers with high-ticket races ask.
- Dispute webhook wiring (after BUG-2/3), in-product refund UI (BUG-4's admin decision path), payout automation (Stripe Connect payouts or Conekta dispersiones/STP), wallet checkpointing (handoff §8.9).

## 5. Verify at signup (facts move; checked 2026-07-10)

- Current MX card fee (~3.6% + $3 MXN + IVA) and OXXO fee; settlement timing to bank (2–7 business days standard).
- Connect availability/pricing for MX platforms (per-account fees for Express) — needed only for the graduation path.
- MSI cost to merchant per plazo; SPEI payment-method availability on Checkout.
- Payout/refund behavior for OXXO-paid charges (cash refunds are not automatic — refund UX differs).

Sources consulted: [stripe.com/global](https://stripe.com/global), [Stripe Connect MX](https://stripe.com/en-mx/connect), [Stripe MX installments docs](https://docs.stripe.com/payments/mx-installments), [Stripe pricing](https://stripe.com/pricing), [Mercado Pago Split Payments docs](https://www.mercadopago.com.mx/developers/en/docs/split-payments/landing), [comisiones MP 2026](https://atempora.studio/blog/comisiones-mercado-pago-2026), [Stripe vs MP vs Conekta 2026](https://atempora.studio/blog/stripe-vs-mercado-pago-vs-conekta), [Conekta dispersiones](https://www.conekta.com/blog/realiza-dispersiones-a-terceros-desde-tu-cuenta-conekta), [OXXO Pay → Digital@FEMSA](https://www.bloomberglinea.com/latinoamerica/mexico/femsa-compra-activos-de-conekta-vinculados-a-oxxo-pay/).
