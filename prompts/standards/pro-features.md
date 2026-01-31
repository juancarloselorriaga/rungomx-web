# Pro Features Standard (RungoMX Web)

This guide defines the implementation standard for **Pro features**: how we lock/hide/disable
feature capabilities for non‑Pro users, how we enforce access on the server, and how we keep the UX
consistent (upsell cards, admin controls, usage tracking).

---

## 1. Concepts: “Pro membership” vs “Pro feature”

**Pro membership (entitlement)** answers: *is this user Pro right now, and until when?*

- Source of truth: `lib/billing/entitlements.ts`
- Guard helper: `lib/billing/guards.ts` (`requireProEntitlement`)

**Pro feature (feature-level gate)** answers: *is this specific capability enabled/locked/hidden for
this user?* It combines:

- Pro membership (`isPro`)
- Internal/staff bypass (`isInternal`)
- Admin-configured feature toggles/visibility (`pro_feature_configs`)

Source of truth: `lib/pro-features/*` (catalog + evaluator + server guards).

Use **Pro feature gating** when you want:

- Consistent lock/hidden behavior across UI + server.
- Admin control to disable/lock/hide a feature without shipping code.
- Usage tracking (`blocked`/`used`) per feature.

Use **membership-only gating** when you’re gating an entire area behind Pro and don’t need per‑feature
admin visibility controls.

---

## 2. Pro feature system overview (where to look)

- **Catalog / feature registry:** `lib/pro-features/catalog.ts`
- **Admin-configurable config snapshot:** `lib/pro-features/server/config.ts`
- **Decision engine:** `lib/pro-features/evaluator.ts`
- **Server guards (pages + actions):** `lib/pro-features/server/guard.tsx`
- **Usage tracking:** `lib/pro-features/server/tracking.ts` (table: `pro_feature_usage_events`)
- **Client snapshot + hooks:**
  - Server action: `app/actions/pro-features.ts` (`getProFeaturesSnapshotAction`)
  - Provider: `components/pro-features/pro-features-provider.tsx`
  - Hook: `hooks/use-pro-feature-decision.ts`
  - Gate component: `components/pro-features/pro-feature-gate.tsx`
- **Admin UI:** `/admin/pro-features`
  - Actions: `app/actions/pro-features-admin.ts`
  - Page copy: `messages/pages/admin-pro-features/*`

---

## 3. Server enforcement (required for `server_required` features)

If a Pro feature affects **writes** (mutations) or exposes privileged data, it must be enforced on
the server.

**Standard pattern (server actions / route handlers):**

1. Perform auth + base permission checks first (org membership, staff permissions, etc.).
2. Gate the Pro feature with `requireProFeature(featureKey, authContext)` from
   `lib/pro-features/server/guard.tsx`.
3. Catch `ProFeatureAccessError` and return a shaped error (usually `code: 'PRO_REQUIRED'`).
4. After a successful “real” usage, record `eventType: 'used'` via `trackProFeatureEvent`.

Notes:

- `requireProFeature` automatically records `blocked` usage events for locked/hidden cases.
- UI checks (client gating) are **not** security boundaries; they can be bypassed.
- The `enforcement` field in `lib/pro-features/catalog.ts` is **metadata**; it does not enforce
  anything by itself. Enforcement happens where you call `requireProFeature`.

Examples in the codebase:

- Coupons mutations: `lib/events/discounts/actions.ts`
- Event clone mutation: `lib/events/editions/actions.ts`

---

## 4. Page gating (Server Components)

For Server Component pages, use `guardProFeaturePage(featureKey, authContext)` from
`lib/pro-features/server/guard.tsx` to render the correct UX state:

- `allowed=true` → render the page normally.
- `status=disabled` → render `gate.disabled` (feature off for everyone).
- `status=locked` → render `gate.upsell` (shows `ProLockedCard`).
- `status=hidden` → redirect to a safer parent page (or render nothing), depending on UX.

Example:

- Coupons page: `app/[locale]/(protected)/dashboard/events/[eventId]/coupons/page.tsx`

---

## 5. Client/UI gating (UX only)

Client gating is for navigation and UX polish (hide tabs, show locked cards). It is not sufficient
for enforcement.

Preferred tools:

- Decision hook: `useProFeatureDecision(featureKey)` (`hooks/use-pro-feature-decision.ts`)
- Gate component: `<ProFeatureGate featureKey="..." />` (`components/pro-features/pro-feature-gate.tsx`)

Important behavior:

- `useProFeatureDecision` **fails open** (`status: 'enabled'`) when the snapshot is unavailable
  (`reason: 'snapshot_unavailable'`). This is intentional to avoid blocking UX due to transient
  errors, but it means server enforcement is mandatory.

---

## 6. Adding a new Pro feature (checklist)

1. **Add the feature key** to `ProFeatureKey` in `lib/pro-features/catalog.ts`.
2. **Define catalog metadata** in `PRO_FEATURE_CATALOG`:
   - `defaultVisibility`: `locked` (upsell UI) or `hidden` (no UI surface for non‑Pro).
   - `enforcement`: `server_required` for anything that hits protected data or writes.
   - `upsellHref`: typically `/settings/billing`.
   - i18n keys for common lock UI + admin UI.
3. **Add i18n strings**:
   - Lock UI: `messages/common/en.json` + `messages/common/es.json` under
     `proFeatures.<featureKey>.{title,description,ctaLabel}`.
   - Admin labels: `messages/pages/admin-pro-features/en.json` + `.../es.json` under
     `features.<featureKey>.{label,description}`.
4. **Enforce on the server**:
   - Add `requireProFeature('<featureKey>', authContext)` to all mutation entry points.
   - Shape the returned error using `code: 'PRO_REQUIRED'` (from `ProFeatureAccessError.code`).
5. **Gate the page and UI**:
   - Pages: `guardProFeaturePage('<featureKey>', authContext)` for consistent upsell/disabled UX.
   - Client: hide nav items when decision is `hidden`/`disabled`; show upsell card when `locked`.
6. **Track usage**:
   - Add `trackProFeatureEvent({ featureKey, userId, eventType: 'used' })` after successful usage
     (ideally on the primary action(s) for that feature).
7. **Add tests**:
   - Guard behavior: `__tests__/integration/pro-features-guard.server.test.ts`
   - Evaluator logic: `__tests__/lib/pro-features-evaluator.server.test.ts`
   - Add a feature-specific test if the gate affects business logic or permissions.

---

## 7. Common pitfalls (avoid)

- Using `isPro` from client state to enforce server actions.
- Querying billing tables directly from feature code instead of using `getProEntitlementForUser`.
- Hiding UI without server enforcement for any write path.
- Using rollout feature flags (`lib/features/flags.ts`) as a substitute for Pro feature gating.
- Adding a new Pro feature without adding the corresponding i18n keys (lock UI + admin UI).
