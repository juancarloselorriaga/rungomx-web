# Events Platform — Map Search (Full “visual discovery” experience)

Owner: implementer agent  
Status: READY (decisions captured; see “Locked decisions”)  
Related: `docs/plans/events-platform-runsignup-ultrasignup-plan.md`

## Goal

Implement a first-class map-based event search on `/events` that feels like the best “map searchers” (e.g., Uber-style list+map sync, Strava-style visual exploration), using the map stack already in this repo.

Users should be able to:

- Browse events on a map with clustering and rich previews.
- Pan/zoom the map and update results (“Search this area” pattern).
- Keep list and map synchronized (selection, hover, click).
- Use existing filters (sport, dates, distance range, location, radius, open-only, virtual) seamlessly.

## Non-goals (for this plan)

- Course/route rendering for each event (GPX/KML, elevation profile).
- Turn-by-turn navigation.
- Server-generated vector tiles (MVT) or heavy geospatial features (PostGIS).

## Current codebase snapshot (important constraints)

### Map stack (use this)

- `react-map-gl` v8 (installed).
- Default map rendering provider: MapLibre (tokenless).
  - Use `react-map-gl/maplibre` + `maplibre-gl`.
- Optional enhancement: Mapbox rendering (token required, client-side).
  - Use `react-map-gl/mapbox` + `mapbox-gl`.
  - Existing repo usage: `components/location/location-picker-dialog.tsx` uses the Mapbox entrypoint.
- Map styles are controlled via:
  - `NEXT_PUBLIC_MAP_STYLE_LIGHT`
  - `NEXT_PUBLIC_MAP_STYLE_DARK`
- Token guidance:
  - Mapbox geocoding is server-only and guarded by `MAPBOX_ACCESS_TOKEN` (secret env var).
  - `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` is optional (only for Mapbox map rendering) but still “public and billable”.
  - Note: `.env.example` currently documents `MAPBOX_ACCESS_TOKEN` but not `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` (add it during implementation so local/dev is obvious).

### Practical gotchas (must mention in implementation PR/notes)

- Don’t assume “public token” means “no risk.” Public tokens can still be abused and trigger billing.
- Tokenless doesn’t mean “free forever.” Public tile providers can have rate limits; plan a fallback or a paid provider later if usage grows.
- MapLibre style JSON must reference accessible glyphs/sprites/tiles; pick a provider with stable URLs (avoid “demo tiles” as a production default).
- Provider-specific style URLs:
  - Mapbox styles often use `mapbox://...` and require Mapbox GL + a token.
  - Tokenless MapLibre styles must be plain `https://.../style.json` with reachable sprite/glyph endpoints.

### Search stack (reuse, extend)

- `/events` SSR page fetches initial results via DB call:
  - `app/[locale]/(public)/events/page.tsx`
  - Uses `searchPublicEvents()` from `lib/events/queries.ts`
- Client refinements use JSON API:
  - `app/api/events/route.ts` → calls the same `searchPublicEvents()`
- Location input and geocoding already exist:
  - `components/location/location-field.tsx`
  - `app/api/location/*`

### Data model

- `event_editions` has `latitude`/`longitude` (nullable decimals): `db/schema.ts`
- Public search currently does NOT return coordinates:
  - `lib/events/queries.ts` `PublicEventSummary` missing lat/lng

## UX spec (what we’re building)

### Layouts

Provide 3 modes, persisted per user/device (localStorage is ok):

1. **List** (current): grid/cards, pagination.
2. **Map**: map full-width, results in a bottom sheet (mobile) or side drawer (desktop).
3. **Split** (recommended default on desktop): left list (scroll) + right sticky map.

### Map interactions (Uber/Airbnb pattern)

- Map loads markers/clusters for the same filter set as the list.
- Panning/zooming does NOT immediately fetch (avoid spam).
  - Show a floating CTA: “Search this area”.
  - Clicking it refetches and updates URL params (shareable).
- Clicking a marker:
  - Selects the event.
  - Opens a preview popup (name, date, location, price, registration state, CTA).
  - Scrolls/highlights the corresponding list item (split view).
- Hovering a list card highlights the marker (desktop only).
- Clicking a cluster zooms in to expand it.
  - Cluster click is explicit intent: zoom AND auto-refresh results (no CTA).

### Fallbacks and edge cases

- Events without `latitude/longitude`:
  - Remain in the list.
  - Do not appear on the map.
  - Surface a subtle counter: “N events not shown on map (missing exact location)”.
- Extremely dense areas:
  - Clustering must be enabled (do NOT render hundreds of `<Marker/>` components).
- Empty map viewport:
  - Show empty state on map + list.

## Data/API design (shareable URLs + efficient fetching)

### URL params (proposal)

Keep existing params and add:

- `view`: `list | map | split`
- `bbox`: `minLng,minLat,maxLng,maxLat` (string)
  - Used only when `view` is `map` or `split` OR when the user has interacted with the map.

Rationale:
- A single `bbox` param keeps URLs shareable and avoids adding 4 separate params.
- Existing `lat/lng/radiusKm` continue to work for “near a location” searches (and can set initial map center).

