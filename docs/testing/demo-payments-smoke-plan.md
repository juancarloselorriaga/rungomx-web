# Demo Payments (Pay Button) — Smoke Test Plan

## Scope

Validate the **demo-only payment** workaround for stakeholder demos:

- `payment_pending` registrations can be moved to `confirmed` using a **Pay (demo)** button.
- The UI only exposes this in **non-production** environments when explicitly enabled.

## Configuration

- Set `NEXT_PUBLIC_FEATURE_EVENTS_DEMO_PAYMENTS=true` for the running app instance.

## Key Routes

- My registrations list: `/[locale]/dashboard/my-registrations`
- My registration detail: `/[locale]/dashboard/my-registrations/[registrationId]`

## Expected Behavior

1. When a registration is `payment_pending`, the detail page shows:
   - Payment pending note + demo disclaimer.
   - A **Pay (demo)** button (enabled).
2. Clicking **Pay (demo)**:
   - Confirms the registration (`payment_pending` → `confirmed`).
   - Refreshes the page and removes the pay CTA.
3. If demo payments are disabled, the pay CTA remains disabled (placeholder).

