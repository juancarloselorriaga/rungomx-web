# RungoMX Subscriptions + Promotions (V1 Plan, Provider-Agnostic)

This document defines a production-ready, per-user Pro subscription system with:
- Trial (one per user lifetime) on day 1
- Cancel at period end + resume on day 1
- Early-launch activation tools:
  - Admin grants (manual overrides)
  - Promo codes (self-serve redemption)
  - Pre-assign Pro by email (pending grants for users who haven’t registered yet)

No payment provider integration is included, but the design is “plug-and-play ready” for Stripe/Paddle/etc via a provider adapter + webhook event ingestion pipeline.

---

## 1) Locked Decisions (So Implementation Doesn’t Drift)

### 1.1 Scope
- Billing is **per user** (no organization/team/seat billing in V1).
- Pro is orthogonal to roles/permissions:
  - roles decide athlete/organizer/admin area access
  - Pro gates Pro-only features

### 1.2 Trial policy
- **One trial per user lifetime**
- Trial requires authenticated user; recommended: only after email verification.

### 1.3 Subscription-row strategy (explicit)
- **One subscription row per user** (1:1).
- Subscription “history” is represented by `billing_events`, not old subscription rows.

### 1.4 Hashing strategy (security)
- Promo codes and pending-grant emails are stored as **HMAC-SHA256 hashes**, not plaintext and not bare SHA-256.
- Support secret rotation via `hashVersion` columns (see Section 9.4).

---

## 2) Goals

- Single authoritative server-side answer: “Is this user Pro right now?” with correct `proUntil`.
- Correct lifecycle semantics compatible with real billing later.
- Operationally practical launch tooling (testers/ambassadors/promotions).
- Auditable and debuggable: append-only billing event ledger.
- Idempotent and concurrency-safe for redemption/claim flows.
- Tests across unit + DB + server + E2E.

---

## 3) Non-goals (V1)

- Checkout, invoices, customer portal, proration, taxes, dunning.
- Org/team/seat billing.
- Complex plan catalog (V1 can be `planKey=pro` only).

---

## 4) Core Concepts & Invariants

### Concepts
- Subscription: plan + lifecycle timestamps (trialing/active/ended + cancelAtPeriodEnd).
- Entitlement: what the app checks (V1: `pro_access`).
- Override: entitlement grant windows (admin grants, promo grants, pending-grant claims).
- Promotion: redeemable code that grants/extends entitlement.
- Pending grant: grant assigned to an email (claimable after sign-up + email verification).
- Billing event: append-only record of any mutation (admin/system/provider).

### Invariants (must hold)
- `endsAt` is exclusive: Pro iff `now < endsAt`.
- One trial per user lifetime is enforced by a **durable marker**, not by scanning events.
- Cancel-at-period-end never revokes access immediately.
- All billing mutations append a billing event.
- Promo redemption + pending claims are idempotent and concurrency-safe.
- All timestamps are UTC.

---

## 5) Data Model (Provider-Agnostic, Provider-Ready)

Use `billing_*` prefix.

### 5.1 `billing_subscriptions` (1:1 per user)
Purpose: per-user subscription lifecycle snapshot.

Fields (minimum):
- `id`
- `userId` (FK users, UNIQUE)
- `planKey` (V1: `pro`)
- `status` (`trialing` | `active` | `ended`)
- Trial window: `trialStartsAt`, `trialEndsAt`
- Period window: `currentPeriodStartsAt`, `currentPeriodEndsAt`
- Cancellation: `cancelAtPeriodEnd` (bool), `canceledAt`, `endedAt`
- `createdAt`, `updatedAt`

Provider placeholders (nullable for now):
- `provider` (string)
- `providerCustomerId`, `providerSubscriptionId`, `providerPriceId` (string)

Constraints:
- CHECKs (recommended):
  - if trial fields present: `trialEndsAt > trialStartsAt`
  - if period fields present: `currentPeriodEndsAt > currentPeriodStartsAt`

Indexes:
- `userId` unique
- end timestamps for operational queries

### 5.2 `billing_trial_uses` (durable trial marker)
Purpose: cheap, durable “trial consumed” signal.

Fields:
- `userId` (PK / UNIQUE, FK users)
- `usedAt`
- optional: `source` (`user` | `admin` | `migration`)
- `createdAt`

Eligibility rule:
- Trial is allowed iff no row exists for the user.

### 5.3 `billing_entitlement_overrides`
Purpose: explicit entitlement windows (admin, promo, pending-grant claims).