### API endpoints (proposal)

Keep `GET /api/events` for the list as-is, but extend it.

1) **List endpoint** (existing): `GET /api/events`
- Add optional `bbox` support for filtering.
- Return coordinates in each event summary (so the client can reuse results for markers if desired).

2) **Map endpoint** (new): `GET /api/events/map`
- Same filters as list, but optimized response for the map:
  - Always filters to a `bbox` (required).
  - Returns a GeoJSON `FeatureCollection` of points:
    - `geometry.coordinates = [lng, lat]`
    - `properties` include minimal fields needed for popup + list sync (id, seriesSlug, editionSlug, seriesName, startsAt, isRegistrationOpen, minPriceCents, currency, sportType).
  - Returns `isTruncated` if a hard limit is exceeded (e.g., 1000 points).

Why a separate endpoint:
- The map may need *many* points, while the list stays paginated.
- The payload should be compact (GeoJSON) and stable for clustering.

## Implementation plan (step-by-step)

## Locked decisions (confirmed)

- Default map provider: MapLibre (tokenless).
- Mapbox tiles/styles: opt-in enhancement; `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` is optional.
- Mapbox geocoding: server-only, guarded by `MAPBOX_ACCESS_TOKEN` (secret).
- Map viewport (`bbox`) actively filters the list like Uber/Airbnb.
- Marker precision: exact pin.
- Map point limit per viewport: 500.
- “Locate me” is the default location source when available; fallback to profile; user can override via location search.
- Cluster click: zoom + auto-refresh.
- Default view mode: desktop `split`, mobile `map`.
- Geolocation prompting: show an “Enable location” button first; only auto-use location when permission is already granted; handle rejection gracefully.
- Manual pan/zoom refresh: keep the “Search this area” CTA (auto-refresh only for explicit actions like locate-me and cluster click).

### Phase 0 — Runtime selection (MapLibre default, Mapbox optional)

Implement a small “map runtime selector” so the UI runs tokenless by default, and uses Mapbox only when configured.

- Inputs:
  - `NEXT_PUBLIC_MAP_STYLE_LIGHT` / `NEXT_PUBLIC_MAP_STYLE_DARK`
  - Optional `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN`
- Heuristic (recommended):
  - If the chosen style URL starts with `mapbox://` OR contains `api.mapbox.com/styles`, use Mapbox runtime and require token.
  - Otherwise use MapLibre runtime.
- Implementation detail:
  - Prefer a wrapper component (e.g. `components/maps/runtime-map.tsx`) that renders either:
    - `react-map-gl/maplibre` + `maplibre-gl/dist/maplibre-gl.css`, or
    - `react-map-gl/mapbox` + `mapbox-gl/dist/mapbox-gl.css`.
- Failure mode:
  - If Mapbox style is configured but token missing, show a friendly error and fallback to a tokenless style if available.

### Phase 0.5 — UX acceptance criteria (lock before coding)

- Desktop: split view exists and works with hover/selection.
- Mobile: map view works with bottom sheet results.
- Map viewport filters the list (bbox-driven).
- “Search this area” exists for manual pan/zoom; explicit actions (cluster click, locate-me) auto-refresh.
- Clusters render and expand on click.

### Phase 1 — Backend: coordinates + bbox filtering

1. **Extend `PublicEventSummary` to include coordinates**
   - File: `lib/events/queries.ts`
   - Add: `latitude`, `longitude` (prefer numbers in API responses; internal Drizzle decimals may be strings).
   - Update `searchPublicEvents()` select to include `eventEditions.latitude` and `eventEditions.longitude`.
   - Ensure JSON serialization in:
     - `app/api/events/route.ts`
     - `app/[locale]/(public)/events/page.tsx`

2. **Add bbox filter support to `searchPublicEvents()`**
   - Add to `SearchEventsParams`: `bbox?: { minLat; minLng; maxLat; maxLng }` (or a `bbox` tuple).
   - Add SQL conditions:
     - `latitude IS NOT NULL`, `longitude IS NOT NULL` when bbox is used
     - `latitude BETWEEN minLat AND maxLat`
     - `longitude BETWEEN minLng AND maxLng`
   - NOTE: Mexico-only use is safe, but still handle edge case where `minLng > maxLng` (antimeridian) for correctness if needed.

3. **Parse `bbox` in `GET /api/events`**
   - File: `app/api/events/route.ts`
   - Update Zod schema to accept `bbox` and parse it into floats.
   - Ensure bbox is included in the “explicit location intent” detection.

4. **(Optional but recommended) DB indexes**
   - Add indexes to speed bbox queries:
     - `event_editions(latitude)`
     - `event_editions(longitude)`
     - or a composite index `(latitude, longitude)`
   - File: `db/schema.ts` (Drizzle index definitions)
   - Generate/apply migrations with Drizzle:
     - `pnpm db:generate`
     - `pnpm db:push`

Acceptance checks:
- `GET /api/events?bbox=...` returns only events within viewport and includes lat/lng.
- Existing non-map searches behave unchanged.

### Phase 2 — Backend: map GeoJSON endpoint

