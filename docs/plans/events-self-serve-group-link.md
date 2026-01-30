# Events — Self-Serve Group Link (No Organizer Token)

## Goal
Enable small groups (e.g., “10 friends”) to coordinate registrations **without** requesting an organizer-issued token, while keeping the platform safe from seat-hoarding.

## Implemented Features
- [x] Public self-serve **Group Link** creation (authenticated)
- [x] Public **Group Link** join flow (authenticated)
- [x] **No capacity holds** at group creation/join (holds occur only when each person starts registration)
- [x] Coordinator traceability: group creator can see **who joined** and their **registration state**
- [x] Creator can **remove** a member (soft leave) to free space in the group
- [x] Event page CTA: “Register with friends” → create group link

## Routes (UI Surfaces)
- [x] Create group link: `/events/[seriesSlug]/[editionSlug]/groups/new`
- [x] Group link page (join + tracking): `/events/[seriesSlug]/[editionSlug]/groups/[groupToken]`
- Existing registration flow (used after join): `/events/[seriesSlug]/[editionSlug]/register?distanceId=...`

## Key UX Rules
- Group links are for **coordination**, not reservations:
  - Joining a group does **not** reserve a spot.
  - Each member starts registration individually (existing “started” hold rules apply).
- Group creator has visibility into who joined and whether they started/finished.
- Group discount (if configured for the edition):
  - Eligibility is based on the number of **joined + email-verified** members.
  - Discount is **re-checked at finalize/payment** so starting “too early” does not permanently miss the discount.
  - Discount codes do **not** stack with group discounts:
    - A discount code **replaces** the group discount (coupon wins).
    - Removing a discount code can restore an eligible group discount.
  - If applying a discount code would **increase** the total vs the group discount, show a confirmation warning.

## Core Edge Cases to Smoke Test
- [x] Unauthenticated user hits group pages → prompted to sign in, returns via callback URL
- [x] Group becomes full → join blocked for non-members
- [x] User already in another group for the same edition → join blocked with clear message
- [x] Creator removes a member → member count decrements; removed user no longer considered joined
- [x] Registration not open/paused → group page loads but “Start registration” is disabled
- [x] Slug mismatch (group token belongs to different slugs) → redirected to canonical event slugs
- [ ] Group discount reached after a member already started registration:
  - Start registration with no group discount (threshold not met yet)
  - Another member verifies email / joins → threshold met
  - Finalize/payment step applies the group discount (total updates before finalize)
- [ ] Coupon replaces group discount:
  - With a group discount applied, enter a discount code and apply it → group discount is cleared (no stacking)
  - If the code results in a higher total than the group discount, a confirmation dialog appears before applying
  - Remove the discount code → group discount re-syncs and is restored if still eligible

## Key Files
- `db/schema.ts` (registration_groups + registration_group_members)
- `db/relations.ts` (new relations)
- `lib/events/registration-groups/actions.ts`
- `lib/events/registration-groups/queries.ts`
- `lib/events/registration-groups/sync-registration-discount.ts` (re-sync group discount at finalize / after coupon removal)
- `lib/events/discounts/actions.ts` (coupon replaces group discount)
- `lib/events/registration-flow/actions.ts` (finalize re-check)
- `app/[locale]/(public)/events/[seriesSlug]/[editionSlug]/groups/new/*`
- `app/[locale]/(public)/events/[seriesSlug]/[editionSlug]/groups/[groupToken]/*`
- `app/[locale]/(public)/events/[seriesSlug]/[editionSlug]/register/registration-flow.tsx` (coupon confirmation UX)
- `i18n/routing.ts` (route declarations)
- `messages/pages/group-link/*.json` (group link copy)
- `messages/pages/events/*.json` (event page CTA copy)
