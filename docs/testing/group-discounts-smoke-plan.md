# Group Discounts (Invite/Claim) — Smoke Test Plan

## Scope

Validate the **group discounts** feature end-to-end across:

- Organizer configuration (discount rules).
- Public event visibility (best discount + tier list).
- Group upload (reserve → discount lock → send invites gating).

This plan focuses on the surfaces changed in this iteration.

## Key Routes

- Public event page: `/[locale]/events/[seriesSlug]/[editionSlug]`
- Organizer: `/[locale]/dashboard/events/[eventId]/group-registrations`
- Public group upload landing: `/[locale]/events/[seriesSlug]/[editionSlug]/group-upload/[uploadToken]`
- Public group upload batch manager: `/[locale]/events/[seriesSlug]/[editionSlug]/group-upload/[uploadToken]/batches/[batchId]`

## Features

### 1) Public “Group discounts” messaging

- Show a “Group discounts” section on the public event page when rules exist.
- Show tier list (e.g., 3+ → 10%, 5+ → 15%).
- Show a “Groups save X%” hint on distance cards.
- Show a badge in the hero that reflects the **best** discount available.

### 2) Discount application rule (locked on reserve)

- Group discounts are applied to group-upload registrations when the batch is fully processed.
- “Best rule” is selected using the **highest minParticipants** that is eligible for the reserved count.
- Discount is applied to registration totals before invites are sent.

### 3) Prevent sending invites before discount lock

- “Send invites” is disabled until the batch is processed.
- Attempting to send early returns a clear error (“reserve all valid rows first”).

## Primary User Flows

1. Organizer signs in → configures 2 discount tiers (3+ and 5+).
2. Public event page shows the callout and hero badge using the best tier.
3. Organizer creates a group upload link.
4. Coordinator uses the link → creates batch → uploads a CSV with ≥3 valid rows → reserves until processed → sees discount applied → sends invites.

## Notes / Constraints

- Email delivery may be disabled in local testing; “Send invites” should still complete without crashing.
- This plan verifies visible UX and key state transitions (processed gating + discount callout).
