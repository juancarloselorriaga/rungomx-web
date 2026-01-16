# Release Notes and Test Guide (Events branch)

## Summary

This release implements the Events Platform for RunGoMX, covering Phases 0, 1, and 2 of the plan. The platform enables race organizers (Directors) to create, manage, and publish running/cycling events with full registration workflows, while participants can discover events and register online.

Key achievements:

- **Phase 0 (Foundations)**: Organization management with 4 permission levels (Owner, Admin, Editor, Viewer)
- **Phase 1 (Events MVP)**: Event creation workflow, public event directory with search and filters, event detail pages, and online registration with digital waiver tracking
- **Phase 2 (Advanced Features)**: Custom website content editor, flexible pricing tiers, add-ons (merchandise/donations), discount coupons, custom registration questions, and CSV export
- **No-payment mode**: Registrations are captured and confirmed automatically (payment integration will come in a future release)

## How to test (quick start prerequisites)

**Required test accounts:**

- **Organizer account**: User with Director role (for creating/managing events)
- **Participant account**: Regular user with Athlete role (for testing registrations)

**Test organization:**

- At least one Organization must exist with the organizer user as owner, admin, or editor

**Browser:** Any modern browser (Chrome, Safari, Firefox)

---

## Features included in this release

### Phase 0: Foundations

## Organizations Management

**What it is:** Organizations are containers for events. Each organization can have multiple members with different permission levels. Events belong to an organization, and members manage events based on their assigned role.

**Why it matters:** Allows race directors to collaborate with their team while maintaining control over who can publish events or access sensitive participant data.

**How to test:**

1. Log in as a Director (organizer)
2. Go to Dashboard and click "Organizations" in the navigation
3. Click "Create Organization"
4. Enter organization name (e.g., "Trail Runners Mexico")
5. The system automatically creates a web-friendly URL slug
6. Click Save
7. You'll be taken to the organization settings page
8. Try adding team members:
   - Enter their email address
   - Select a role (Owner, Admin, Editor, or Viewer)
   - Click "Add Member"

**Expected result:**

- New organization appears in your organizations list
- You are automatically set as "Owner"
- Team members receive invitations and can access the organization based on their role
- Only Owners can add/remove members

**Notes:**

- Each organization must have a unique name
- Only Owners can manage team members
- Editors can create events but cannot publish them

---

## Organization Roles & Permissions

**What it is:** Four permission levels control what team members can do within an organization.

**Why it matters:** Enables delegation without giving full control. For example, you can let a team member update event details without giving them access to view participant personal information.

**Permission levels:**

- **Owner**: Complete access including team member management
- **Admin**: Full event management, cannot add/remove team members
- **Editor**: Can create and edit events, cannot publish or view registrations
- **Viewer**: Read-only access to event information

**How to test:**

1. Create an organization (as described above)
2. Add a second user as "Editor"
3. Log out and log in as that Editor user
4. Try to:
   - Edit an event → Should work
   - Publish an event → Should see "Permission denied" message
   - View registrations → Should see "Permission denied" message
   - Manage organization members → Should not see this option
5. Log back in as Owner
6. Change the Editor's role to "Admin"
7. Log in as that user again
8. Now try publishing and viewing registrations → Should work

**Expected result:**

- Each role can only perform actions they're permitted to do
- Attempting restricted actions shows a clear error message
- Permissions are enforced throughout the system

---

## Feature Flags

**What it is:** The events platform can be enabled or disabled for external organizers using a system setting.

**Why it matters:** Allows controlled rollout. Internal staff always have access, but external Directors only see the events features when enabled.

**How to test:**

This is controlled by system administrators and doesn't require manual testing by organizers.

---

### Phase 1: Events MVP

## Event Creation Wizard

**What it is:** Step-by-step form to create a new event, capturing all essential information like event name, dates, location, and race distances with pricing.

**Why it matters:** Simplifies the setup process with a guided workflow. You don't need technical knowledge to create an event.

**How to test:**