1. Create `GET /api/events/map`
   - New file: `app/api/events/map/route.ts`
   - Inputs:
     - Same filters as list, but **require `bbox`**
     - Add optional `limit` for safety (default 500, max 1000)
   - Output:
     - `{ featureCollection, meta }` where:
       - `featureCollection` is GeoJSON
       - `meta` includes counts like `totalWithCoords`, `truncated`, `missingCoordsCount` (optional)

2. Add a new query function for map points (recommended)
   - In `lib/events/queries.ts`, add:
     - `searchPublicEventsMapPoints(params)` that:
       - Applies same filters as `searchPublicEvents`
       - Forces `latitude/longitude IS NOT NULL`
       - Uses bbox (required)
       - Returns *only* the fields needed for map

Acceptance checks:
- Endpoint returns GeoJSON quickly and consistently with list filters.
- Handles “too many points” by truncating deterministically.

### Phase 3 — Frontend: map component with clustering

1. Create a reusable map component for events
   - New: `components/events/events-results-map.tsx` (client component)
   - Use the Phase 0 runtime selector (MapLibre default; Mapbox optional).
   - Use `Source` + `Layer` (not `<Marker/>`) for performance.
   - Enable GeoJSON clustering:
     - On the source: `cluster: true`, `clusterRadius`, `clusterMaxZoom`
     - Layers:
       - Cluster circles (filter cluster)
       - Cluster count labels (symbol layer, `text-field: {point_count_abbreviated}`)
        - Unclustered points
   - Map ref:
     - Use `MapRef` to compute bounds and to `flyTo()`/`easeTo()` on cluster click.

References (already validated via Context7 docs):
- `react-map-gl` Map/Source/Layer usage and controlled view state.
- Mapbox GL GeoJSON clustering patterns (`cluster`, `clusterRadius`, cluster layers and filters).

2. Implement “Search this area”
   - Detect “map moved” via `onMoveEnd`.
   - Compare last-searched bbox vs current bbox; if different, show CTA.
   - On CTA click:
     - Update URL query param `bbox=...` (+ reset `page=1`)
     - Trigger fetches (list + map endpoint)
   - Explicit actions that should skip CTA and auto-refresh immediately:
     - Locate-me button
     - Cluster click zoom completion (after `easeTo`/`flyTo` ends or immediately after computing next bbox)

3. Implement selection + popup
   - Clicking an unclustered point:
     - Set `selectedEventId`
     - Render a `<Popup/>` using event properties from GeoJSON
     - Keep selection in sync with list (see Phase 4)

Acceptance checks:
- Markers render and cluster correctly.
- Cluster click zooms into cluster (expansion zoom).
- Clicking a point opens popup without breaking map controls.

### Phase 4 — Frontend: integrate into `/events` directory UX

1. Add view toggle UI
   - File: `app/[locale]/(public)/events/events-directory.tsx`
   - Add a segmented control: List / Split / Map
   - Persist to URL (`view`) and localStorage (URL wins when present).

2. Add split layout on desktop
   - Keep existing filters header at top.
   - Use a responsive layout:
     - Left: results list (switch to vertical list layout; avoid 3-column grid in split mode)
     - Right: sticky map (100% height minus header)
   - Implement list scroll container and map sticky behavior.

3. Map ↔ list synchronization
   - Hover list item → highlight marker (desktop):
     - Keep `hoveredEventId` in state.
     - In the map layer paint, style hovered/selected points differently (via feature-state or filter-based overlay layer).
   - Click marker → scroll list to item and apply highlight (temporary “ring”).
   - Click list item → center map to that point and open popup.

4. Loading + error UX
   - Map endpoint loading state: show subtle skeleton overlay.
   - Error: allow retry; don’t break list view.

Acceptance checks:
- View toggle works and is shareable via URL.
- Split view keeps map stable while list scrolls.
- Hover and click sync are reliable.

### Phase 5 — i18n + UI polish

1. Add translations for new UI strings
   - Files:
     - `messages/pages/events/en.json`
     - `messages/pages/events/es.json`
   - Strings to add (suggested keys):
     - `map.view.list`, `map.view.map`, `map.view.split`
     - `map.searchArea`, `map.loading`, `map.missingCoords`
     - `map.resetView`, `map.locateMe` (if enabled)

2. Visual polish (baseline)
   - Marker colors by `sportType`.
   - Popup layout matches existing card styles (compact).
   - Respect dark mode by using `NEXT_PUBLIC_MAP_STYLE_DARK`.

### Phase 6 — QA / performance / tests

1. Performance checks
   - Ensure map renders via `Source` + `Layer` (WebGL), not hundreds of React markers.
   - Debounce map refetch actions (CTA pattern already minimizes fetches).
   - Use `AbortController` to cancel in-flight map fetches when filters change quickly.

2. Playwright e2e (optional but valuable)
   - Add a test for:
     - Switching to map view
     - Seeing the “Search this area” CTA after pan
     - Selecting an event from the map updates URL and shows popup
   - Note: CI/dev needs `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` set (already supported in `e2e/playwright.config.ts`).

## Remaining micro-decisions (optional, but nice to settle)

All micro-decisions are confirmed; implement as specified above.