Fields:
- `id`
- `userId` (FK users)
- `entitlementKey` (V1: `pro_access`)
- `startsAt`, `endsAt` (explicit, UTC)
- `sourceType` (`admin` | `promotion` | `pending_grant` | `system` | `migration`)
- `sourceId` (nullable; promotionId / pendingGrantId / etc)
- `reason` (required for `admin`; optional otherwise)
- `grantedByUserId` (nullable for system)
- optional: `metadataJson` (non-PII, small)
- `createdAt`

Constraints:
- `CHECK (endsAt > startsAt)`

Indexes:
- `(userId, entitlementKey)`
- `startsAt`, `endsAt`

### 5.4 `billing_events` (append-only ledger)
Purpose: audit trail + webhook idempotency foundation.

Fields:
- `id`
- `provider` (nullable; required when `source=provider`)
- `source` (`system` | `admin` | `provider`)
- `type` (enum list in Appendix A)
- `externalEventId` (nullable)
- `userId` (nullable)
- `entityType` (`subscription` | `override` | `promotion` | `pending_grant` | `trial_use`)
- `entityId` (nullable)
- `payloadJson` (safe diagnostic data; never include plaintext codes; avoid PII)
- optional: `requestId` / `idempotencyKey`
- `createdAt`

Constraints:
- Unique on `(provider, externalEventId)` where `externalEventId` is not null.

### 5.5 `billing_promotions`
Purpose: promo codes that grant Pro.

Security:
- Do not store plaintext promo codes.
- Hash using HMAC-SHA256 with secret pepper and `hashVersion`.

Naming clarity (avoid confusion):
- Promotion validity window: `validFrom`, `validTo`
- Grant definition:
  - either `grantDurationDays` OR `grantFixedEndsAt`

Fields:
- `id`
- `hashVersion` (int)
- `codeHash` (HMAC of normalized code at hashVersion)
- `codePrefix` (for support lookup)
- `name`, `description` (optional)
- `entitlementKey = pro_access`
- `grantDurationDays` (nullable)
- `grantFixedEndsAt` (nullable)
- Validity:
  - `isActive`
  - `validFrom`, `validTo`
- Caps:
  - `maxRedemptions` (nullable)
  - `perUserMaxRedemptions` (default 1)
  - `redemptionCount` (int, default 0) **required if maxRedemptions is supported**
- `createdByUserId`, `createdAt`, `updatedAt`

Constraints:
- Unique on `codeHash`
- CHECK: exactly one of `grantDurationDays` / `grantFixedEndsAt` is set (or define allowed combos explicitly)

### 5.6 `billing_promotion_redemptions`
Purpose: per-user idempotency + analytics.

Fields:
- `id`
- `promotionId`
- `userId`
- `redeemedAt`
- `createdAt`

Constraints:
- Unique on `(promotionId, userId)` if perUserMaxRedemptions=1 in V1.

### 5.7 `billing_pending_entitlement_grants` (pre-assign by email)
Purpose: ambassadors/testers get Pro after sign-up + email verification.

Security:
- Do not store plaintext email by default.
- Hash email using HMAC-SHA256 with `hashVersion`.

Naming clarity:
- Claim validity window: `claimValidFrom`, `claimValidTo`
- Grant definition:
  - either `grantDurationDays` OR `grantFixedEndsAt`
  - optional: `grantStartsAt` if you need delayed starts (usually not needed in V1)

Fields:
- `id`
- `hashVersion` (int)
- `emailHash` (HMAC of normalized email at hashVersion)
- `entitlementKey = pro_access`
- Grant definition:
  - `grantDurationDays` (nullable)
  - `grantFixedEndsAt` (nullable)
- Claim validity:
  - `isActive`
  - `claimValidFrom`, `claimValidTo`
- Claim tracking:
  - `claimedAt`, `claimedByUserId`
  - `claimSource` (`auto_on_verified_session` | `manual_claim`)
- `createdByUserId`, `createdAt`, `updatedAt`

Constraints:
- CHECK: exactly one of `grantDurationDays` / `grantFixedEndsAt` is set (or define allowed combos explicitly)

---

## 6) Entitlement Evaluation (Correct `proUntil`, explainable)

### 6.1 Required output
Implement one evaluation function/service, used everywhere:

- `isPro: boolean`
- `proUntil: Date | null`  
  End of the *continuous* Pro coverage window starting at `now`.
