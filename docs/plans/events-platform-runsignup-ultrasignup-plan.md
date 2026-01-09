# Events Platform Implementation Plan (RunSignup + UltraSignup inspired)

## 1. Executive summary (what we are building, who it serves, what’s in/out of scope)

We are building an “events platform” inside our existing Next.js 16 app that supports:

- Organizer/admin event creation and configuration (events + distances/races + pricing + capacity + website content). In RunGoMx terminology, organizers are “Directors”.
- Public event discovery (directory/search with filters).
- Public “event websites” on our domain (event landing pages + subpages).
- Participant registration workflows (payment-ready UX, but no real payment integration yet).

This plan is **strictly limited to Events** (creation, discovery, event pages, registration, capacity basics, and policy placeholders for refunds/transfers/deferrals). It intentionally excludes offline support, race-day ops, timing/results, fundraising/clubs/social, and other advanced ops features.

## 2. Research findings (with citations/links)

### Event Setup (organizer/admin)

**RunSignup**

- RunSignup positions setup as a “wizard + race dashboard” for simple to multi-day events with multiple course/registration options. (https://info.runsignup.com/products/registration/)
- RunSignup supports strong pricing strategies, including **early-bird discounting with price increases based on date or number of registrations**, team discounts, age-based discounts, and coupon codes. (https://info.runsignup.com/products/registration/)
- RunSignup waivers can be configured as **up to three waivers**, where the **first waiver appears on the first registration page** and additional waivers on subsequent pages; waivers are stored with **date/time and IP address** and visible per registration record. (https://info.runsignup.com/2021/11/17/multiple-waivers/)
- RunSignup distinguishes **“Add-ons” (during registration)** from a **standalone race store** (outside registration). (https://info.runsignup.com/2025/12/22/store-vs-add-ons/)

**UltraSignup**

- UltraSignup’s “Creating a New Event” doc emphasizes required setup inputs (website/FB page, description, pricing, registration details) and explicitly calls out trail/ultra-specific content that should be included in descriptions such as **course description, cutoffs, aid station info, packet pickup, start times, refund policy, swag**. (https://help.ultrasignup.com/hc/en-us/articles/30339236980365-Creating-a-New-Event)
- UltraSignup’s setup checklist (“Quick Start”) indicates registration won’t open without **waiver, location, and pricing**, and highlights configuration areas for photos, location, payments, description, questions, add-ons, capacity, and order edits. (https://help.ultrasignup.com/hc/en-us/articles/30339286849805-Quick-Start-Complete-Your-Event-Setup)
- UltraSignup distance setup expects “distances” as discrete offerings; it documents constraints like **no duplicate distances** (must alter numeric distance and use a label to differentiate). (https://help.ultrasignup.com/hc/en-us/articles/30339201314061-Add-Another-Distance)
- UltraSignup capacity can be set **across all distances** or **per distance**, and waitlist can be enabled when filled (observed; we will not implement waitlist operations in this plan). (https://help.ultrasignup.com/hc/en-us/articles/30339258356877-Set-Your-Capacity)
- UltraSignup pricing supports **up to three tiers** directly (0/1/2 price changes), supports special pricing labels (member/youth), and documents taxes/fees behavior. (https://help.ultrasignup.com/hc/en-us/articles/30339226191245-Event-Pricing-Setup)

### Event Website (public event pages)

**RunSignup**

- RunSignup event websites can expose **multiple “events” (distance options)** under one race with distinct “Register” CTAs and their own subpages (example menu shows separate sections for a 5K, a fun run, and a virtual category). (https://runsignup.com/Race/VA/Ashburn/NewDayNewYear5k10k)
- RunSignup “Event Info” pages show each distance/event’s **price (race fee + signup fee)**, registration end time, and a “Registration Details” block with registration start/end and price. (https://runsignup.com/Race/Events/FL/Miami/LotusFlowerRun)
- RunSignup publicly displays capacity messaging like “Registration Limit: 5 spots left.” (https://runsignup.com/Race/Events/NJ/Hillsborough/TheResolutionRun5K)
- RunSignup exposes a dedicated “Refund Policy” page per race (example shows “Refunds are not allowed for this race.”). (https://runsignup.com/Race/176380/RefundPolicy)

**UltraSignup**

- UltraSignup event pages emphasize trail/ultra-specific information in-page: **Description & Terrain**, awards, aid station details, parking, packet pickup/race-day details, and include explicit **course composition and elevation gain** in the description. (https://ultrasignup.com/register.aspx?eid=19181)
- UltraSignup pages can include “Course Information” links like **Aid Station Distances and Cutoffs** and **Elevation Profiles**, plus start times per distance and an explicit race capacity across distances. (https://ultrasignup.com/register.aspx?eid=13825)
- UltraSignup event pages show registration status and capacity signals such as **sold out + waitlist**, including “Waitlist NO CHARGE” (presence only; not implementing waitlist ops here). (https://ultrasignup.com/register.aspx?eid=19181)

### Registration (participant UX)

**RunSignup**

- RunSignup registration begins by identifying “Who are you registering?” with options including **Me (18+), Other Adult (18+), Minor (Under 18)** and includes explicit parental consent messaging for under-13 data collection. (https://runsignup.com/Race/Register/?raceId=90618&eventId=1076439)
- RunSignup supports multiple waivers and stores waiver acceptance details (including IP). (https://info.runsignup.com/2021/11/17/multiple-waivers/)
- RunSignup supports add-ons during registration vs separate store. (https://info.runsignup.com/2025/12/22/store-vs-add-ons/)

**UltraSignup**

- UltraSignup registration flow (as observed) includes:
  - Selecting a distance/registration option on the event page (price + all-in total). (https://ultrasignup.com/register.aspx?eid=2483)
  - Choosing **Login vs Register as Guest**. (https://ultrasignup.com/members/login.aspx?ReturnUrl=%2fregistration_step0.aspx%3fdid%3d134389%26ci%3d10779327)
  - Step 0 captures required personal info including **birth date**, **gender identity** (Man/Woman/Non-binary), **results division** (Men/Women) with a “backup division” note, contact phone, address, and emergency contact info. (https://ultrasignup.com/registration_step0.aspx?did=134389&ci=10779327)
  - Step 2 includes a **waiver block + required initials**, custom questions, and add-on style selections (e.g., shirt choice with price deltas). (https://ultrasignup.com/registration_step2.aspx?did=134389&ci=10779387)
  - Cart shows a clear **platform fee breakdown**, coupon entry, gift card fields, and checkout CTA. (https://ultrasignup.com/shopping_cart.aspx)
- UltraSignup add-ons can be associated with a distance, can have option-level pricing, quantity (1–5), tax type, pickup/shipping, and can be shown during registration and/or on a shopping page; exports exist for add-on sales. (https://help.ultrasignup.com/hc/en-us/articles/30339240810509-Creating-Add-Ons)

### Discovery/Search (public directory + filters)

**RunSignup**

- RunSignup “Find an Event” directory shows filters such as **Race Name, Distance, Event Type, Location/State/Zip, Date range, Virtual**. (https://runsignup.com/Races)

**UltraSignup**

- UltraSignup event search supports location search + map/grid view and filters including:
  - Only open events / show past events / only virtual events. (https://ultrasignup.com/events/search.aspx)
  - Distance radius (25/50/100/200/300/500 miles), month filter, and coarse difficulty/distance/duration buckets. (https://ultrasignup.com/events/search.aspx)
  - The search UI loads events via a “closest events” service endpoint with parameters for open/past/virtual + lat/lng + radius + months. (https://ultrasignup.com/js/usu.events.search.js?v=5.7)

### Terminology notes (as used by RunSignup vs UltraSignup)

- **RunSignup**
  - “Race” ≈ top-level event website / listing (e.g., /Race/…).
  - “Event Info” ≈ the set of distance options within a race; each has a distinct “Sign Up” CTA and pricing. (https://runsignup.com/Race/Events/FL/Miami/LotusFlowerRun)
  - “Add-ons” = optional items selected during registration; “Store” = standalone purchases outside registration. (https://info.runsignup.com/2025/12/22/store-vs-add-ons/)
- **UltraSignup**
  - “Event” appears as top-level entity with multiple “Distances” (displayed on event pages). (https://ultrasignup.com/register.aspx?eid=13825)
  - Registration flow uses “Gender” and also “Division” selection (results division) with a note about backup division for non-binary. (https://ultrasignup.com/registration_step0.aspx?did=134389&ci=10779327)
- **RunGoMx (product terminology)**
  - “Director” = “Organizer” (race director / event organizer). This plan uses “Organizer” in the research-derived sections, but director-facing features map 1:1 to “Organizer”.

### Patterns worth copying vs patterns to avoid

**Copy (high value, observed)**

- Configurable **multi-distance** events with clear per-distance registration CTAs. (RunSignup: https://runsignup.com/Race/VA/Ashburn/NewDayNewYear5k10k, UltraSignup: https://ultrasignup.com/register.aspx?eid=13825)
- Trail/ultra event pages emphasizing **terrain/course, elevation gain, aid station info, cutoffs, packet pickup, start times, capacity**. (https://ultrasignup.com/register.aspx?eid=19181, https://ultrasignup.com/register.aspx?eid=13825)
- Pricing clarity:
  - RunSignup’s explicit price schedule (“registration starting/ending/price”) per distance. (https://runsignup.com/Race/Events/FL/Miami/LotusFlowerRun)
  - UltraSignup’s all-in totals + platform fee breakdown in cart. (https://ultrasignup.com/shopping_cart.aspx)
- Waiver capture with **timestamp/IP + stored acceptance record**. (RunSignup: https://info.runsignup.com/2021/11/17/multiple-waivers/, UltraSignup: https://ultrasignup.com/registration_step2.aspx?did=134389&ci=10779387)
- Add-ons as structured, distance-scoped options with price deltas and exportability. (RunSignup: https://info.runsignup.com/2025/12/22/store-vs-add-ons/, UltraSignup: https://help.ultrasignup.com/hc/en-us/articles/30339240810509-Creating-Add-Ons)

**Avoid / treat carefully**

- Overloading one model to cover _everything_ on day 1 (UltraSignup docs imply many advanced ops knobs—order edits, auto credits, etc.). We should stage intentionally and keep domains separated. (https://help.ultrasignup.com/hc/en-us/articles/30339286849805-Quick-Start-Complete-Your-Event-Setup)
- “Hard-coded” page layouts that prevent organizer-controlled content and trail-specific metadata; both platforms rely heavily on organizer-provided description content. (https://help.ultrasignup.com/hc/en-us/articles/30339236980365-Creating-a-New-Event)

### RunGoMx customer call requirements (additions beyond RunSignup/UltraSignup research)

These items come from customer discovery (not from RunSignup/UltraSignup research) and should shape RunGoMx’s roadmap:

- Discovery/search must include filters for: **type/sport**, **month**, **distance(s)**, **state/region**, and a **map view**.
- Supported sport types should include: **Trail Running, Triathlon, Cycling, MTB, Gravel Bike, Duathlon, Backyard Ultra**.
- Two primary user groups: **Athletes** and **Directors** (organizers), with public pages plus dedicated director/athlete areas.
- Event creation requirements: event type, multiple distances, **cost per distance**, address/location, date(s), description, add-ons (shirts with size/type), refund deadline (if allowed), “convocatoria” PDF, external event URL, and a unique public event URL in our domain.
- Event/registration statuses: Created/Draft, Registration Open, Paused, Registration Closed (registration open/close must be automated by dates, with a manual pause override).
- Discount coupons: name/code, percentage, limited number of uses, per-event scope; create/delete/manage.
- Group registrations: Excel upload/download; group discount rules; group payer flow (details need confirmation).
- Payments/fees readiness: platform administrative fee charged to athletes; payout details for directors (RFC + transfer details) stored for future payment integration.
- Non-goals for this plan (still out of scope): public results registry, rankings, and analytics dashboards (capture as follow-up plans).

## 3. Feature parity matrix (table)

Legend for RunGoMx column: **v1** (must-have), **v2** (next), **v3** (later) — phased by user value + implementation risk.

| Capability (in scope)                                                 | RunSignup                                                                                                                                                                                         | UltraSignup                                                                                                                                                                         | RunGoMx           | Notes                                                                                                                      |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Public event directory + filters                                      | Yes (distance/type/date/virtual) (https://runsignup.com/Races)                                                                                                                                    | Yes (location + open/past/virtual + difficulty/distance/duration buckets) (https://ultrasignup.com/events/search.aspx)                                                              | v1                | Start with location/date/distance/format; add difficulty/duration buckets later if needed.                                 |
| Map-based discovery                                                   | Not observed on RunSignup directory                                                                                                                                                               | Yes (map view) (https://ultrasignup.com/events/search.aspx)                                                                                                                         | v2                | We already have location search APIs; map view can be optional.                                                            |
| Multi-distance events (one event, many distances)                     | Yes (multiple events under race) (https://runsignup.com/Race/VA/Ashburn/NewDayNewYear5k10k)                                                                                                       | Yes (50K/35K/Half/8K, etc.) (https://ultrasignup.com/register.aspx?eid=13825)                                                                                                       | v1                | Core to parity; implement as EventEdition → Distances.                                                                     |
| Distance-specific start times                                         | Needs confirmation (not observed in sampled RunSignup event pages) (https://runsignup.com/Race/VA/Ashburn/NewDayNewYear5k10k)                                                                     | Yes (https://ultrasignup.com/register.aspx?eid=13825)                                                                                                                               | v2                | v1 can store one start time per distance; per-wave later.                                                                  |
| Trail/ultra metadata (terrain, elevation gain, aid stations, cutoffs) | Not strongly surfaced in RunSignup examples; mostly in website pages                                                                                                                              | Explicitly emphasized (https://ultrasignup.com/register.aspx?eid=19181, https://ultrasignup.com/register.aspx?eid=13825)                                                            | v2                | v1 supports freeform content blocks; v2 adds structured fields (elevationGain, cutoff, aidStations) to improve filters/UX. |
| Registration open/close windows                                       | Yes (registration ends shown) (https://runsignup.com/Race/Events/FL/Miami/LotusFlowerRun)                                                                                                         | Yes (registration closes shown) (https://ultrasignup.com/register.aspx?eid=19181)                                                                                                   | v1                | Needed for “open events” filter.                                                                                           |
| Pricing tiers (date-based)                                            | Yes (price schedule shown; early/normal tiers visible in page schema) (https://runsignup.com/Race/Events/FL/Miami/LotusFlowerRun, https://runsignup.com/Race/Events/OH/Troy/WorldRaceforHopeTroy) | Yes (up to 3 tiers documented) (https://help.ultrasignup.com/hc/en-us/articles/30339226191245-Event-Pricing-Setup)                                                                  | v2                | v1 can show single price; v2 adds tier model + “next price increase” banner.                                               |
| Fees/taxes visibility                                                 | RunSignup shows signup fee + race fee (https://runsignup.com/Race/Events/FL/Miami/LotusFlowerRun)                                                                                                 | UltraSignup shows all-in total + platform fee in cart (https://ultrasignup.com/shopping_cart.aspx)                                                                                  | v2                | Even without payments, compute totals and show “payment placeholder”.                                                      |
| Waiver (single + acceptance stored)                                   | Yes (first page waiver; stored with IP) (https://info.runsignup.com/2021/11/17/multiple-waivers/)                                                                                                 | Yes (waiver + required initials) (https://ultrasignup.com/registration_step2.aspx?did=134389&ci=10779387)                                                                           | v1                | Start with one waiver per edition; store acceptance metadata; v2 can support multiple waivers per distance.                |
| Registration custom questions                                         | Yes (documented flexibility) (https://info.runsignup.com/products/registration/)                                                                                                                  | Yes (questions in registration step) (https://ultrasignup.com/registration_step2.aspx?did=134389&ci=10779387)                                                                       | v2                | Model as typed questions with answers; avoid over-generalizing early.                                                      |
| Add-ons (shirts/merch/donations concept)                              | Yes (add-ons during registration) (https://info.runsignup.com/2025/12/22/store-vs-add-ons/)                                                                                                       | Yes (distance-scoped, qty 1–5, taxes, export) (https://help.ultrasignup.com/hc/en-us/articles/30339240810509-Creating-Add-Ons)                                                      | v2                | v1 can stub the data model; v2 implements selection + totals.                                                              |
| Capacity (per distance + across distances)                            | Yes (“spots left” messaging) (https://runsignup.com/Race/Events/NJ/Hillsborough/TheResolutionRun5K)                                                                                               | Yes (documented; waitlist optional) (https://help.ultrasignup.com/hc/en-us/articles/30339258356877-Set-Your-Capacity)                                                               | v1                | Basic full vs available; enforce transactionally; waitlist deferred (observe only).                                        |
| Waitlist                                                              | Mentioned on RunSignup product page; observed on UltraSignup pages (https://ultrasignup.com/register.aspx?eid=19181)                                                                              | Yes (https://help.ultrasignup.com/hc/en-us/articles/30339258356877-Set-Your-Capacity)                                                                                               | v3 (deferred ops) | Keep data model hooks; do not implement ops tooling in this plan.                                                          |
| Refund policy page/section (config placeholder)                       | Yes (dedicated refund policy page) (https://runsignup.com/Race/176380/RefundPolicy)                                                                                                               | Emphasized as clarity in waiver/description (https://help.ultrasignup.com/hc/en-us/articles/30339325581197-Refund-Policy-Making-Things-Crystal-Clear)                               | v1                | Store policy text + flags only; no automation.                                                                             |
| Transfer policy placeholder (config only)                             | Documented/mentioned as capability in product copy (https://info.runsignup.com/products/registration/)                                                                                            | Documented bib transfer workflow (https://help.ultrasignup.com/hc/en-us/articles/30339234344973-Set-Up-Bib-Transfer-Option)                                                         | v3 (config only)  | Model policy + deadlines; do not implement full transfer ops yet.                                                          |
| Deferral/credit policy placeholder (config only)                      | Mentioned as capability in product copy (https://info.runsignup.com/products/registration/)                                                                                                       | Credits/rollovers documented (https://help.ultrasignup.com/hc/en-us/articles/30339290435213-Creating-and-Applying-Rollover-Credits)                                                 | v3 (config only)  | Model “credit policy” config and future hooks; do not implement rollover operations.                                       |
| Organizer view registrations + export                                 | Documented reporting/export (https://info.runsignup.com/products/registration/)                                                                                                                   | Cart/registration data implies exportability; add-on exports documented (https://help.ultrasignup.com/hc/en-us/articles/30339240810509-Creating-Add-Ons)                            | v2                | v1 includes basic list; v2 includes CSV export.                                                                            |
| Multiple participants in one transaction                              | RunSignup supports multi-person/team patterns (https://info.runsignup.com/products/registration/)                                                                                                 | Documented “Allow Adds” multi-participant per order (https://help.ultrasignup.com/hc/en-us/articles/35929083830285-How-Do-I-Allow-Multiple-Runner-Registrations-in-One-Transaction) | v3                | v1 assumes one registrant per registration; design data model to extend.                                                   |
| Sport/event type taxonomy + filter (Trail, Triathlon, Cycling, MTB, Gravel, Duathlon, Backyard) | RunSignup includes an “Event Type” filter (taxonomy differs) (https://runsignup.com/Races) | Not observed as an explicit sport taxonomy in search UI | v1 | RunGoMx requirement; store `sportType` and filter (multi-select). |
| Month filter in discovery                                              | Date range filters exist (https://runsignup.com/Races)                                                                                                                                           | Month filter exists (https://ultrasignup.com/events/search.aspx)                                                                                                                   | v1                | Implement as a month bucket derived from `startsAt` (plus “next 30/60/90 days” later if needed).                            |
| State/region filter in discovery                                       | Location/State/Zip filter exists (https://runsignup.com/Races)                                                                                                                                   | Location search exists; region filter not clearly observed (https://ultrasignup.com/events/search.aspx)                                                                            | v1                | RunGoMx requirement; support Mexico states; also support “near me” + radius.                                               |
| Registration pause (manual override)                                   | Needs confirmation                                                                                                                                                                                | Needs confirmation                                                                                                                                                                 | v1                | Director can pause/unpause without unpublishing; public page stays visible with “Registration paused”.                      |
| FAQ / Q&A section (editable, prominent)                                | Content pages/menus vary by event; FAQ not confirmed in sampled pages                                                                                                                             | FAQ not confirmed in sampled pages                                                                                                                                                 | v1                | Must not regress: structured Q&A editor + public rendering; keep separate from generic website CMS blocks.                  |
| External event URL                                                     | Not observed as a first-class field                                                                                                                                                               | Not observed as a first-class field                                                                                                                                                | v1                | RunGoMx requirement; store and render as “Official event site” link (new tab).                                              |
| “Convocatoria” / race packet PDF attachment                            | Not observed                                                                                                                                                                                      | Not observed                                                                                                                                                                        | v2                | RunGoMx requirement; attach as Media (PDF) and link from event page + registration confirmation.                            |
| Discount coupons (percent off, limited uses, per-event)                | Yes (coupon codes) (https://info.runsignup.com/products/registration/)                                                                                                                           | Coupon entry exists in cart UI (https://ultrasignup.com/shopping_cart.aspx)                                                                                                        | v2                | Start with percent-off + max redemptions + active; apply to base price + add-ons later; clarify group behavior.             |
| Group registrations (Excel import/export, group discounts)             | Group/team patterns exist (https://info.runsignup.com/products/registration/)                                                                                                                     | Multi-runner per transaction documented (https://help.ultrasignup.com/hc/en-us/articles/35929083830285-How-Do-I-Allow-Multiple-Runner-Registrations-in-One-Transaction)            | v3                | RunGoMx requirement; needs payer/identity rules; implement after single-runner flow is solid.                               |
| Director payout profile (RFC + payout destination)                     | Not a public flow                                                                                                                                                                                 | Not a public flow                                                                                                                                                                   | v2 (data only)     | Store fiscal/payout fields for future payment integration; no transfers until payments plan.                                |
| Unique public event ID/code                                            | Not observed                                                                                                                                                                                      | Not observed                                                                                                                                                                        | v1                | Generate a short stable code per edition for support, exports, and future results uploads.                                  |

## 4. Phased delivery plan (Phase 0..3)

### Phase 0 — Foundations (data + permissions + scaffolding)

#### Scope

- Establish core **events domain** boundaries and primitives (Events vs Registrations vs WebsiteContent).
- Add organization + organizer membership model (org-scoped roles) aligned with our existing global roles/permissions.
- Add event core entities (EventSeries/EventEdition, Distance, PricingTier skeleton, WebsiteContent skeleton, Registration skeleton).
- Add audit logging primitives for event configuration changes.
- Gate everything behind a feature flag (env) or “internal-only” permission until Phase 1 is ready.

#### User value

- No end-user value yet; enables safe incremental delivery without rework.

#### Data model changes (high-level)

- Introduce:
  - `Organization`
  - `OrganizationMembership` (role: Owner/Admin/Editor/Viewer)
  - `EventSeries` + `EventEdition`
  - `EventDistance`
  - `PricingTier` (schema only; no UI yet)
  - `EventWebsiteContent` + `Media`
  - `Registration` + `Registrant` (minimal)
  - `Waiver` + `WaiverAcceptance` (minimal)
  - `AuditLog`

#### API surface

- Add internal-only server actions for:
  - Create org, invite members (or seed via admin).
  - Create draft event series + first edition.
- Add internal-only APIs for event lookups and slug collision checks.

#### UI pages

- Internal-only organizer shell pages (placeholders):
  - `/[locale]/dashboard/events` (empty state)
  - `/[locale]/dashboard/events/new` (stub)

#### Edge cases

- Role model alignment: existing global role `external.organizer` grants access to organizer area; org membership controls _which_ org’s events a user can manage.
- Ensure internal users (admin/staff) can access all orgs for support (consistent with `canManageEvents` in `lib/auth/roles.ts`).

#### Acceptance criteria

- A user with `external.organizer` can access organizer shell (behind flag).
- Non-organizers cannot access organizer routes (server redirect + server-action guards).
- Audit log entries are written for event create/update actions (even if minimal fields).

### Phase 1 — Events MVP (create + publish + discover + register with payment placeholder)

#### Scope

- Organizer can create and publish a basic event edition with:
  - Name, slug, description, hero image (optional), location, timezone.
  - Sport/event type (RunGoMx taxonomy: Trail Running, Triathlon, Cycling, MTB, Gravel Bike, Duathlon, Backyard Ultra).
  - External event URL (optional) for “official site” linking.
  - Registration open/close window (and “registration closes” display parity with UltraSignup). (https://ultrasignup.com/register.aspx?eid=19181)
  - Manual “registration paused” override (does not unpublish the event; blocks new registrations).
  - At least one distance with price (single price only in v1).
  - Capacity (per distance OR across all distances) and “sold out / spots left” messaging. (https://runsignup.com/Race/Events/NJ/Hillsborough/TheResolutionRun5K, https://help.ultrasignup.com/hc/en-us/articles/30339258356877-Set-Your-Capacity)
  - Prominent Q&A/FAQ section (structured items) editable by the organizer (non-negotiable for RunGoMx; keep even as website CMS expands in Phase 2).
  - Unique public event code/ID (short stable identifier for support + exports; future results uploads).
- Public:
  - Event directory/search with basic filters (type/sport, month, distance range, state/region, open-only, virtual/in-person, plus “near me” location search). (https://runsignup.com/Races, https://ultrasignup.com/events/search.aspx)
  - Event website page with core information + register CTA.
- Registration:
  - Account-required registration (consistent with our existing auth baseline); guest registration is planned for v3 (UltraSignup supports guest). (https://ultrasignup.com/members/login.aspx?ReturnUrl=%2fregistration_step0.aspx%3fdid%3d134389%26ci%3d10779327)
  - Collect required participant info (prefill from `profiles` table when available) and store per-registration snapshot:
    - First/last name, date of birth, phone, email, sex/gender, city/state, emergency contact name + phone.
  - Capture waiver acceptance (single waiver per edition) with timestamp + IP/user-agent (parity with RunSignup/UltraSignup). (https://info.runsignup.com/2021/11/17/multiple-waivers/, https://ultrasignup.com/registration_step2.aspx?did=134389&ci=10779387)
  - Compute totals and show a “payment step placeholder” with a PaymentPending state (no real payment).

#### User value

- Organizers can publish events and accept registrations (even without payments), enabling end-to-end UX validation and early SEO/discovery footprint.

#### Data model changes

- Finalize v1 fields on:
  - `EventSeries`: `sportType` (or equivalent taxonomy field).
  - `EventEdition`: `status`, `publishedAt`, `unlistedAt` (optional), `startsAt`, `endsAt`, `timezone`, `registrationOpensAt`, `registrationClosesAt`, `locationDisplay`, `latitude/longitude` (optional), `city/state/country`.
  - `EventEdition`: `externalUrl` (optional), `publicCode` (unique short ID), `isRegistrationPaused` (or `registrationPausedAt`).
  - `EventFaqItem`: `editionId`, `question`, `answer`, `sortOrder`, `updatedAt`.
  - `EventDistance`: `label`, `distanceValue` + `distanceUnit`, `startTimeLocal` (optional), `capacity`, `isVirtual`.
  - `Registration`: `status`, `distanceId`, `userId`, `totals`.
  - `WaiverAcceptance`: `acceptedAt`, `ipAddress`, `userAgent`, `signatureType` (checkbox vs initials), `signatureValue`.

#### API surface

- **Organizer server actions** (guarded by org membership + `canManageEvents`):
  - Create/update event edition basics
  - Update registration pause state
  - Add/update distance
  - Update capacity settings (across vs per-distance)
  - Upsert Q&A/FAQ items
  - Publish/unpublish/archive
- **Public route handlers**:
  - `GET /api/events/search` for directory filtering (server-side query backed by DB + optional caching).
- **Registration server actions**:
  - Start registration (creates `Registration: Started`)
  - Submit participant info + waiver acceptance (moves to `Submitted` or `PaymentPending` depending on flow)

#### UI pages

- Organizer
  - `/[locale]/dashboard/events` (list + “Create event”)
  - `/[locale]/dashboard/events/new` (simple wizard: basics → distance → publish)
  - `/[locale]/dashboard/events/[eventId]/settings` (basics, capacity, waiver, policies placeholder)
  - `/[locale]/dashboard/events/[eventId]/faq` (Q&A editor; can later live under Website in Phase 2, but must remain supported)
- Public
  - `/[locale]/events` (directory)
  - `/[locale]/events/[slug]` (event website: overview + distances + register)
  - `/[locale]/events/[slug]/register` (registration flow + payment placeholder)

#### Edge cases

- Capacity race conditions: enforce capacity at DB level with transactional checks; do not rely on client-side “spots left” only. (Messaging is public on both platforms.) (https://runsignup.com/Race/Events/NJ/Hillsborough/TheResolutionRun5K)
- Timezone correctness for registration close times shown publicly. (https://ultrasignup.com/register.aspx?eid=19181)
- Minor registration: v1 can block minors or treat as “needs confirmation” until we decide required legal posture; both platforms include minors handling. (RunSignup: https://runsignup.com/Race/Register/?raceId=90618&eventId=1076439)

#### Acceptance criteria

- Organizer can create/publish an event with one distance and see it appear in `/events`.
- Organizer can pause/unpause registration without unpublishing the event; new registrations are blocked while paused.
- Organizer can manage Q&A/FAQ items; public sees them on the event page.
- Public can filter events by type/month/state and open registration.
- Registration creates a stored record with participant snapshot + waiver acceptance metadata.
- Public event page renders SEO metadata and has canonical URLs per locale.

### Phase 2 — Event websites (CMS-like sections) + tiered pricing + add-ons + organizer registrations export

#### Scope

- Event website content becomes organizer-editable, using config-driven sections inspired by observed content patterns:
  - Overview / Description & Terrain (UltraSignup) (https://ultrasignup.com/register.aspx?eid=19181)
  - Course info, elevation profiles/aid stations/cutoffs links (UltraSignup) (https://ultrasignup.com/register.aspx?eid=13825)
  - Packet pickup, parking, schedule (UltraSignup) (https://ultrasignup.com/register.aspx?eid=13825)
  - Per-distance pages/tabs (RunSignup-style) (https://runsignup.com/Race/VA/Ashburn/NewDayNewYear5k10k)
  - RunGoMx-specific attachments: photo gallery + “convocatoria” (race packet) PDF download.
- Pricing tiers:
  - Date-based tiers per distance (v2). (RunSignup: https://runsignup.com/Race/Events/OH/Troy/WorldRaceforHopeTroy, UltraSignup: https://help.ultrasignup.com/hc/en-us/articles/30339226191245-Event-Pricing-Setup)
- Add-ons:
  - Distance-scoped add-ons with option pricing and quantities; show during registration; compute totals. (UltraSignup: https://help.ultrasignup.com/hc/en-us/articles/30339240810509-Creating-Add-Ons, RunSignup: https://info.runsignup.com/2025/12/22/store-vs-add-ons/)
  - RunGoMx priority: shirts as add-ons with size/type variants (modeled via options).
- Discount coupons:
  - Per-event coupon codes (percent off + limited uses) applied at cart/review step. (RunSignup: https://info.runsignup.com/products/registration/, UltraSignup: https://ultrasignup.com/shopping_cart.aspx)
- Director payout profile (data only):
  - Store director fiscal/payout fields needed for future fee transfers (e.g., RFC + payout destination); no money movement in this plan.
- Organizer registrations:
  - Basic registrations list view and CSV export.
  - Basic add-on sales export parity (summary-level). (https://help.ultrasignup.com/hc/en-us/articles/30339240810509-Creating-Add-Ons)

#### User value

- Organizers can build credible event “websites” and registration experiences that match expected ultra/trail needs, improving conversion and reducing support burden.

#### Data model changes

- `EventWebsiteContent`
  - Sections/blocks stored as JSON with a constrained schema (block types + validation).
  - Optional per-locale content variants (start with default locale; expand later).
- `PricingTier`
  - `startsAt`, `endsAt`, `priceCents`, optional `label`.
  - Calculation module to pick current tier + future tier display.
- Add-on entities:
  - `AddOn`, `AddOnOption`, `AddOnSelection`.
  - AddOnOption supports “variant” patterns (e.g., shirt size/type) via option labeling or structured option metadata.
- Discount entities:
  - `DiscountCode` (edition-scoped): `code`, `name`, `percentOff`, `maxRedemptions`, `startsAt`/`endsAt` (optional), `isActive`.
  - `DiscountRedemption` (registration-scoped): `registrationId`, `discountCodeId`, `redeemedAt` (reserve/confirm semantics can be refined later).
- Director payout entities (data only):
  - `OrganizationPayoutProfile`: `orgId`, `legalName`, `rfc`, payout destination fields (structure TBD), `updatedAt`.
- `RegistrationAnswer` / `RegistrationQuestion` (minimal typed questions: text, single-select, checkbox).

#### API surface

- Organizer server actions:
  - Upsert website blocks/sections
  - Upsert pricing tiers
  - Create/edit add-ons and options
  - Export registrations + add-on sales
- Public:
  - Event page reads website content + computed pricing schedule

#### UI pages

- Organizer
  - `/[locale]/dashboard/events/[eventId]/website` (block editor + preview)
  - `/[locale]/dashboard/events/[eventId]/pricing`
  - `/[locale]/dashboard/events/[eventId]/add-ons`
  - `/[locale]/dashboard/events/[eventId]/coupons` (create/disable/delete coupon codes)
  - `/[locale]/dashboard/events/[eventId]/registrations` (+ export)
  - `/[locale]/dashboard/settings/payout` (director payout profile; access restricted to Owner/Admin)
- Public
  - `/[locale]/events/[slug]` with SectionSubnav tabs (reuse `SectionSubnav` component)
  - Optional subpages (rendered from config): `/overview`, `/course`, `/schedule`, `/faq`, `/photos`

#### Edge cases

- Content moderation/security: sanitize rich text (allowlist) to avoid XSS from organizer content.
- Pricing tier overlaps: validate non-overlapping date windows; define tie-break rules.
- Add-on inventory: v2 can ignore stock enforcement; if included, require transactional decrements.

#### Acceptance criteria

- Organizer can build a multi-section event page; public sees updated content with SEO-safe rendering.
- Pricing schedule renders correctly and “next price increase” messaging is accurate.
- Add-ons show in registration and totals update; registration stores selections.
- Organizer can export registrations and add-on sales summary.

### Phase 3 — Series/editions + slug changes + policy configuration (placeholders) + multi-participant orders (optional)

#### Scope

- Event series + edition workflows:
  - “Renew/clone” an event edition into a new year (UltraSignup’s renewal concept is explicit). (https://help.ultrasignup.com/hc/en-us/articles/30339201314061-Add-Another-Distance)
  - Preserve history and avoid breaking URLs via slug redirects.
- Group registrations (RunGoMx):
  - Excel template download + validated Excel upload to create multiple registrations at once (bulk registration).
  - Optional group discount rules (e.g., threshold-based) and coupon applicability (same as individual unless configured otherwise; needs confirmation).
  - Support “guest/batch” participants where some rows may not match an existing account (create registrant records without creating user accounts).
- Policy configuration placeholders:
  - Refund policy text + flags surfaced prominently on event pages and in registration (UltraSignup recommends putting refund policy in waiver/description). (https://help.ultrasignup.com/hc/en-us/articles/30339325581197-Refund-Policy-Making-Things-Crystal-Clear, RunSignup refund page: https://runsignup.com/Race/176380/RefundPolicy)
  - Transfer policy placeholder with deadline (UltraSignup bib transfer workflow reference; config-only here). (https://help.ultrasignup.com/hc/en-us/articles/30339234344973-Set-Up-Bib-Transfer-Option)
  - Deferral/credit policy placeholder (model fields only; no rollover ops). (https://help.ultrasignup.com/hc/en-us/articles/30339290435213-Creating-and-Applying-Rollover-Credits)
- Multi-participant orders (optional v3):
  - Enable one cart to add additional participants (UltraSignup “Allow Adds” concept). (https://help.ultrasignup.com/hc/en-us/articles/35929083830285-How-Do-I-Allow-Multiple-Runner-Registrations-in-One-Transaction)

#### User value

- Organizers can efficiently run annual events without rebuilding; URLs stay stable; policies are clear; optional group registration reduces friction.

#### Data model changes

- `EventSlugRedirect` (fromSlug → toSlug, createdAt, reason).
- `EventEdition` linking to previous edition (for cloning provenance).
- `PolicyConfig` (refund/transfer/deferral) attached to edition; text + deadlines + flags.
- `Order` (if implementing multi-participant) vs keep `Registration` as order with many `Registrants`.
- Group registrations:
  - `GroupRegistrationBatch`: `editionId`, `createdByUserId`, `status` (uploaded/validated/processed/failed), `sourceFileMediaId`, timestamps.
  - `GroupRegistrationBatchRow`: row-level parse + validation results, plus created `registrationId` references.
  - (Optional) `GroupDiscountRule`: edition-scoped configuration (thresholds/percent off); keep simple.

#### API surface

- Organizer server actions:
  - Clone edition
  - Rename event/slug with redirect creation
  - Update policy config (text + dates)
  - (Optional) add participant to existing cart/order
  - Download group registration template (CSV/XLSX) + upload/validate file
  - Process a validated batch into registrations (creates PaymentPending registrations in no-payment mode)

#### UI pages

- Organizer
  - `/[locale]/dashboard/events/[eventId]/editions` (manage editions + clone)
  - `/[locale]/dashboard/events/[eventId]/policies` (refund/transfer/deferral placeholders)
  - `/[locale]/dashboard/events/[eventId]/group-registrations` (download template, upload, validation report, processing)
- Public
  - Redirect handling for old slugs

#### Edge cases

- Slug collisions and SEO duplication across editions: enforce uniqueness per series and handle canonicalization.
- Policy display: ensure policies render consistently across event page and registration confirmations.
- Bulk registration identity matching: define rules for “existing athlete” detection (email + DOB?) and whether to error, skip, or link; avoid accidental duplicates.
- Batch safety: audit log bulk operations; rate-limit uploads; ensure sensitive files are access-controlled and time-limited URLs.

#### Acceptance criteria

- Organizer can clone an edition and publish new year with preserved website structure.
- Slug change creates redirect and keeps canonical correct.
- Policies are configurable and visible (but not operationally automated).
- (Optional) Multi-participant order flow works end-to-end without breaking single-participant registrations.
- Organizer can download a template, upload a file, see row-level validation errors, and process a batch that creates registrations without duplicating existing athletes.

## 5. Architecture overview (modules, boundaries, data flow; aligned with existing codebase patterns)

### Alignment with current repo conventions

- **Routing (Next.js 16 App Router + i18n)**: new pages live under `app/[locale]/(public)/events/*` and organizer pages under `app/[locale]/(protected)/dashboard/*`, using `configPageLocale` and `createLocalizedPageMetadata` as in existing pages (e.g., current `/events` page). (Repo references: `app/[locale]/(public)/events/page.tsx`, `utils/config-page-locale.tsx`, `utils/seo.ts`)
- **Data access + migrations**: use Drizzle ORM against Postgres with the existing pattern in `db/schema.ts`, `db/relations.ts`, and `db/index.ts`; follow the repo’s Drizzle Kit workflow (`drizzle.config.ts`, `pnpm db:generate`, `pnpm db:push`) for schema evolution.
- **Auth + permissions**:
  - Keep using `better-auth` sessions (`lib/auth.ts`, `lib/auth/server.ts`).
  - Reuse existing guard wrappers (`lib/auth/guards.ts`, `lib/auth/action-wrapper.ts`).
  - Extend with org-scoped membership checks, but preserve the current `external.organizer` / `canManageEvents` semantics (`lib/auth/roles.ts`).
- **UI system**: reuse shadcn/Radix components in `components/ui/*`, including `SectionSubnav` (tabs) and `EntityListView` (tables). (`components/ui/section-subnav.tsx`, `components/list-view/entity-list-view.tsx`)
- **Location/search**: reuse existing location APIs for geocoding and location inputs (`app/api/location/*`, `lib/location/*`) to implement event discovery filters.
- **Configuration/feature flags**: follow existing env-driven configuration patterns (e.g., `config/url.ts`, other `process.env.*` usage) to gate organizer/event functionality behind an env flag until Phase 1 is ready.

### Organizer permissions model (explicit; public vs organizer separated)

**Global gate**

- Access to organizer routes requires the existing global organizer role (`external.organizer`) OR an internal staff permission (`canManageEvents`), enforced in route loaders and server action wrappers (`lib/auth/guards.ts`, `lib/auth/action-wrapper.ts`, `lib/auth/roles.ts`).

**Org-scoped membership roles**

- Membership roles apply across all events owned by an Organization (KISS); event-level overrides can be added later if needed.

| Org role | Event config (edit) | Publish/unlist/archive | Registration settings (waiver/questions/add-ons/pricing/capacity/policies) | View registrations (PII) | Export registrations | Manage org members |
| -------- | ------------------- | ---------------------- | -------------------------------------------------------------------------- | ------------------------ | -------------------- | ------------------ |
| Owner    | Yes                 | Yes                    | Yes                                                                        | Yes                      | Yes                  | Yes                |
| Admin    | Yes                 | Yes                    | Yes                                                                        | Yes                      | Yes                  | No                 |
| Editor   | Yes                 | No                     | Yes (except publish/unlist/archive)                                        | No                       | No                   | No                 |
| Viewer   | Read-only           | No                     | Read-only                                                                  | No                       | No                   | No                 |

**Audit logging requirements**

- Write an `AuditLog` entry for every organizer/admin mutation that changes:
  - Event core config (series/edition basics, dates/timezone/location, visibility).
  - Distances, pricing tiers, capacity settings, and registration windows.
  - Registration settings (waiver text/versions, required questions, add-ons, policy text placeholders).
  - Website content blocks and media.
  - Slug changes + redirect creation.
- Also log sensitive _access_ events (at minimum): registrations export (CSV) and bulk downloads of registrant data, because these are PII disclosures.
- Minimum audit fields: `orgId`, `actorUserId`, `action`, `entityType/entityId`, `beforeJson/afterJson` (or a structured diff), `ipAddress`, `userAgent`, and `createdAt`.

### SEO strategy for event websites (plan only; matches existing SEO helpers)

- **Per-event metadata**: generate dynamic metadata from DB fields (edition name/year + location + key distance) and reuse alternates logic from `utils/seo.ts` (`generateAlternateMetadata`) to produce canonical + hreflang; use existing OG image conventions in `utils/metadata.ts` (hero image when present, else default `/og-image.jpg`).
- **Canonical strategy**:
  - Indexable content lives at `/[locale]/events/[slug]` and (if added) distinct content subpages like `/[locale]/events/[slug]/course` should have self-canonicals.
  - Non-index pages (always `noindex`): `/[locale]/events/[slug]/register` and any draft/unlisted previews.
  - Avoid serving the same section content at multiple URLs; if both “tabs” and “subpages” exist, pick one as canonical and 308-redirect the other.
- **Sitemap strategy**: extend `app/sitemap.ts` to include only `Published` (and not `Unlisted`) event pages; exclude `/register` and any non-canonical aliases.
- **Robots**: inherit global rules from `app/robots.ts`; add per-page `robots: { index: false }` metadata for Draft/Unlisted and registration routes.

### Proposed module boundaries (DRY/SOLID/KISS)

**Domain modules (new)**

- `lib/events/*` (event series/editions/distances, publish state, slug redirects, discovery query builder).
- `lib/event-websites/*` (content blocks, validation, rendering adapters; no registration logic).
- `lib/registrations/*` (registration state machine, participant snapshotting, waiver acceptance, add-ons, totals).
- `lib/organizations/*` (org + membership roles, invitations in later plan).
- `lib/audit/*` (audit log append + query).

**Shared abstractions (build early)**

- Pricing calculation: pick current tier + compute displayed totals (base price + platform fee placeholder).
- Validation schema library: Zod schemas per domain (match existing form/action patterns).
- Permissions check helpers: `requireOrgRole(orgId, role)` and `requireEventAccess(eventId, capability)` used by actions and route handlers.

**Avoid premature abstraction**

- Do not build a generic CMS engine; implement a constrained set of event website blocks (Overview, Schedule, Course, FAQ, Media) and expand incrementally.
- Do not implement a generic “workflow engine”; keep registration steps explicit and versioned.

### Data flow (high-level)

- Organizer edits event → server action validates input (Zod) → writes DB changes transactionally → writes AuditLog → revalidate public routes (Next cache invalidation strategy) → public pages read via server components.
- Public search → server-rendered page reads search params → queries DB + optional cache → renders list/cards.
- Registration → stepwise server actions update `Registration` state + persist waiver acceptance/questions/add-ons → compute totals → show payment placeholder.

## 6. Data model (entities + relationships + key fields)

High-level entities (names are conceptual; final naming should match our Drizzle conventions):

- **Organization**
  - `id`, `name`, `slug`, `createdAt`, `updatedAt`
- **OrganizationMembership**
  - `id`, `orgId`, `userId`, `role` (Owner/Admin/Editor/Viewer), `createdAt`
- **EventSeries**
  - `id`, `orgId`, `slug`, `name`, `status` (active/archived), `createdAt`
  - `sportType` (RunGoMx taxonomy; stable across yearly editions)
- **EventEdition**
  - `id`, `seriesId`, `editionLabel` (e.g., “2026”), `startsAt`, `endsAt`, `timezone`
  - `registrationOpensAt`, `registrationClosesAt`
  - `isRegistrationPaused` (or `registrationPausedAt`)
  - `visibility` (draft/published/unlisted/archived)
  - `publicCode` (unique short ID/code)
  - `locationDisplay`, `address`, `city`, `state`, `country`, `lat`, `lng`
  - `externalUrl` (optional “official event site”)
  - `heroImageMediaId` (optional)
  - `convocatoriaPdfMediaId` (optional PDF attachment; or modeled as a website block that references Media)
- **EventDistance**
  - `id`, `editionId`, `label` (e.g., “50K”), `distanceValue`, `distanceUnit` (km/mi)
  - `kind` (distance vs timed), `startTimeLocal`, `timeLimitMinutes` (optional)
  - `terrain` (road/trail/mixed, optional), `isVirtual`
  - `capacity` + `capacityScope` (per distance / shared pool ref)
- **PricingTier**
  - `id`, `distanceId`, `label`, `startsAt`, `endsAt`, `priceCents`, `currency`
- **Registration**
  - `id`, `editionId`, `distanceId`, `buyerUserId`
  - `status` (Started/Submitted/PaymentPending/Confirmed/Cancelled)
  - `basePriceCents`, `feesCents`, `taxCents`, `totalCents`
  - `createdAt`, `updatedAt`
- **Registrant**
  - `id`, `registrationId`, `userId` (nullable for guest/multi-participant later)
  - `profileSnapshot` (JSON: name/email/dob/gender/phone/address/emergency contact)
  - `division` (results division), `genderIdentity` (optional)
- **Waiver**
  - `id`, `editionId` (or distanceId later), `title`, `body`, `versionHash`, `displayOrder`
- **WaiverAcceptance**
  - `id`, `registrationId`, `waiverId`, `acceptedAt`, `ipAddress`, `userAgent`
  - `signatureType` (checkbox/initials/signature), `signatureValue`
- **RegistrationQuestion** / **RegistrationAnswer**
  - `questionId`, `editionId` or `distanceId`, `type`, `prompt`, `required`, `options`
  - `answerId`, `registrationId` (or registrantId), `value`
- **AddOn** / **AddOnOption** / **AddOnSelection**
  - AddOn: `id`, `editionId`, `distanceId`, `title`, `description`, `type` (merch/donation), `deliveryMethod`
  - Option: `id`, `addOnId`, `label`, `priceDeltaCents`, `maxQtyPerOrder` (default 5), `optionMeta` (JSON for variants like shirt size/type)
  - Selection: `id`, `registrationId`, `optionId`, `quantity`, `lineTotalCents`
- **EventFaqItem**
  - `id`, `editionId`, `question`, `answer`, `sortOrder`, `updatedAt`
- **DiscountCode** / **DiscountRedemption**
  - Code: `id`, `editionId`, `code`, `name`, `percentOff`, `maxRedemptions`, `startsAt`, `endsAt`, `isActive`
  - Redemption: `id`, `registrationId`, `discountCodeId`, `redeemedAt`
- **EventWebsiteContent**
  - `id`, `editionId`, `locale` (optional), `blocksJson` (validated schema), `updatedAt`
- **Media**
  - `id`, `orgId`, `blobUrl`, `altText`, `kind`, `createdAt`
- **OrganizationPayoutProfile** (data only; future payments)
  - `id`, `orgId`, `legalName`, `rfc`, `payoutDestinationJson`, `updatedAt`
- **GroupRegistrationBatch** / **GroupRegistrationBatchRow**
  - Batch: `id`, `editionId`, `createdByUserId`, `status`, `sourceFileMediaId`, `createdAt`, `processedAt`
  - Row: `id`, `batchId`, `rowIndex`, `rawJson`, `validationErrorsJson`, `createdRegistrationId`
- **AuditLog**
  - `id`, `orgId`, `actorUserId`, `action`, `entityType`, `entityId`
  - `beforeJson`, `afterJson`, `ipAddress`, `userAgent`, `createdAt`

Key relationships:

- Organization 1—\* EventSeries
- EventSeries 1—\* EventEdition
- EventEdition 1—\* EventDistance
- EventDistance 1—\* PricingTier
- EventEdition 1—\* EventWebsiteContent
- EventEdition 1—\* EventFaqItem
- EventEdition 1—\* Registration
- Registration 1—1 Registrant (v1) → later 1—\* Registrants (v3)
- Registration _—_ AddOnOption (via AddOnSelection)
- EventEdition 1—\* DiscountCode; Registration 0—1 DiscountRedemption (or 0—\* if multiple codes allowed later)
- EventEdition 1—_ Waiver; Waiver 1—_ WaiverAcceptance
- Organization 1—1 OrganizationPayoutProfile (optional)
- EventEdition 1—\* GroupRegistrationBatch
- All organizer mutations → AuditLog append

## 7. State machines (text-based)

### Event lifecycle

- `Draft` → `Published`
- `Published` → `Unlisted` (still accessible via direct URL; removed from discovery)
- `Published`/`Unlisted` → `Archived` (read-only; removed from discovery)
- Rules:
  - Only `Published` events appear in sitemap and `/events` directory.
  - RunGoMx wording: `Draft` maps to “Created”; “Registration open/paused/closed” is derived from registration rules below.

### Registration availability (public-facing status)

- `NotOpenYet` → `Open` when `now >= registrationOpensAt`
- `Open` → `Closed` when `now > registrationClosesAt`
- `Open` → `Paused` when director toggles pause on
- `Paused` → `Open` when director toggles pause off (if within open/close window)
- Any state → `SoldOut` when capacity is `Full`
- Rules:
  - “Open registration” requires: `Published` + within open/close window + not paused + capacity available.

### Registration lifecycle (payment-ready, no real payment yet)

- `Started` → `Submitted` (participant info + waiver + required questions complete)
- `Submitted` → `PaymentPending` (totals computed; placeholder “payment step” shown)
- `PaymentPending` → `Confirmed` (future: payment integration; in v1 we may auto-confirm with a clearly labeled “no-payment mode” flag)
- Any state → `Cancelled` (organizer/admin-only in v1; user self-cancel deferred)

### Capacity behavior

- `Available` → `Full` when capacity is reached (distance-level or shared pool).
- While `Full`:
  - Registration CTA shows “Sold out” (UltraSignup) or “spots left” messaging when near full (RunSignup). (https://ultrasignup.com/register.aspx?eid=19181, https://runsignup.com/Race/Events/NJ/Hillsborough/TheResolutionRun5K)
  - Waitlist is a **future** behavior: we keep schema hooks but defer operational waitlist in this plan.

## 8. Key workflows (step-by-step)

### Organizer creates an event

1. Organizer enters `/dashboard/events/new`.
2. Select organization (if multiple) and provide event series name + slug.
3. Provide sport/event type (RunGoMx taxonomy), dates + timezone + location, and optional external URL.
4. System generates a unique public event code/ID.
5. Save as Draft; system writes AuditLog.
6. Organizer adds at least one distance + price, then publishes (or keeps unlisted for preview).

### Organizer configures races/distances and pricing tiers

1. Organizer adds a distance (label + distance + start time + capacity).
2. Adds pricing:
   - v1: single price.
   - v2: date-based tiers (up to N tiers; we should not hard-limit to 3 like UltraSignup docs unless required). (https://help.ultrasignup.com/hc/en-us/articles/30339226191245-Event-Pricing-Setup)
3. Public page shows per-distance price + registration closes time. (https://runsignup.com/Race/Events/FL/Miami/LotusFlowerRun, https://ultrasignup.com/register.aspx?eid=19181)

### Organizer edits event website sections

1. Organizer manages Q&A/FAQ (Phase 1: dedicated FAQ editor; Phase 2+: also available as a website section).
2. Organizer opens “Website” editor (Phase 2+).
3. Chooses enabled sections (Overview, Course, Schedule, FAQ, Media) and optional attachments (photos + PDF).
4. Edits copy and uploads media (reuse Vercel Blob pattern from profile pictures).
5. Saves; preview updates; AuditLog captures before/after.

### Participant searches and discovers events

1. Participant visits `/events`.
2. Uses location input (reuse our location search API) and filters (type/sport, month, state/region, date range, distance range, open-only, virtual).
3. (v2) Optionally uses a map view to explore events near a location.
4. Results list shows: event name, date(s), location, key distances, registration status (“open/closed/sold out”).
5. Participant clicks into event page.

### Participant views an event page and registers (with payment placeholder step)

1. Participant visits `/events/[slug]` and sees overview + distances list + register CTAs.
2. Selects a distance → navigates to `/events/[slug]/register?distance=…`.
3. Registration steps:
   - Prefill from profile (if logged in); otherwise require sign-in in v1.
   - Collect any additional required fields not present in profile.
   - If registration is Paused/Closed/SoldOut, block progress and show a clear status message (with contact link).
   - Waiver acceptance (checkbox + initials/signature as configured); store timestamp + IP/user agent. (https://info.runsignup.com/2021/11/17/multiple-waivers/, https://ultrasignup.com/registration_step2.aspx?did=134389&ci=10779387)
   - (v2) Questions + add-ons, with price deltas (e.g., shirt choice). (https://ultrasignup.com/registration_step2.aspx?did=134389&ci=10779387)
4. Review + totals:
   - Show base cost + fees (platform fee placeholder) and total; payment step is a placeholder. (UltraSignup cart breakdown example: https://ultrasignup.com/shopping_cart.aspx)
   - (v2) Apply a coupon code if provided and valid; show discount and updated total.
5. Finalize creates `Registration` record with `PaymentPending` (or `Confirmed` in no-payment mode with explicit labeling).

### Organizer reviews/export registrations

1. Organizer opens `/dashboard/events/[eventId]/registrations`.
2. Filter/search by distance/status/date.
3. Export CSV of registrants + answers + waiver acceptance metadata + add-ons (v2).

## 9. API surface proposal (routes/actions/services; no code)

### Organizer/admin (server actions; preferred)

- Create event series + first edition (orgId + basics + sport/event type + initial dates/location)
- Update edition basics (dates/timezone/location/registration window/external URL)
- Pause/unpause registration (manual override)
- Publish / unlist / archive an edition
- Upsert Q&A/FAQ items (create/update/reorder)
- Create/update a distance (label, distance, start time, capacity)
- Create/update pricing tiers for a distance
- Create/update event website content blocks (validated JSON)
- Create/update waiver content and required signature mode
- Create/update policy config placeholders (refund/transfer/deferral text + deadlines)
- Create/disable/delete discount coupon codes (v2)
- Update director payout profile (RFC + payout destination; data only)
- Group registration batch actions (v3): download template, upload/validate file, process batch
- List registrations for an edition (filters + sorting)
- Export registrations CSV (filters + sorting; must write an AuditLog entry for export)

### Public (route handlers; for search + lightweight reads)

- `GET /api/events/search` (filters: q/type/sport/month/state/location/radius/date range/distance range/open-only/virtual; pagination + sorting)
- Optional: `GET /api/events/[slug]` for client components (if needed).

### Registration (server actions)

- Start registration (creates `Registration: Started`)
- Update registrant snapshot (participant details; per-registration immutable snapshot)
- Accept waiver (stores acceptance metadata and signature)
- Answer registration questions (v2)
- Select add-ons and quantities (v2)
- Apply/remove a coupon code (v2)
- Finalize registration (computes totals, transitions to `PaymentPending` or `Confirmed` in no-payment mode)

## 10. UI surface proposal (pages and key components; no code)

### Public

- `/[locale]/events`:
  - Filters: type/sport, month, distance range, state/region, location (autocomplete) + radius, open-only, virtual.
  - Components: filter panel, results list/cards, pagination, (v2) map/list toggle.
- `/[locale]/events/[slug]`:
  - Hero + key facts (date/time, location, registration close, capacity status).
  - Distances list + pricing schedule preview + external URL (if provided).
  - Prominent Q&A/FAQ section (Phase 1+).
  - Attachments/media links (Phase 2+: photos + PDF).
  - SectionSubnav tabs: Overview, Course, Schedule, FAQ, Photos, Register.
- `/[locale]/events/[slug]/register`:
  - Stepper: Participant → Waiver → (v2) Questions/Add-ons → Review (coupon) → Payment placeholder.
  - States: blocks progression on Paused/Closed/SoldOut with clear messaging.

### Organizer/admin (external organizers; internal staff as needed)

- `/[locale]/dashboard/events`:
  - List view (reuse `EntityListView`), “Create event” CTA.
- `/[locale]/dashboard/events/new`:
  - Wizard: Basics (type + dates + location) → Distances (price/capacity) → FAQ → Publish.
- `/[locale]/dashboard/events/[eventId]/*`:
  - Subnav (reuse `SectionSubnav`): Details, Distances, Pricing, Website, FAQ, Coupons, Registrations, Policies, Group registrations.
  - Forms built using existing `lib/forms` patterns and server actions with auth wrappers.
  - `/[locale]/dashboard/settings/payout`: director payout profile (Owner/Admin only; data only).

## 11. Risks and mitigations (security, fraud, data integrity, SEO duplication, permissions)

- **Authorization gaps (org vs global roles)**: enforce org membership checks in _every_ organizer server action; keep a single permissions helper to avoid drift.
- **Capacity oversubscription**: enforce at DB/transaction level; never rely only on UI “spots left”.
- **Data privacy for waivers/medical info**: store only what is required; separate PII snapshot vs event config; add auditing and access controls for organizer exports.
- **XSS in organizer-edited content**: use a restricted block schema + sanitization; do not allow raw HTML by default.
- **SEO duplication (tabs/subpages)**: canonicalize to `/events/[slug]` and set consistent alternates; avoid indexing draft/unlisted; only include published in sitemap. (Align with existing `robots.ts` and `sitemap.ts` patterns.)
- **Fraud/spam registrations (no payment)**: add rate limiting for registration starts; require auth in v1; capture IP/user agent; consider reCAPTCHA later (not planned now).
- **Coupon abuse/over-redemption**: validate coupons server-side, enforce max redemptions transactionally, and audit coupon changes/redemptions.
- **Bulk registration data integrity (Excel)**: strict file validation, row-level error reporting, idempotent processing, and clear identity-matching rules to avoid duplicate athletes.
- **Sensitive director payout data**: restrict access to Owner/Admin, audit all reads/writes, and store only what’s required until payment integration.
- **Timezone bugs**: store timezone per edition and compute local displays consistently for “registration closes” and start times.

## 12. Open questions (things to confirm before implementation)

- Do we want **account-required registration** in v1 (simpler, aligns with current auth), or **guest registration** (UltraSignup supports it) from day 1? (https://ultrasignup.com/members/login.aspx?ReturnUrl=%2fregistration_step0.aspx%3fdid%3d134389%26ci%3d10779327)
- Minor registration policy: will we support minors in v1, and what legal text/guardian verification is required? (RunSignup shows explicit minor/guardian messaging.) (https://runsignup.com/Race/Register/?raceId=90618&eventId=1076439)
- Do we need a strict “event approval” workflow (UltraSignup requires verification of website/FB page to prevent fake events)? (https://help.ultrasignup.com/hc/en-us/articles/30339236980365-Creating-a-New-Event)
- Should the initial schema include **EventSeries/EventEdition** now (recommended) or postpone until post-v1?
- How should we represent **division vs gender identity** in RunGoMx to match UltraSignup’s “backup division” note? (https://ultrasignup.com/registration_step0.aspx?did=134389&ci=10779327)
- What is the desired “platform fee” model for v2 totals display (flat vs %), and do we need tax modeling now or later?
- Directors: do we need event-scoped secondary directors, or is org membership sufficient (creator invites other users and assigns permissions)?
- Group registrations: who is the payer (director vs group leader), and what is the exact rule for existing athletes (error/skip/link) when an uploaded row matches an existing account?
- Coupons: do codes expire (easy mode: active + max redemptions only) or do we need `expiresAt` in v2?
- Refunds (future phase): confirm “platform admin fee is retained even on refunds” and how refund deadlines should be displayed/enforced (config-only now).
- Athlete identity: do we need an account merge process to handle “same person registered twice” scenarios (e.g., self-register then registered by an organization)?

## 13. Appendix: source URLs (all references)

### RunSignup

- https://runsignup.com/Races
- https://runsignup.com/Race/VA/Ashburn/NewDayNewYear5k10k
- https://runsignup.com/Race/Events/FL/Miami/LotusFlowerRun
- https://runsignup.com/Race/Events/OH/Troy/WorldRaceforHopeTroy
- https://runsignup.com/Race/Events/NJ/Hillsborough/TheResolutionRun5K
- https://runsignup.com/Race/Register/?raceId=90618&eventId=1076439
- https://runsignup.com/Race/176380/RefundPolicy
- https://info.runsignup.com/products/registration/
- https://info.runsignup.com/2021/11/17/multiple-waivers/
- https://info.runsignup.com/2025/12/22/store-vs-add-ons/

### UltraSignup (public site)

- https://ultrasignup.com/events/search.aspx
- https://ultrasignup.com/js/usu.events.search.js?v=5.7
- https://ultrasignup.com/service/events.svc/closestevents?open=1&past=0&virtual=0&lat=0&lng=0&mi=200&mo=12
- https://ultrasignup.com/register.aspx?eid=2483
- https://ultrasignup.com/register.aspx?eid=19181
- https://ultrasignup.com/register.aspx?eid=13825
- https://ultrasignup.com/members/login.aspx?ReturnUrl=%2fregistration_step0.aspx%3fdid%3d134389%26ci%3d10779327
- https://ultrasignup.com/registration_step0.aspx?did=134389&ci=10779327
- https://ultrasignup.com/registration_step2.aspx?did=134389&ci=10779387
- https://ultrasignup.com/shopping_cart.aspx

### UltraSignup (help center docs, accessed via API; cite html_url)

- https://help.ultrasignup.com/hc/en-us/articles/30339236980365-Creating-a-New-Event
- https://help.ultrasignup.com/hc/en-us/articles/30339286849805-Quick-Start-Complete-Your-Event-Setup
- https://help.ultrasignup.com/hc/en-us/articles/30339201314061-Add-Another-Distance
- https://help.ultrasignup.com/hc/en-us/articles/30339258356877-Set-Your-Capacity
- https://help.ultrasignup.com/hc/en-us/articles/30339226191245-Event-Pricing-Setup
- https://help.ultrasignup.com/hc/en-us/articles/30339240810509-Creating-Add-Ons
- https://help.ultrasignup.com/hc/en-us/articles/30339284160525-Photos-Waivers-and-General-tabs
- https://help.ultrasignup.com/hc/en-us/articles/35929083830285-How-Do-I-Allow-Multiple-Runner-Registrations-in-One-Transaction
- https://help.ultrasignup.com/hc/en-us/articles/30339325581197-Refund-Policy-Making-Things-Crystal-Clear
- https://help.ultrasignup.com/hc/en-us/articles/30339234344973-Set-Up-Bib-Transfer-Option
- https://help.ultrasignup.com/hc/en-us/articles/30339290435213-Creating-and-Applying-Rollover-Credits
- https://www.rrca.org/education/event-directors/event-waiver-templates/