1. Go to Dashboard → Events
2. Click "Create Event"
3. Fill in the form:
   - **Organization**: Select your organization
   - **Event series name**: e.g., "Ultra Trail del Desierto"
   - **Sport type**: Choose from Trail Running, Triathlon, Cycling, MTB, Gravel Bike, Duathlon, or Backyard Ultra
   - **Edition**: e.g., "2026"
   - **Event dates**: Start and end dates
   - **Timezone**: Usually America/Mexico_City
   - **Location**: Enter city and state, optionally add full address
   - **External website** (optional): Link to your official event website
4. Add at least one race distance:
   - **Label**: e.g., "50K"
   - **Distance**: 50 kilometers
   - **Price**: Enter in pesos (e.g., 800 for $800 MXN)
   - **Capacity** (optional): Leave blank for unlimited or enter a number
5. Click "Save as Draft"

**Expected result:**

- Event is created with "Draft" status
- A unique event code is automatically generated (e.g., "EVT-ABC123")
- Event appears in your events dashboard
- Event is NOT visible to the public until you publish it

**Notes:**

- The system automatically creates web-friendly URLs from your event name
- You can add multiple race distances (10K, 21K, 50K, etc.) to the same event

---

## Sport Type Categories

**What it is:** Seven sport categories for classifying your events.

**Why it matters:** Helps participants find events that match their interests.

**Available categories:**

- Trail Running
- Triathlon
- Cycling
- Mountain Biking (MTB)
- Gravel Bike
- Duathlon
- Backyard Ultra

**How to test:**

1. Create several events with different sport types
2. Go to the public Events page (log out or use incognito mode)
3. Use the sport type filter dropdown
4. Select "Trail Running"
5. Only trail running events should appear
6. Try other filters

**Expected result:**

- All 7 sport types appear in the filter
- Filtering works correctly
- Event pages display the sport type badge

---

## Public Event Directory (Search & Filters)

**What it is:** Public page where participants can discover and search for events.

**Why it matters:** This is how participants find your events. Supports location-based search, date filters, sport type, and more.

**Available filters:**

- **Location search**: Enter city name and select search radius (25-500 km)
- **Sport type**: Select one or more sport categories
- **Date range**: Filter by event dates
- **Month**: Quick filter for specific months
- **Distance range**: Minimum and maximum race distance
- **Registration status**: Show only events accepting registrations
- **Virtual events**: Include or exclude virtual events
- **State/region**: Filter by Mexican state

**How to test:**

1. Publish several test events with different:
   - Sport types
   - Dates
   - Locations
2. Go to the Events page (public view)
3. Test each filter:
   - Enter "Mexico City" in location → Events near Mexico City appear
   - Select "Trail Running" → Only trail events shown
   - Pick a date range → Only events in that period shown
   - Toggle "Open registration" → Only accepting-registration events shown
4. Try combining multiple filters

**Expected result:**

- Filters work independently and together
- Results show event name, date, location, sport type, registration status, and starting price
- Page shows 20 events at a time with pagination
- If logged in, "Near me" uses your profile location

**Notes:**

- Only published events appear (not drafts)
- Event name search uses partial matching (typing "ultra" finds "Ultra Trail")

---

## Event Detail Page (Public)

**What it is:** Individual event page showing complete information with organized tabs.

**Why it matters:** This is what participants see when they click on your event. It's your event's home page.

**Page sections:**