- `effectiveSource: string`  
  Source that explains why Pro lasts until `proUntil`.
- `sources: Array<{ source: string; startsAt: Date; endsAt: Date; meta?: object }>`  
  For support/debug (can be hidden from end users).
- OPTIONAL (recommended for support/UX):
  - `nextProStartsAt: Date | null` (earliest future start, if currently not Pro)

### 6.2 Candidate intervals
Build candidate Pro intervals from:
- subscription trial window (if active): `[trialStartsAt, trialEndsAt)`
- subscription paid window (if active): `[currentPeriodStartsAt, currentPeriodEndsAt)`
- overrides: each `[startsAt, endsAt)`
- internal bypass:
  - Decide policy:
    - either treat internal as always Pro (simple) OR
    - grant a long override via admin/system (auditable)
  - If “always Pro,” return `proUntil=null` and `effectiveSource=internal_bypass` (document UI behavior).

### 6.3 Interval union algorithm (in-memory)
To avoid incorrect `proUntil` when sources overlap:
1) Filter out expired: discard any interval with `endsAt <= now`.
2) Sort by `startsAt`, then by `endsAt`.
3) Merge overlapping/contiguous intervals:
   - contiguous means `next.startsAt <= current.endsAt`
4) Find merged interval containing now:
   - if none: `isPro=false`, `proUntil=null`, and optionally `nextProStartsAt` from the earliest future merged interval
   - if present: `isPro=true`, `proUntil=merged.endsAt`

### 6.4 `effectiveSource` tie-breaking (explicit)
Determine `effectiveSource` as the underlying interval that contributed the furthest extension within the merged interval containing `now`.

If multiple underlying intervals have the same `endsAt`, apply deterministic precedence:

`internal_bypass > subscription > trial > admin_override > pending_grant > promotion > system/migration`

If still tied, choose the lowest stable identifier (e.g., smallest `override.id`) or earliest `createdAt`.

---

## 7) Stacking Semantics (Avoid Wasted Time)

Define `currentProUntil(now)`:
- the `proUntil` returned by the evaluation function (if currently Pro), else `null`.

### 7.1 Duration-based grants (promo / pending)
For `grantDurationDays`:
- `grantStartsAt = max(now, currentProUntil(now) ?? now)`
- `grantEndsAt = grantStartsAt + durationDays`

This intentionally creates future-dated overrides when the user is currently Pro.

### 7.2 Fixed-end grants (absolute)
For `grantFixedEndsAt`:
- Extend-only semantics:
  - `grantStartsAt = max(now, currentProUntil(now) ?? now)`
  - `effectiveEnd = max(grantStartsAt, grantFixedEndsAt)` **(no shorten)**
- No-op guard:
  - if `effectiveEnd <= grantStartsAt`, do not insert an override (see Section 8.4 for how to record).

---

## 8) Operations (Transactional + Evented + Idempotent)

All operations:
- run inside a DB transaction
- append a `billing_events` row
- avoid logging sensitive inputs (promo codes, raw emails)

### 8.1 Start trial (user)
Preconditions:
- authenticated
- email verified (recommended)
- trial not consumed (`billing_trial_uses` has no row for user)
- user not currently Pro (recommended to prevent weird stacking UX)

Steps (atomic):
1) Insert into `billing_trial_uses` with `ON CONFLICT DO NOTHING`.
   - If conflict: reject as “TRIAL_ALREADY_USED” (or stable idempotent response).
2) Upsert `billing_subscriptions` for the user:
   - `status=trialing`
   - set `trialStartsAt=now`, `trialEndsAt=now+trialLength`
   - clear/initialize cancel fields (`cancelAtPeriodEnd=false`, etc.)
3) Insert `billing_events` `trial_started` (entityType `subscription`, entityId subscriptionId).

### 8.2 Schedule cancel at period end (user)
Preconditions:
- user has subscription status `trialing` or `active`
- now is within the relevant window (trial or paid)
- If already scheduled, treat as idempotent success (recommended)

Steps:
1) Update subscription:
   - set `cancelAtPeriodEnd=true`
   - set `canceledAt=now` if not already set
2) Insert `billing_events` `cancel_scheduled` (include which window ends, trial vs paid, in payload).

### 8.3 Resume (user)
Preconditions:
- subscription exists and is not ended
- `cancelAtPeriodEnd=true`
- If already resumed, treat as idempotent success (recommended)

