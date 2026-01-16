# Events Platform - Executive Summary

**Release:** Events Branch (Phases 0, 1, and 2)
**Date:** January 2026

---

## Overview

The RunGoMX Events Platform enables race organizers to create, manage, and publish running and cycling events with complete online registration capabilities. Participants can discover events through a public directory and register online with digital waiver tracking.

This release covers the first three phases of development, delivering a complete events management system that's ready for real-world use (except payment processing, which will come in a future release).

---

## Key Capabilities

### Phase 0: Foundation (Organizations & Permissions)

**Organization Management**

- Create organizations as containers for events
- Collaborate with team members using a 4-tier permission system:
  - **Owner**: Complete access including team member management
  - **Admin**: Full event management, cannot manage team members
  - **Editor**: Can create and edit events, cannot publish or view registrations
  - **Viewer**: Read-only access to event information
- Audit logging tracks all organizer actions for accountability

### Phase 1: Events MVP (Core Event Management)

**Event Creation & Publishing**

- Create events with complete information (dates, location, distances, pricing, capacity)
- Seven sport type categories: Trail Running, Triathlon, Cycling, MTB, Gravel Bike, Duathlon, Backyard Ultra
- Four visibility states: Draft (private), Published (fully public), Unlisted (accessible by direct link), Archived (read-only)
- Automatic web-friendly URL generation and unique event codes (e.g., EVT-ABC123)

**Public Event Discovery**

- Public event directory with comprehensive search and filtering:
  - Location-based search with distance radius
  - Sport type, date range, distance range
  - Registration status, state/region filters
- Individual event detail pages with organized tabs: Overview, Distances, FAQ, Policies, Website
- SEO-optimized pages for search engine discovery

**Registration System**

- Multi-step registration flow with participant information collection
- Account-required registration (participants must log in)
- Automatic profile data pre-filling for faster registration
- Prevents duplicate registrations for the same event
- Unique registration ticket codes for each participant

**Capacity Management**

- Two capacity modes:
  - **Per-Distance**: Each race has its own participant limit
  - **Shared Pool**: All races share one total capacity limit
- Automatic "Sold Out" status when capacity is reached
- Real-time availability tracking

**Digital Waiver System**

- Create custom waivers for legal protection
- Three signature types: Checkbox, Initials, or Full Signature
- Comprehensive tracking: timestamp, IP address, browser info, accepted version
- Required acceptance before registration completion

**Event Information Management**

- FAQ items with drag-and-drop ordering
- Policy configuration (refund, transfer, deferral) with deadlines
- External website linking for official event sites
- Registration pause functionality for temporary closures

### Phase 2: Advanced Features (Revenue & Customization)

**Website Content Editor**

- Create custom content sections for event pages
- Build rich event pages with course maps, schedules, parking info, sponsor logos
- Multi-language support (Spanish and English)
- Secure content storage with script injection prevention

**Date-Based Pricing Tiers**

- Multiple pricing levels that change automatically by date
- Typical structure: Early Bird → Regular → Late Registration
- Encourages early registration and reflects cost changes
- Separate pricing tiers per race distance

**Add-Ons System**

- Offer optional items during registration (merchandise, donations)
- Multiple options per add-on (sizes, colors) with different prices
- Can apply to all distances or specific ones
- Configurable maximum quantity per order
- Delivery method tracking: Pickup at Event, Shipped, Digital

**Discount Codes (Coupons)**

- Create percentage-based discount codes for marketing
- Usage limits and expiration dates
- Case-insensitive codes (EARLY20 = early20)
- Usage tracking and statistics
- Applies to base price and add-ons

**Custom Registration Questions**

- Collect event-specific information beyond standard fields
- Three question types: Text, Single Select, Checkbox
- Questions can be required or optional
- Can apply to all distances or specific ones
- Answers included in registration export

**Registration Export**

- Download complete registration data as CSV spreadsheet
- Includes participant information, emergency contacts, add-on selections, question answers, and waiver acceptance details
- Essential for race day operations and post-event analysis
- Secure handling of personal information

**Organization Payout Profile**

- Store fiscal information (tax ID, bank account) for future payment integration
- One profile per organization applies to all events
- Secure data storage
- Prepares for automated payouts when payment processing launches

---

## Current Status

**What's Working:**

- Complete event creation and management workflow
- Public event discovery and detail pages
- Full registration flow with waiver tracking
- Capacity management and sold-out handling
- All Phase 2 advanced features (pricing tiers, add-ons, coupons, questions, export)

**What's Not Yet Available:**

- **Payment Processing**: Registrations are captured and auto-confirmed without payment collection. This is intentional for this release to allow testing and rollout of all other features. Payment integration will come in a future release.
- **Email Notifications**: No automated emails for confirmations, reminders, or updates
- **Refund/Transfer Processing**: Policies can be displayed but must be processed manually
- **Results Upload**: Event codes exist but no results import functionality yet
- **Waitlist**: No waitlist when events sell out

---

## Known Limitations

### Features Not Included in This Release:

**From Phase 1:**

- Map view in events directory (location search works, but no visual map)
- Minor registration (no specific handling for participants under 18)
- Start times per distance (cannot set different start times for each race)

**From Phase 2:**

- Price increase banners (no automatic "Price increases soon" notifications)
- Add-on inventory tracking (add-ons are unlimited, no stock management)
- Advanced question types (no multi-select, date pickers, or file uploads)

**From Phase 3 (Intentionally Postponed):**

- Event cloning (cannot create new edition by copying previous year)
- URL redirects (event URL changes don't automatically redirect)
- Group registrations (no Excel upload for bulk registrations)
- Family registrations (cannot register multiple people in one transaction)
- Group discounts (no automated pricing for group registrations)

---

## Testing Prerequisites

To test the platform, you'll need:

1. **Two user accounts:**
   - Organizer account (Director role) for creating/managing events
   - Participant account (Athlete role) for testing registrations

2. **At least one Organization** with the organizer user as owner, admin, or editor

3. **Modern browser** (Chrome, Safari, Firefox)

---

## Technical Notes

- Platform uses feature flags for controlled rollout
- Internal staff always have access; external organizers can be enabled selectively
- All features are available in Spanish and English
- System tracks all organizer actions through audit logging
- No-payment mode allows full testing of registration workflow

---

## Next Steps

This release is ready for:

- **User Acceptance Testing (UAT)**: Stakeholders should test all workflows using the detailed test guide
- **Pilot Launch**: Can be enabled for select organizers to begin creating real events
- **Feedback Collection**: Identify any issues or enhancement needs before broader rollout

The detailed testing guide (`events-platform-release-notes.md`) provides step-by-step instructions for testing each feature.

---

## Support

For questions, issues, or feedback during testing, please document:

- Exact steps taken
- Screenshots (if helpful)
- Expected vs. actual behavior
- Contact the development team with details

---

**Summary**: The Events Platform delivers a complete event management and registration system covering Phases 0-2. The only major component not yet implemented is payment processing, which will be added in a future release. All other features are production-ready and can be tested immediately.