- **Hero section**: Event name, date, location, hero image, registration status
- **Tabs**: Overview, Distances, FAQ, Policies, Website (if you've added custom content)
- **Sidebar**: Key facts, registration dates, link to other editions of your event

**How to test:**

1. Create and publish an event
2. Add at least one distance
3. Add some FAQ items
4. Go to Events page (public view)
5. Click on your event
6. Verify:
   - Hero section shows event name, date, location, sport badge
   - "Register Now" button is visible (if registration is open)
   - Click each tab to verify content displays
   - Check sidebar information is accurate
7. Click "Register Now" to test the registration flow

**Expected result:**

- All tabs display correctly
- Registration status badge shows accurate state (Open/Closed/Paused)
- If sold out, "Sold Out" badge appears instead of register button
- External website link appears in sidebar (if you added one)
- If registration is paused, clear message is displayed

**Notes:**

- Events can be: Draft (not public), Published (fully public), Unlisted (accessible by direct link only), or Archived (read-only)

---

## Registration Flow (Multi-Step)

**What it is:** Multi-step registration form where participants sign up for your event.

**Why it matters:** This is how participants register and pay for your event. Captures all necessary information including legal waiver acceptance.

**Registration steps:**

1. **Login requirement**: Must be logged in to register
2. **Distance selection**: Choose which race to enter
3. **Participant info**: Name, email, birth date, phone, gender, emergency contact (auto-filled from their profile)
4. **Custom questions**: Answer any event-specific questions you've added
5. **Add-ons**: Select merchandise or make donations (if you've configured them)
6. **Waiver**: Read and accept your event waiver
7. **Review and payment**: See total cost and confirm registration (currently no actual payment)
8. **Confirmation**: Receive unique registration ticket code

**How to test:**

1. Create and publish an event with at least one distance
2. Log out or open an incognito window
3. Go to the event page
4. Click "Register Now" → Should redirect to login
5. Log in as a participant (athlete)
6. Go back to event page and click "Register Now"
7. Go through each step:
   - Select a distance
   - Verify participant info auto-fills
   - Answer any questions (if added)
   - Select add-ons (if added)
   - Read and accept waiver
   - Review total cost
   - Click "Complete Registration"

**Expected result:**

- Registration is confirmed
- Participant receives a unique ticket code (format: EVT-ABC123-001)
- Registration appears in participant's "My Registrations" page
- You (organizer) see the registration in your event's registrations list
- Waiver acceptance is recorded with timestamp and IP address
- If capacity was limited, available spots decrease by 1

**Notes:**

- Participants cannot register twice for the same event
- If event is sold out, registration closed, or paused, registration is blocked
- Currently registrations are auto-confirmed without payment (payment integration coming in future release)

---

## Waiver Management & Tracking

**What it is:** Create digital waivers for your event. When participants register, they must accept your waiver. The system records when and how they accepted it.

**Why it matters:** Legal protection for race organizers. Provides proof that participants read and agreed to your terms.

**How to test (Organizer side):**

1. Go to Dashboard → Events → [Your Event]
2. Click "Waivers" in the event menu
3. Click "Create Waiver"
4. Enter:
   - **Title**: e.g., "Participant Waiver and Release"
   - **Body**: Your waiver text (can be long)
   - **Signature type**: Choose Checkbox, Initials, or Signature
5. Click Save

**How to test (Participant side):**

1. Register for an event that has a waiver
2. At the waiver step, you'll see the waiver text
3. Depending on signature type:
   - **Checkbox**: Check "I accept"
   - **Initials**: Type your initials
   - **Signature**: Type your full name
4. Complete registration

**Expected result:**

- Organizer can create and edit waivers
- Participant must accept waiver to complete registration
- System records:
  - Which waiver was accepted
  - Exact time of acceptance
  - Participant's IP address
  - Browser information
  - What they typed (for initials/signature)

**Notes:**

- Currently only one waiver per event is supported
- If you update waiver text after some registrations, the system tracks which version each person accepted

---

## Capacity Management

**What it is:** Set maximum number of participants for each race distance or for the entire event.

**Why it matters:** Prevents overbooking. Essential for events with physical limits (parking, aid stations, permits).

**Two capacity modes:**

1. **Per-Distance**: Each race has its own limit (e.g., 50K limited to 200, 21K limited to 300)
2. **Shared Pool**: All races share one total limit (e.g., 500 total across all distances)

**How to test (Per-Distance):**

1. Create an event with two distances
2. Set Distance A capacity to 5
3. Set Distance B capacity to 10
4. Register 5 participants for Distance A
5. Try to register a 6th participant → Should see "Sold Out"
6. Register for Distance B → Should still work

**How to test (Shared Pool):**

1. Create an event
2. In event settings, set "Shared Capacity" to 15
3. Set all distances to use shared pool
4. Register participants across different distances
5. After 15 total registrations, all distances should show "Sold Out"

**Expected result:**

- System enforces capacity limits
- Public event page shows "X spots remaining" when capacity is set
- Dashboard shows current capacity status
- "Sold Out" badge appears when capacity is reached
- Register button is disabled when sold out

**Notes:**

- Leave capacity blank for unlimited participants
- Canceled registrations don't automatically free up spots (you'll need to adjust manually)

---

## FAQ Management

**What it is:** Create question-and-answer items that appear on your event page.

**Why it matters:** Answers common participant questions proactively (parking, packet pickup, refund policy, etc.), reducing support requests.

**How to test:**

1. Go to Dashboard → Events → [Your Event]
2. Click "FAQ" in the event menu
3. Click "Add Question"
4. Enter question and answer
5. Save
6. Add a few more questions
7. Drag to reorder them
8. Go to your public event page
9. Click the "FAQ" tab
10. Click on questions to expand answers

**Expected result:**

- FAQ items can be created, edited, deleted, and reordered
- Public page displays FAQs in the order you set
- Questions expand when clicked
- Participants can search FAQs using Ctrl+F

**Notes:**

- FAQs are specific to each event edition (not shared between years)
- No limit on number of FAQ items

---

## Event Visibility & Publishing

**What it is:** Control whether your event is visible to the public and search engines.

**Why it matters:** Work on your event privately, then make it public when ready. Can also create private events accessible only by direct link.

**Visibility states:**

- **Draft**: Not public, only you and your team can see it
- **Published**: Fully public, appears in search directory, indexed by Google
- **Unlisted**: Accessible by direct link only, does not appear in search directory or Google
- **Archived**: Read-only, does not appear in search

**How to test:**

1. Create an event (starts as Draft)
2. Try to find it in the public Events directory → Should NOT appear
3. Try accessing the direct URL while logged out → Should show "Not Found"
4. Change status to "Published" (in event settings)
5. Refresh public Events directory → Event should now appear
6. Change status to "Unlisted"
7. Refresh directory → Event disappears from list
8. Access the direct URL → Still works (but won't appear in Google)

**Expected result:**

- Draft events are completely private
- Published events are fully public
- Unlisted events are accessible by link but hidden from searches
- Archived events cannot be edited

**Notes:**

- Only Admins and Owners can publish events (Editors cannot)

---

## Registration Pause

**What it is:** Temporarily stop accepting registrations without unpublishing the event.

**Why it matters:** Emergency brake for unexpected issues (permit problems, venue changes, etc.). Event page stays live but registrations are paused.

**How to test:**

1. Create and publish an event with open registration
2. Go to event settings
3. Toggle "Registration Paused" to ON
4. Save
5. Go to public event page → Should see "Registration Paused" message
6. Try to register → Should be blocked
7. Toggle pause back to OFF
8. Registration should work again

**Expected result:**

- Pause toggle is available to Admins and Owners
- When paused, public page shows clear status
- Register button is disabled
- Event still appears in search directory
- Existing registrations are not affected

**Notes:**

- Pause overrides registration open/close dates
- Event page remains fully accessible

---

## Public Event Code

**What it is:** Each event gets a unique short code (e.g., "EVT-ABC123") automatically generated when you create it.

**Why it matters:** Used for support tickets, registration confirmations, and future features like results upload. Easier to read and communicate than long IDs.

**How to test:**

1. Create an event
2. Go to the event dashboard
3. Look for "Public Code" near the event title
4. Code should be in format: EVT- followed by 6 characters
5. Create another event
6. Verify it gets a different code

**Expected result:**

- Every event has a unique code
- Code is displayed on organizer dashboard
- Code appears on participant's registration confirmation

**Notes:**

- Code cannot be changed after creation
- Codes never repeat (extremely low collision probability)

---

## External Event URL

**What it is:** Add a link to your official event website (outside of RunGoMX).

**Why it matters:** Many race directors have existing websites with detailed trail maps, sponsor info, etc. This links participants to that information.

**How to test:**

1. Go to event settings
2. Enter external URL (e.g., "https://ultratraildeldesierto.com")
3. Save
4. Go to public event page
5. Look in the sidebar for "Official website" link
6. Click it → Opens in new browser tab

**Expected result:**

- URL is saved and displayed on public event page
- Link opens in new tab
- If no URL is provided, no link appears

---

### Phase 2: Advanced Features

## Website Content Editor

**What it is:** Create custom content sections for your event page using a flexible editor.

**Why it matters:** Build rich event pages with course maps, schedules, parking info, and sponsor logos without needing a developer.

**How to test:**

1. Go to Dashboard → Events → [Your Event]
2. Click "Website" in the event menu
3. Create content sections using the editor
4. Add text, images, and structured content
5. Save
6. Go to public event page
7. Click "Website" tab
8. Verify your custom content displays correctly

**Expected result:**

- You can add, edit, and remove content sections
- Public page displays content in the order you set
- Content looks good on mobile and desktop
- Images display properly

**Notes:**

- Content is stored securely (script injection prevented)
- Can create separate versions for Spanish and English

---

## Date-Based Pricing Tiers

**What it is:** Set multiple prices for a race distance that change automatically based on date (e.g., early bird until March, regular until June, late registration after).

**Why it matters:** Encourages early registration and reflects actual cost changes (lodging and meals get more expensive closer to event date).

**How to test:**

1. Go to Dashboard → Events → [Your Event]
2. Click "Pricing" in the event menu
3. Select a distance
4. Add pricing tiers:
   - **Tier 1**: "Early Bird" - $600 MXN - valid until March 1
   - **Tier 2**: "Regular" - $800 MXN - valid March 1 to May 31
   - **Tier 3**: "Late" - $1,000 MXN - valid from June 1 onward
5. Save
6. Go to public event page at different simulated dates
7. Verify the correct price displays based on current date

**Expected result:**

- At any time, only one tier is "active"
- Public event page shows current price
- Registrations use the active price at time of registration
- Tiers are clearly labeled and organized by date

**Notes:**

- Tier dates should not overlap
- Each distance can have its own pricing tiers
- If all tiers have passed, the last tier's price is used

---

## Add-Ons (Merchandise & Donations)

**What it is:** Offer optional items during registration like T-shirts, medals, or donation options. Each add-on can have multiple choices (sizes, colors) with different prices.

**Why it matters:** Additional revenue stream and participant customization. Very common for event T-shirts with size/gender options.

**How to test:**

1. Go to Dashboard → Events → [Your Event]
2. Click "Add-Ons" in the event menu
3. Create an add-on:
   - **Title**: "Event T-Shirt"
   - **Type**: Merchandise
   - **Delivery**: Pickup at Event
4. Add options:
   - Men's Small - $150 MXN
   - Men's Medium - $150 MXN
   - Women's Small - $150 MXN
   - etc.
5. Mark as active and save
6. Register for the event (as participant)
7. At the add-ons step, select a T-shirt size
8. Complete registration
9. Verify total includes add-on price
10. As organizer, export registrations and check add-on selections

**Expected result:**

- Add-ons appear during registration
- Selected items are saved with registration
- Total price includes add-on costs
- Export includes add-on information

**Notes:**

- Add-ons can apply to all distances or specific ones
- Can set maximum quantity per order (default 5)
- Can deactivate add-ons to hide them

---

## Discount Codes (Coupons)

**What it is:** Create coupon codes that participants enter during registration to get a percentage discount.

**Why it matters:** Marketing tool for early bird promotions, sponsor partnerships, or VIP discounts.

**How to test:**

1. Go to Dashboard → Events → [Your Event]
2. Click "Coupons" in the event menu
3. Create a discount code:
   - **Code**: EARLY20
   - **Name**: Early Bird 20% Off
   - **Discount**: 20%
   - **Max uses**: 50
   - **Valid until**: March 1, 2026
4. Mark as active and save
5. Register for the event (as participant)
6. At the payment review step, enter "EARLY20"
7. Click "Apply"
8. Total should decrease by 20%
9. Complete registration
10. As organizer, check coupon usage statistics

**Expected result:**

- Valid coupon reduces total by specified percentage
- Invalid/expired coupons show error message
- Max uses enforced (becomes invalid after limit reached)
- Discount applies to base price and add-ons
- Usage is tracked per registration

**Notes:**

- Coupons are case-insensitive (EARLY20 = early20)
- One coupon per registration
- Coupons only work for the specific event they're created for

---

## Custom Registration Questions

**What it is:** Add custom questions to the registration form beyond standard information.

**Why it matters:** Collect event-specific information like dietary restrictions, parking needs, volunteer interest, etc.

**Question types:**

- **Text**: Open-ended text input
- **Single Select**: Dropdown or radio buttons (choose one)
- **Checkbox**: Yes/No or opt-in

**How to test:**

1. Go to Dashboard → Events → [Your Event]
2. Click "Registrations" then "Questions" (or similar menu item)
3. Create questions:
   - "Do you have dietary restrictions?" (text, optional)
   - "Will you need parking?" (single select: Yes/No, required)
   - "I want to volunteer at an aid station" (checkbox, optional)
4. Save
5. Register for the event (as participant)
6. At the questions step, answer all questions
7. Complete registration
8. As organizer, export registrations
9. Verify answers are included in export

**Expected result:**

- Questions appear during registration in defined order
- Required questions block registration if not answered
- Answers are saved with registration
- Export includes questions and answers

**Notes:**

- Questions can apply to all distances or specific ones
- Can mark questions inactive to hide them
- Text questions allow up to 500 characters

---

## Registration Export (CSV)

**What it is:** Download a spreadsheet file (CSV) with all registration details for your event.

**Why it matters:** Essential for race day operations (bib assignment, packet pickup, emergency contacts) and post-event analysis.

**How to test:**

1. Create an event with add-ons, questions, and waiver
2. Get at least 3 test registrations
3. Go to Dashboard → Events → [Your Event]
4. Click "Registrations" in the event menu
5. Click "Export CSV" button
6. File downloads to your computer
7. Open file in Excel or Google Sheets
8. Verify columns include:
   - Registration details
   - Participant information
   - Emergency contacts
   - Add-on selections
   - Question answers
   - Waiver acceptance information

**Expected result:**

- CSV file downloads successfully
- One row per registration
- All columns are clearly labeled
- Data is complete and accurate
- Opens correctly in spreadsheet software

**Notes:**

- Export includes personal information (handle securely)
- File encoding supports Spanish characters
- Can filter export by distance or status before downloading

---

## Event Policy Configuration

**What it is:** Configure and display refund, transfer, and deferral policies with deadlines.

**Why it matters:** Sets clear expectations for participants. Reduces disputes and support requests.

**How to test:**

1. Go to Dashboard → Events → [Your Event]
2. Click "Policies" in the event menu
3. Configure policies:
   - **Refund policy**: Turn ON, add text ("Full refunds until 30 days before event"), set deadline (e.g., May 1)
   - **Transfer policy**: Turn ON, add text ("Bib transfers allowed until 7 days before event"), set deadline (e.g., May 25)
   - **Deferral policy**: Leave OFF (no deferrals offered)
4. Save
5. Go to public event page
6. Click "Policies" tab
7. Verify refund and transfer policies appear with deadlines
8. Verify deferral policy does not appear (since it's off)

**Expected result:**

- Policies display on public event page
- Deadlines shown in participant's timezone
- Disabled policies don't appear
- Text is clearly formatted and readable

**Notes:**

- This feature is **information only** – no automated enforcement
- You must manually process refunds, transfers, or deferrals
- Future releases will add operational workflows

---

## Organization Payout Profile

**What it is:** Store your organization's fiscal information (tax ID, bank account) for future payment integration.

**Why it matters:** Prepares for automated payouts when payment processing launches. Separates event management from payment setup.

**How to test:**

1. Go to Dashboard → Organizations → [Your Organization]
2. Find "Payout Profile" section
3. Enter:
   - **Legal name**: For invoices
   - **RFC**: Mexican tax ID
   - **Bank name**: Your bank
   - **CLABE**: 18-digit account number
   - **Account holder**: Name on account
4. Save

**Expected result:**

- Information is saved successfully
- Only Owners and Admins can see this section
- Data is stored securely
- No money movement happens (data only)

**Notes:**

- One profile per organization (applies to all events)
- Fields are optional (can fill later)
- Will be used for automated payouts in future release

---

## Known limitations / Not in this release

The following features are **NOT included** in this release:

### From Phase 1:

- **Map view**: Events directory has location search but no map visualization
- **Minor registration**: No specific handling for participants under 18
- **Start times per distance**: Cannot set different start times for each race

### From Phase 2:

- **Price increase banners**: No automatic "Price increases soon" notifications
- **Add-on inventory**: Add-ons are unlimited (no stock tracking)
- **Advanced question types**: No multi-select, date pickers, or file uploads

### From Phase 3 (intentionally postponed):

- **Event cloning**: Cannot create new edition by copying previous year
- **URL redirects**: Event URL changes don't automatically redirect
- **Group registrations**: No Excel upload for bulk registrations
- **Family registrations**: Cannot register multiple people in one transaction
- **Group discounts**: No automated pricing for group registrations

### Other notable omissions:

- **Payment processing**: Registrations auto-confirm without payment (payment integration coming in future release)
- **Email notifications**: No automated emails for confirmation, reminders, or updates
- **Refund/transfer/deferral processing**: Can display policies but must process manually
- **Results upload**: Event code exists but no results import yet
- **Waitlist**: No waitlist when events are sold out

---

## Testing checklist

Use this checklist to verify all features are working:

### Phase 0 - Foundations
- [ ] Create organization
- [ ] Add team members with different roles
- [ ] Verify Editor cannot publish events
- [ ] Verify Editor cannot view registrations
- [ ] Verify Admin can publish and view registrations
- [ ] Verify only Owner can manage members

### Phase 1 - Events MVP
- [ ] Create draft event with multiple distances
- [ ] Add FAQ items and reorder them
- [ ] Create and configure waiver
- [ ] Set capacity limits (test both per-distance and shared pool)
- [ ] Publish event and verify it appears in public directory
- [ ] Test all search filters work correctly
- [ ] Register as participant and complete full flow
- [ ] Verify waiver acceptance is recorded
- [ ] Test registration pause functionality
- [ ] Verify sold-out status when capacity reached

### Phase 2 - Advanced Features
- [ ] Create custom website content
- [ ] Set up pricing tiers with different dates
- [ ] Create add-ons with multiple options
- [ ] Create discount coupon and test during registration
- [ ] Add custom registration questions
- [ ] Export registrations to CSV and verify data
- [ ] Configure event policies (refund/transfer/deferral)
- [ ] Set up organization payout profile

### Cross-Feature Tests
- [ ] Register with add-ons and discount code
- [ ] Export registrations including add-ons and answers
- [ ] Verify prices update based on active tier
- [ ] Test event with shared capacity across distances
- [ ] Register as organizer for own event (should see warning)
- [ ] Try to register twice for same event (should be blocked)

---

## Support and feedback

If you encounter any issues or have questions during testing:

1. Note the exact steps you took
2. Take screenshots if helpful
3. Document what you expected vs. what happened
4. Report to the development team with details

Thank you for helping test the Events Platform!