Steps:
1) Update subscription:
   - set `cancelAtPeriodEnd=false`
   - optionally keep `canceledAt` for history or clear it (pick and document; recommended: keep it and rely on events for history anyway)
2) Insert `billing_events` `cancel_reverted`.

### 8.4 Redeem promo code (user) — cap-safe + idempotent
Preconditions:
- authenticated
- promo is active and within validity window
- per-user redemption not exceeded

Normalization:
- `normalizePromoCode(code)` must be consistent (trim + uppercase, optional dash removal only if explicitly supported).

Hash lookup (supports rotation):
- compute `codeHash` for all supported `hashVersion`s
- query promotion by `codeHash IN (...)`

Transaction steps (recommended order):
1) Lock the promotion row `FOR UPDATE` (ensures global cap correctness).
2) Validate: `isActive`, `validFrom/validTo`, etc.
3) Enforce global cap if `maxRedemptions` is set:
   - if `redemptionCount >= maxRedemptions`: reject (do not record redemption)
4) Insert redemption idempotency anchor:
   - insert `(promotionId, userId)` with `ON CONFLICT DO NOTHING RETURNING id`
   - If not inserted: already redeemed → return stable response (idempotent), do not increment count, do not grant again.
5) Increment `redemptionCount` (only if redemption was newly inserted).
6) Compute `grantStartsAt/grantEndsAt` using stacking rules (Section 7).
7) No-op guard:
   - If the computed grant would not extend Pro coverage (e.g., fixed-end results in `effectiveEnd <= grantStartsAt`):
     - do not insert override
     - still record a `promotion_redeemed` event with payload `{ noExtension: true }`
8) Else insert override:
   - `sourceType=promotion`, `sourceId=promotionId`, `startsAt/grantEndsAt`, metadata includes promotionId and redemptionId.
9) Insert `billing_events` `promotion_redeemed` (include promotionId, redemptionId, startsAt, endsAt, and `noExtension` flag if applicable).

Rate limiting:
- rate-limit redemption attempts per user and per IP.

### 8.5 Create promo (admin)
Preconditions:
- admin/staff permission to manage billing tools

Requirements:
- Generate a high-entropy code (recommended) and display plaintext **only once** at creation.
- Store only `codeHash` and `codePrefix`.

Steps:
1) Generate code (high entropy).
2) Compute `codeHash = HMAC(hashSecret[hashVersion], normalizePromoCode(code))`.
3) Insert promotion row with `redemptionCount=0`.
4) Insert `billing_events` `promotion_created` (do not include plaintext code).

### 8.6 Disable promo (admin)
Steps:
1) Set `isActive=false`
2) Insert `billing_events` `promotion_disabled`.

### 8.7 Create pending grant by email (admin)
Preconditions:
- admin/staff permission

Requirements:
- pending grant should auto-claim only after email verification.

Steps:
1) Normalize email: trim + lowercase.
2) Compute `emailHash = HMAC(hashSecret[hashVersion], normalizedEmail)`.
3) Insert pending grant row.
4) Insert `billing_events` `pending_grant_created` (do not store plaintext email; optionally store email domain only if needed).

### 8.8 Disable pending grant (admin)
Steps:
1) Set `isActive=false`
2) Insert `billing_events` `pending_grant_disabled`.

### 8.9 Auto-claim pending grants (system)
Trigger:
- on a verified session (post-auth), or on verification success flow (pick one and document).

Preconditions:
- authenticated
- email verified
- user email exists and can be normalized

Transaction steps:
1) Compute `emailHash` for all supported hash versions; query matching unclaimed grants.
2) Lock candidate rows `FOR UPDATE`.
3) Apply grants in deterministic order (recommended):
   - by `createdAt` ascending
4) For each grant row:
   - guarded update: `UPDATE ... WHERE claimedAt IS NULL RETURNING id`
   - if update returns none, another txn claimed it → skip
   - compute stacking against *current* Pro-until (update the running proUntil after each successful override insert)
   - insert override with `sourceType=pending_grant`, `sourceId=pendingGrantId`
   - insert `billing_events` `pending_grant_claimed` (include grant id and granted window)

### 8.10 Admin override operations (support/testers)
- Grant override (admin)
  - Insert override row with `sourceType=admin`, `reason` required.
  - Event: `override_granted`
- Extend override (admin)
  - Prefer “append a new override” or “update an existing override” (pick one and document).
  - Recommended for simplicity/traceability: append a new override using stacking rules.
  - Event: `override_extended`
