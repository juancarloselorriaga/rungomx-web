# Events Platform Phase 0 + Phase 1 Smoke Test Results

**Test Date:** 2026-01-11
**Environment:** Local development (http://localhost:3000)
**Test Accounts:**
- Organizer: jetsam-elector92@icloud.com / rungomxpassword
- Athlete: hiss-cheek9l@icloud.com / rungomxpassword

---

## Automated Test Results

### ✅ Phase 0: Foundations & Permissions

#### Test 1: Non-authenticated Access Control
- **Status:** PASSED ✅
- **Steps:**
  1. Navigated to `/en/dashboard/events` without authentication
  2. System redirected to `/en/sign-in?callbackURL=%2Fdashboard`
- **Result:** Correct behavior - unauthenticated users cannot access organizer routes

#### Test 2: Organizer Authentication & Access
- **Status:** PASSED ✅
- **Steps:**
  1. Signed in with organizer credentials (jetsam-elector92@icloud.com)
  2. Navigated to `/en/dashboard/events`
  3. Page loaded successfully with "Manage Events" title
  4. Saw empty state: "No events yet" with "Create event" CTAs
- **Result:** Organizer can access dashboard successfully

#### Test 3: Public Events Directory (Empty State)
- **Status:** PASSED ✅
- **Steps:**
  1. Navigated to `/en/events` (public page)
  2. Page loaded with filters: sport type, state, search
  3. Shows "No events yet" message
- **Result:** Public directory accessible and renders correctly

---

## Manual Test Instructions

### Phase 1: Event Creation & Management

#### Test 4: Create Event (Full Flow)

**Prerequisites:** Signed in as organizer

**Steps:**

1. **Navigate to Create Event**
   - Go to `/en/dashboard/events/new`
   - ✅ Verify: Page shows "Create event" heading
   - ✅ Verify: Two-step wizard: "1. Organization" → "2. Event details"

2. **Fill Organization Details (Step 1)**
   - Organization name: `Test Trail Runners`
   - URL slug: `test-trail-runners`
   - Click "Continue"
   - ✅ Verify: Slug auto-generates from name
   - ✅ Verify: Continue button becomes enabled after filling both fields

3. **Fill Event Details (Step 2)**

   **Basic Information:**
   - Event name: `Mountain Ultra 50K 2026`
   - Event slug: `mountain-ultra-50k-2026` (should auto-generate)
   - Sport type: `Trail Running`
   - Description: `A challenging 50K trail race through scenic mountain terrain.`

   **Location:**
   - Search for location or manually enter:
     - City: `Valle de Bravo`
     - State: `Estado de México`
     - Country: `Mexico`
   - ✅ Verify: Lat/Lng populate if using location search

   **Dates & Times:**
   - Start date: Select a future date (e.g., 2026-06-15)
   - End date: Same as start date for single-day event
   - Timezone: `America/Mexico_City`
   - Registration opens: 2 weeks before event
   - Registration closes: 1 day before event

   **Optional Fields:**
   - External URL: `https://example.com/mountain-ultra`
   - Hero image: Upload an image

   **✅ Verify:**
   - All required fields marked with *
   - Timezone dropdown populated with options
   - Date pickers work correctly
   - External URL validates format

4. **Add Distance(s)**
   - Click "Add distance" or similar
   - Distance 1:
     - Label: `50K`
     - Distance: `50`
     - Unit: `kilometers`
     - Price: `150000` (1500.00 MXN in cents)
     - Capacity: `100`
     - Start time: `07:00` (local)
     - Virtual: unchecked

   - Add Distance 2:
     - Label: `25K`
     - Distance: `25`
     - Unit: `kilometers`
     - Price: `100000` (1000.00 MXN in cents)
     - Capacity: `150`
     - Start time: `08:00` (local)
     - Virtual: unchecked

   **✅ Verify:**
   - Can add multiple distances
   - Can remove distances
   - Each distance has own capacity
   - Price accepts integers (cents)

5. **Add FAQ Items**
   - Add FAQ 1:
     - Question: `What is included in registration?`
     - Answer: `Bib number, timing chip, finisher medal, post-race meal, and aid station support.`

   - Add FAQ 2:
     - Question: `What is the cutoff time?`
     - Answer: `50K: 10 hours. 25K: 5 hours.`

   **✅ Verify:**
   - Can add/edit/delete FAQ items
   - FAQ items can be reordered
   - Rich text formatting works in answers

6. **Save as Draft**
   - Click "Save as draft" or similar
   - ✅ Verify: Success message appears
   - ✅ Verify: Redirects to `/en/dashboard/events`
   - ✅ Verify: Event appears in list with "Draft" status
   - ✅ Verify: Event does NOT appear on `/en/events` public page

7. **Publish Event**
   - Click into the draft event
   - Click "Publish" button
   - ✅ Verify: Status changes to "Published"
   - ✅ Verify: Event now appears on `/en/events` public page
   - ✅ Verify: Audit log entry created (check database)

**Database Verification Queries:**
```sql
-- Check organization created
SELECT * FROM organizations WHERE slug = 'test-trail-runners';

-- Check event series and edition
SELECT * FROM event_series WHERE slug LIKE '%mountain-ultra%';
SELECT * FROM event_editions WHERE series_id = <series_id_from_above>;

-- Check distances
SELECT * FROM event_distances WHERE edition_id = <edition_id>;

-- Check FAQ items
SELECT * FROM event_faq_items WHERE edition_id = <edition_id> ORDER BY sort_order;

-- Check audit logs
SELECT * FROM audit_logs WHERE entity_type = 'event_edition' ORDER BY created_at DESC LIMIT 10;
```

---

#### Test 5: Event Discovery & Filtering

**Prerequisites:** At least one published event exists

**Steps:**

1. **Basic Directory View**
   - Navigate to `/en/events`
   - ✅ Verify: Event(s) displayed as cards
   - ✅ Verify: Each card shows:
     - Event name
     - Date
     - Location (city, state)
     - Key distances
     - Registration status badge

2. **Test Filters**

   **Sport Type Filter:**
   - Select "Trail Running" from sport dropdown
   - ✅ Verify: Only trail running events shown
   - Select "All sports"
   - ✅ Verify: All events shown again

   **State Filter:**
   - Select "Estado de México"
   - ✅ Verify: Only events in that state shown
   - Test with different states

   **Search:**
   - Type "Mountain" in search box
   - ✅ Verify: Events with "mountain" in name shown
   - Clear search
   - ✅ Verify: All events shown again

3. **SEO Verification**
   - View page source (Ctrl+U or Cmd+Option+U)
   - ✅ Verify: `<title>` tag present and descriptive
   - ✅ Verify: Meta description present
   - ✅ Verify: Open Graph tags (og:title, og:image, og:description)
   - ✅ Verify: Canonical URL present
   - Navigate to `/sitemap.xml`
   - ✅ Verify: Published event URL(s) included
   - ✅ Verify: Draft events NOT included

---

#### Test 6: Public Event Page

**Prerequisites:** At least one published event exists

**Steps:**

1. **Navigate to Event Page**
   - From `/en/events`, click on an event card
   - URL should be `/en/events/[slug]`
   - ✅ Verify: Page loads correctly

2. **Verify Content Display**
   - ✅ Hero image (if uploaded)
   - ✅ Event name as H1
   - ✅ Date and time (formatted correctly in local timezone)
   - ✅ Location (city, state displayed)
   - ✅ Sport type badge/label
   - ✅ Registration close date/time
   - ✅ External URL link (opens in new tab)
   - ✅ Description paragraph

3. **Verify Distances Section**
   - ✅ Each distance displayed as card or list item
   - ✅ Distance label and value shown (e.g., "50K")
   - ✅ Price shown (formatted as currency)
   - ✅ Start time shown (if set)
   - ✅ Capacity status:
     - If spots available: "X spots remaining" or nothing
     - If low (<10% or <20): "Only X spots left"
     - If full: "Sold out" badge
   - ✅ Register CTA button for each distance

4. **Verify FAQ Section**
   - ✅ FAQ section is visible and prominent
   - ✅ Q&A items display correctly
   - ✅ Answers show with proper formatting

5. **SEO Verification**
   - View page source
   - ✅ Verify: Title includes event name and location
   - ✅ Verify: Meta description summarizes event
   - ✅ Verify: og:image uses hero image or default
   - ✅ Verify: Canonical URL is correct
   - ✅ Verify: hreflang tags if multi-locale
   - ✅ Verify: Structured data (JSON-LD) for Event schema (optional)

---

#### Test 7: Registration Flow (Happy Path)

**Prerequisites:**
- Published event with available capacity
- Signed in as athlete account (hiss-cheek9l@icloud.com)

**Steps:**

1. **Start Registration**
   - On event page, click "Register" for 50K distance
   - ✅ Verify: Navigates to `/en/events/[slug]/register?distance=<distance-id>`
   - ✅ Verify: Registration form loads

2. **Participant Information Step**
   - ✅ Verify: Form fields present:
     - First name
     - Last name
     - Email (prefilled from account)
     - Date of birth
     - Phone
     - Sex/gender
     - Gender identity (optional)
     - Results division (if required)
     - City, State
     - Emergency contact name
     - Emergency contact phone

   - Fill in all required fields
   - ✅ Verify: Validation works (try submitting with missing fields)
   - ✅ Verify: DOB validates age (if minimums exist)
   - Click "Continue" or "Next"

3. **Waiver Step**
   - ✅ Verify: Waiver text displays
   - ✅ Verify: Acceptance checkbox/initials field present
   - Try to continue without accepting
   - ✅ Verify: Validation blocks progression
   - Accept waiver
   - ✅ Verify: Checkbox checked or initials captured
   - Click "Continue"

4. **Review & Payment Placeholder Step**
   - ✅ Verify: Participant summary displayed
   - ✅ Verify: Distance and price shown
   - ✅ Verify: Price breakdown:
     - Base price: 1500.00 MXN
     - Platform fee: XX.XX MXN (or placeholder)
     - Total: XXXX.XX MXN
   - ✅ Verify: "Payment Placeholder" or "PaymentPending" notice shown
   - ✅ Verify: Clear message that no real payment required
   - Click "Complete Registration" or similar

5. **Confirmation**
   - ✅ Verify: Registration completed successfully
   - ✅ Verify: Confirmation page or message
   - ✅ Verify: Can view registration details

6. **Database Verification**
```sql
-- Check registration created
SELECT * FROM registrations WHERE buyer_user_id = <athlete_user_id> ORDER BY created_at DESC LIMIT 1;

-- Check registrant record
SELECT * FROM registrants WHERE registration_id = <registration_id>;

-- Check waiver acceptance
SELECT * FROM waiver_acceptances WHERE registration_id = <registration_id>;

-- Verify metadata captured
-- Should have: accepted_at, ip_address, user_agent
```

7. **Verify Capacity Decremented**
   - Go back to event public page
   - ✅ Verify: Capacity count updated (e.g., "99 spots remaining" if started with 100)

---

#### Test 8: Registration State Blocking

**Test 8.1: Registration Not Open Yet**

**Setup:** Edit event to set `registrationOpensAt` to future date

**Steps:**
1. Navigate to event page
2. ✅ Verify: "Registration opens on [date]" message shown
3. ✅ Verify: Register buttons disabled or hidden
4. Try to navigate directly to `/en/events/[slug]/register?distance=X`
5. ✅ Verify: Blocked with appropriate message

---

**Test 8.2: Registration Closed**

**Setup:** Edit event to set `registrationClosesAt` to past date

**Steps:**
1. Navigate to event page
2. ✅ Verify: "Registration closed" message shown
3. ✅ Verify: Register buttons disabled
4. Try to navigate directly to registration URL
5. ✅ Verify: Blocked with message

---

**Test 8.3: Registration Paused (Manual Override)**

**Setup:** As organizer, pause registration

**Steps:**
1. Sign in as organizer
2. Navigate to event settings
3. Find "Pause registration" toggle or button
4. Toggle ON
5. ✅ Verify: Status updates to "Paused"
6. Sign out (or use athlete account)
7. Navigate to event page
8. ✅ Verify: "Registration paused" message shown
9. ✅ Verify: Event still visible in directory
10. ✅ Verify: Register buttons disabled
11. Try to navigate to registration URL
12. ✅ Verify: Blocked with message
13. As organizer, unpause registration
14. ✅ Verify: Registration reopens (register buttons enabled)

---

**Test 8.4: Sold Out (Capacity Full)**

**Setup:**
- Set distance capacity to 1
- Complete 1 registration as athlete

**Steps:**
1. Navigate to event page (as different user or logged out)
2. ✅ Verify: "Sold Out" badge shown for that distance
3. ✅ Verify: Register button disabled for that distance
4. Try to navigate directly to registration URL
5. ✅ Verify: Blocked with "sold out" message
6. ✅ Verify: Other distances (if available) still open

**Capacity Race Condition Test:**
1. Set capacity to 1
2. Open registration URL in two different browser tabs
3. Try to submit both simultaneously
4. ✅ Verify: Only ONE completes successfully
5. ✅ Verify: Second attempt gets "sold out" error
6. ✅ Verify: Database has exactly 1 registration (no over-subscription)

```sql
-- Verify capacity enforcement
SELECT
  ed.label,
  ed.capacity,
  COUNT(r.id) as registration_count
FROM event_distances ed
LEFT JOIN registrations r ON r.distance_id = ed.id AND r.status IN ('Confirmed', 'PaymentPending')
WHERE ed.id = <distance_id>
GROUP BY ed.id;

-- Result should show registration_count <= capacity
```

---

#### Test 9: Organizer Registration Management

**Prerequisites:**
- Signed in as organizer
- At least one registration exists

**Steps:**

1. **View Registrations List**
   - Navigate to `/en/dashboard/events/[eventId]/registrations`
   - ✅ Verify: List of registrations displayed
   - ✅ Verify: Each row shows:
     - Participant name
     - Email
     - Distance
     - Status
     - Registration date

2. **Filter Registrations**
   - Filter by distance dropdown
   - ✅ Verify: Only registrations for selected distance shown
   - Filter by status (if available)
   - ✅ Verify: Filtering works correctly
   - Clear filters
   - ✅ Verify: All registrations shown

3. **View Individual Registration**
   - Click on a registration
   - ✅ Verify: Full participant details shown (PII)
   - ✅ Verify: Waiver acceptance metadata visible:
     - Accepted at (timestamp)
     - IP address
     - User agent
     - Signature type
   - ✅ Verify: Registration status shown
   - ✅ Verify: Payment totals shown

4. **Export Registrations (Phase 2 feature)**
   - If implemented: Click "Export" or "Download CSV"
   - ✅ Verify: CSV file downloads
   - ✅ Verify: CSV includes all registration data
   - ✅ Verify: Audit log entry created for export

```sql
-- Check audit log for export
SELECT * FROM audit_logs
WHERE action = 'export_registrations'
AND entity_type = 'event_edition'
AND actor_user_id = <organizer_user_id>
ORDER BY created_at DESC;
```

---

#### Test 10: Organizer Event Settings

**Prerequisites:** Signed in as organizer

**Steps:**

1. **Edit Event Basics**
   - Navigate to `/en/dashboard/events/[eventId]/settings`
   - ✅ Verify: Form shows current values
   - Change event name
   - Change description
   - Update dates
   - Save changes
   - ✅ Verify: Success message
   - ✅ Verify: Changes reflected on public page
   - ✅ Verify: Audit log entry created

2. **Edit Distances**
   - Navigate to distances section
   - Update price for a distance
   - Update capacity
   - Save changes
   - ✅ Verify: Changes saved
   - ✅ Verify: Public page shows updated price
   - ✅ Verify: Audit log entry

3. **Edit FAQ**
   - Navigate to `/en/dashboard/events/[eventId]/faq`
   - Add new FAQ item
   - Edit existing FAQ item
   - Reorder FAQ items (drag/drop or arrows)
   - Delete FAQ item
   - Save changes
   - ✅ Verify: Changes reflected on public page
   - ✅ Verify: Audit log entries

4. **Pause/Unpause Registration**
   - Find pause registration control
   - Toggle pause ON
   - ✅ Verify: Status updates
   - ✅ Verify: Public page shows "Paused"
   - ✅ Verify: Audit log entry
   - Toggle pause OFF
   - ✅ Verify: Registration reopens
   - ✅ Verify: Audit log entry

---

## Edge Cases & Error Handling

### Test 11: Slug Uniqueness

**Steps:**
1. Create event with slug `test-event-2026`
2. Try to create another event with same slug
3. ✅ Verify: Validation error shown
4. ✅ Verify: Error message helpful ("Slug already exists")
5. Try with different casing: `TEST-EVENT-2026`
6. ✅ Verify: Still rejected (case-insensitive check)

---

### Test 12: Timezone Display

**Steps:**
1. Create event with timezone: `America/New_York`
2. Set registration closes: `2026-06-15 23:59:00`
3. View public event page from Mexico timezone
4. ✅ Verify: Time displayed correctly adjusted for viewer's timezone OR shown as "11:59 PM EDT" with timezone label
5. Verify registration actually closes at correct UTC moment

---

### Test 13: Permission Boundaries

**Prerequisites:** Multiple organizations exist

**Steps:**
1. Sign in as organizer for Org A
2. Create event in Org A
3. Sign out, sign in as organizer for Org B
4. Try to access Org A's event via direct URL
5. ✅ Verify: Access denied or redirected
6. Try to make API call to edit Org A's event
7. ✅ Verify: 403 Forbidden response

---

## Summary Checklist (Quick Smoke Test)

If time is limited, run this minimal flow:

- [ ] Sign in as organizer
- [ ] Create new organization
- [ ] Create new event with 1 distance
- [ ] Add FAQ items
- [ ] Save as draft
- [ ] Publish event
- [ ] Verify event appears in `/events` directory
- [ ] Click into event page - verify all content displays
- [ ] Sign in as athlete
- [ ] Complete registration flow
- [ ] Verify registration appears in organizer dashboard
- [ ] Test pause/unpause registration
- [ ] Verify non-organizer cannot access dashboard
- [ ] Check audit log has entries (database)
- [ ] Verify SEO meta tags on public pages
- [ ] Test capacity enforcement (set to 1, fill, verify blocks 2nd)

---

## Test Accounts Summary

| Role | Email | Password | Purpose |
|------|-------|----------|---------|
| Organizer | jetsam-elector92@icloud.com | rungomxpassword | Event creation & management |
| Athlete | hiss-cheek9l@icloud.com | rungomxpassword | Registration testing |

---

## Notes for Developers

1. **Audit Logging:** Check `audit_logs` table after each organizer action to ensure entries are being created correctly.

2. **Capacity Enforcement:** Critical that this is enforced at database/transaction level, not just UI. Test with concurrent registrations.

3. **Timezone Handling:** Verify registration open/close times work correctly across timezones.

4. **SEO:** All public event pages should have proper meta tags, canonical URLs, and be included in sitemap when published.

5. **Permission Guards:** All organizer server actions must check org membership and role permissions.

6. **Waiver Metadata:** Ensure IP address, user agent, and timestamp are captured for all waiver acceptances.

---

## Automated Test Results (Playwright)

### ✅ Tests Passed

**Test 1: Unauthenticated Access Control**
- Navigated to `/en/dashboard/events` without authentication
- ✅ System correctly redirected to `/en/sign-in?callbackURL=%2Fdashboard`
- ✅ Callback URL preserved for post-login redirect

**Test 2: Organizer Authentication**
- Filled email: `jetsam-elector92@icloud.com`
- Filled password: `rungomxpassword`
- Clicked "Sign In" button
- ✅ Successfully authenticated
- ✅ Redirected to `/en/dashboard`
- ✅ Dashboard page loaded with organizer session

**Test 3: Profile Completion Flow Triggered**
- Attempted to navigate to `/en/dashboard/events/new`
- ✅ System detected incomplete profile
- ✅ Profile completion modal appeared with required fields:
  - Phone ✅
  - Date of birth ✅ (successfully filled: January 15, 1990 using date picker)
  - City ✅ (prefilled: Mexico City)
  - State ✅ (prefilled: CDMX)
  - Emergency contact ✅ (prefilled: Jane Doe)
  - Emergency phone ✅
  - Optional fields: Gender, Shirt size, Blood type, Bio

**Test 4: Public Events Directory**
- Navigated to `/en/events` (public page)
- ✅ Page loaded successfully
- ✅ Empty state displayed: "No events yet"
- ✅ Filters rendered correctly:
  - Sport type dropdown (All sports, Trail Running, Triathlon, etc.)
  - State dropdown (All Mexican states)
  - Search textbox
- ✅ Page accessible without authentication

### ⚠️ Blockers Encountered

**BLOCKER: Custom Phone Input Component**
- **Issue**: The phone input component uses a custom implementation that's difficult to automate with Playwright
- **Impact**: Cannot complete organizer profile programmatically
- **Attempted Solutions**:
  - Direct input filling via Playwright selectors
  - DOM manipulation via `page.evaluate()`
  - Clicking on elements and keyboard input
  - Targeting by role, placeholder, text content
- **Result**: Phone validation prevents form submission
- **Workaround**: Manual profile completion required before automated tests can continue

### ⏸️ Tests Blocked by Profile Completion

The following tests cannot proceed until the organizer profile is completed:

1. **Event Creation Flow** - Requires accessing `/dashboard/events/new`
2. **Event Publishing** - Dependent on event creation
3. **Event Discovery with Data** - Requires published events
4. **Registration Flow** - Requires published event
5. **Organizer Registration Management** - Requires registrations to exist
6. **All Edge Case Tests** - Require functional event creation

### 📋 Next Steps

1. **Manual Action Required**: Complete the organizer profile for `jetsam-elector92@icloud.com`
   - Fill phone number (e.g., 5512345678)
   - Fill emergency phone (e.g., 5587654321)
   - Save profile

2. **Resume Automation**: After profile completion, continue with:
   - Organization creation
   - Event creation with distances and FAQ
   - Event publishing
   - Public event page verification
   - Athlete registration flow
   - Pause/unpause functionality
   - Capacity enforcement
   - Edge case testing

## Test Results Summary

| Phase | Test | Status | Notes |
|-------|------|--------|-------|
| Phase 0 | Non-auth access blocked | ✅ PASSED | Correctly redirects to sign-in |
| Phase 0 | Organizer authentication | ✅ PASSED | Sign-in flow works correctly |
| Phase 0 | Profile completion trigger | ✅ PASSED | Modal appears for incomplete profiles |
| Phase 0 | Public events page accessible | ✅ PASSED | Page loads with filters (empty state) |
| Phase 1 | Event creation flow | ⚠️ BLOCKED | Requires profile completion |
| Phase 1 | Event discovery & filtering | ⏳ PENDING | Requires published events |
| Phase 1 | Public event page | ⏳ PENDING | Requires published event |
| Phase 1 | Registration happy path | ⏳ PENDING | Requires published event |
| Phase 1 | Registration blocking | ⏳ PENDING | Requires published event |
| Phase 1 | Organizer management | ⏳ PENDING | Requires registrations |
| Edge Cases | Capacity race conditions | ⏳ PENDING | Requires events with capacity |
| Edge Cases | Permission boundaries | ⏳ PENDING | Requires multi-org setup |

### Automation Coverage

- **Automated**: 4/12 tests (33%)
- **Blocked**: 1 test (profile completion)
- **Pending**: 7 tests (dependent on blocker resolution)

### Technical Notes for Developers

**Phone Input Component Issue:**
The current phone input implementation doesn't expose standard HTML input elements that can be easily automated. Consider:
- Adding `data-testid` attributes for test automation
- Ensuring input elements are accessible via standard Playwright selectors
- Testing with standard `<input type="tel">` elements instead of custom components
- Or documenting the component's test automation approach

---

**Next Steps:**
1. Complete manual tests listed above
2. Document any bugs or issues found
3. Create GitHub issues for any failures
4. Consider adding automated E2E tests using Playwright or Cypress for regression testing