- Revoke override early (admin)
  - Update the target override’s `endsAt = now` (guard `endsAt > startsAt`).
  - Event: `override_revoked`

---

## 9) Security & Hashing

### 9.1 Promo code hashing
- `codeHash = HMAC_SHA256(secretPepper[hashVersion], normalizePromoCode(code))`
- Never store plaintext codes.
- Never log raw code inputs (including failures).

### 9.2 Email hashing (pending grants)
- `emailHash = HMAC_SHA256(secretPepper[hashVersion], normalizeEmail(email))`
- Never store plaintext email by default.
- Normalization: trim + lowercase only (do not apply provider-specific rules like stripping +tags).

### 9.3 Secrets
- Required env:
  - `BILLING_HASH_SECRET_V1` (and optionally V2, etc.)
- If you must have a fallback, document it explicitly (recommended: require billing secret, do not fallback silently).

### 9.4 Secret rotation (hashVersion)
- `billing_promotions.hashVersion` and `billing_pending_entitlement_grants.hashVersion` store which secret version was used.
- Lookups compute hashes for all supported versions (e.g., V2 and V1), and query by `codeHash IN (...)` / `emailHash IN (...)`.
- Rotation procedure:
  - start writing new rows with latest version
  - keep reading old versions until no longer needed

---

## 10) Enforcement (Server-First)

- Pro gating must be enforced server-side:
  - in server actions and route handlers (authoritative)
  - UI gating is for UX only
- Provide a reusable “require entitlement” guard, aligned with existing auth guard patterns.
- Internal users:
  - decide whether internal roles bypass Pro gating (recommended) or are granted Pro via an override.

---

## 11) Background Jobs (Cron)

Idempotent jobs:
- Finalize ended subscriptions:
  - if subscription is trialing and `now >= trialEndsAt`, set `status=ended`, set `endedAt=now` (or endedAt=trialEndsAt), emit `subscription_ended`
  - if subscription is active and `now >= currentPeriodEndsAt`, same
- Optional cleanup:
  - disable expired pending grants (claim window ended)
  - disable expired promotions (validTo passed)

Follow existing CRON_SECRET guard pattern.

---

## 12) Testing Plan (Must-have)

Unit tests:
- interval union returns correct `isPro`, `proUntil`, `effectiveSource`
- overlap correctness:
  - short override + long subscription => proUntil is subscription end
  - promo extension after trial/subscription
- boundary: `now == endsAt` => not Pro
- tie-breaking determinism

DB tests:
- `billing_trial_uses` prevents second trial (including concurrent attempts)
- promo redemption:
  - per-user idempotency: two concurrent redeems => one redemption effect
  - global cap concurrency: never exceed maxRedemptions
- pending grant auto-claim idempotency under concurrent claims

Server tests:
- entitlement guard behavior (unauthenticated / not-pro / pro)

E2E tests:
- start trial -> Pro unlocks -> cancel at period end -> access persists until end -> expiry revokes
- redeem promo during trial -> proUntil extends beyond trial end
- pending grant by email -> sign up -> verify email -> auto-claim -> Pro unlocks

---

## 13) Definition of Done (Acceptance Criteria)

Functional:
- One trial per user lifetime enforced via durable marker.
- Cancel-at-period-end + resume behave correctly for trial and active subscription.
- Entitlement evaluation uses interval union and returns accurate `proUntil` and explainable source(s).
- Promo redemption:
  - HMAC-hashed codes + hashVersion support
  - rate-limited
  - idempotent per user
  - concurrency-safe global cap
  - stacks against currentProUntil to avoid wasted time
- Pending grants:
  - HMAC-hashed emails + hashVersion support
  - auto-claim only after email verification
  - idempotent + concurrency-safe
- All billing mutations write billing events with safe payloads.

Operational:
- Cron finalization exists and is idempotent.
- Support tooling can explain “why is/isn’t user Pro?” with `sources` list + events timeline.

Quality:
- Unit + DB + server + E2E tests added for core flows; CI passes.
- Pro-only features are enforced server-side.

---

## Appendix A: Billing Event Types (V1)
- `trial_started`
- `cancel_scheduled`
- `cancel_reverted`
- `subscription_ended`
- `override_granted`
- `override_extended`
- `override_revoked`
- `promotion_created`
- `promotion_disabled`
- `promotion_redeemed`
- `pending_grant_created`
- `pending_grant_disabled`
- `pending_grant_claimed`

