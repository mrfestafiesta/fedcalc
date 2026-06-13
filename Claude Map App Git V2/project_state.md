# Map App — Project State
*Last updated: 2026-06-07*

## What This App Is
A wilderness navigation PWA (Progressive Web App) built with Leaflet.js. Features include:
- Multi-modal routing: configurable street routing (blue) → park gate → Dijkstra offroad/trail (brown/yellow)
- Floating unified search bar with switchable park/map mode and configurable geocoding provider
- AR camera overlay with device compass HUD
- GPS path recording with IndexedDB persistence
- Offline-first via service worker with 4 cache buckets, tile cap, and FIFO eviction
- Weather popups via NWS (api.weather.gov) including current temperature (hourly), wind direction/speed, relative humidity (current, hourly, 7-day forecasts)
- Campground menu: ⛺ button below the map layers control opens a panel of agency toggles; campground markers load on demand with zoom-based dot→icon transition
- Park files exist on a spectrum from MVP (GIS data only) to full topology — loadPark() handles both modes gracefully; campground popups include a "Show Park Details" button

## File Structure (Current)
```
Claude Map App/
├── index.html              ~200-line HTML skeleton
├── styles.css              All CSS
├── sw.js                   Service worker (4 cache buckets)
├── manifest.json           PWA manifest
├── readme.txt              Full technical documentation
├── project_state.md        This file
├── js/
│   ├── state.js            Shared mutable state object + constants
│   ├── map.js              Leaflet map instance + all layer groups
│   ├── weather/            Weather system (planned restructure, see below)
│   │   ├── weather.js      Provider selection logic (NWS, Open-Meteo)
│   │   ├── nws.js          NWS (National Weather Service) provider functions
│   │   ├── open-meteo.js   Open-Meteo provider functions
│   │   ├── utils.js        degreesToCardinal, formatWind, shared helpers
│   │   └── weather-config.json WMO weather codes + constants
│   ├── popups.js           Popup/modal composition — setPOIPopup, showForecast
│   ├── routing.js          Dijkstra engine, street routing, provider config
│   ├── ar.js               AR world, compass, orientation handler
│   ├── gps.js              GPS logger, path load/save/export/clear (uses idb-keyval)
│   ├── storage.js          Cache sizes, wake lock, SW registration, force update
│   └── main.js             All event listeners, search logic, API key mgmt, boot
├── parks/
│   ├── loc_manifest.json   Master index — 318 total entries (3 hand-built + 315 CA state parks)
│   ├── red_rock_canyon_sp.json   hand-built topology
│   ├── lmuTest.json              hand-built topology
│   ├── lmuTestUSGS.json          hand-built topology
│   ├── ca/
│   │   └── state-parks/
│   │       ├── generate.js       Build script — run to regenerate from ArcGIS API
│   │       ├── anza-borrego-desert-sp.json
│   │       └── ...408 MVP park files total
│   └── federal/              (placeholder — future NPS, BLM, USFS)
└── editor/
    └── map_editor v1.19.html   Standalone editor — NOT part of module system
```

## Key Architecture Decisions
- **No build tools** — ES modules loaded natively via `<script type="module" src="./js/main.js">`
- **Shared state** — All mutable globals live in `js/state.js` as a single exported `state` object
- **`window.fetchForecast`** — Set in popups.js so inline HTML popup buttons can open the forecast modal
- **weather.js / popups.js separation** — weather.js is data-only (fetchWeather, fetchForecastHTML); it knows nothing about parks, popups, markers, or the DOM. popups.js owns all popup/modal composition and display (setPOIPopup, showForecast), pulling weather values from weather.js and adding park website/details buttons.
- **`window.saveApiKey(provider)`** — Set in main.js so dynamically-rendered Save Key buttons can call it
- **`window.showParkDetails(parkId)`** — Set in main.js so campground popup "Show Park Details" buttons can call loadPark()
- **map.js** — Holds the Leaflet instance to prevent circular dependencies
- **idb-keyval** — Imported only in gps.js; storage.js imports getPathSizeMB from gps.js
- **loadPark() dual-mode** — Detects topology vs MVP format at runtime. Topology: renders trail edges + POI markers. MVP: renders boundary outline + entry point markers + campground markers. Entry points always set state.selectedPOI (isExternal: true) so routing works in both modes.
- **Campground system** — `campgroundLayer` (map.js) is managed exclusively by the campground panel, not the Leaflet layers control. Loads campground markers only (no boundaries/entry points). Park detail accessed via "Show Park Details" → loadPark().
- **Campground marker zoom behavior** — `campIcon` divIcon contains both `.camp-dot` (4px, shown zoom < 10) and `.camp-tent` (⛺, shown zoom ≥ 10). `updateCampZoom()` toggles `zoom-low`/`zoom-high` class on `#map`; CSS swaps all markers simultaneously in one DOM operation.
- **Park files lazy-load on demand** — enter tracker-data-v1 only when accessed (campground panel toggle or park search). Scales to all future agencies with zero SW changes.
- **Tiles and NWS fetches use mode:'cors'** — Eliminates Chrome's opaque response padding. True storage measurable via Storage Management panel.
- **Weather API: Open-Meteo → NWS (June 2026)** — Switched to NOAA's api.weather.gov for better data (text descriptions, humidity, dewpoint) and US-only coverage. NWS has proper CORS support but Chrome's cache storage quota API still inflates reported sizes; actual storage is accurate in Storage Management panel (~5-10 KB per weather fetch).

## Documentation Standards (Mandatory for all JS files)

**Goal**: Consistent, self-documenting code that describes *what* the module does and *how* major sections work, not *why* code works the way it does (that's for inline comments).

**Three-level hierarchy**:

1. **Module-level JSDoc block** (required for all `.js` files, top of file)
   ```javascript
   /**
    * filename.js — One-line purpose
    *
    * Multi-paragraph description of what this module does, its responsibilities,
    * and how it fits into the larger system.
    *
    * Exports:
    * - functionName: Brief description of what it does
    * - Export: Each export on its own line
    */
   ```
   - Describes the module's role, not implementation details
   - Lists all exports that are used by other modules
   - Used by developers diving into an unfamiliar module

2. **Section headers with `/* === */`** (for logical groupings of related code)
   ```javascript
   /* === SECTION NAME === */
   // ... related code, typically 10-50 lines ...
   ```
   - Breaks large files (like main.js) into digestible chunks
   - Typically 5-15 sections per large file
   - Helps developers quickly locate functionality when reading code
   - Prefer this over `// ===` for visual prominence

3. **Inline comments with `//`** (for non-obvious code logic)
   ```javascript
   // Explanation of the WHY, not the WHAT
   const result = complexCalculation();
   ```
   - Only add if the code does something surprising or non-obvious
   - Don't comment what the code does (variable names should make that clear)
   - Use for: workarounds, constraints, non-obvious invariants

**What NOT to document**:
- ❌ Don't comment what variable names already explain: `// increment the counter` above `count++`
- ❌ Don't reference current task/issue/caller: "added for PR #123" or "used by loadCampgrounds()" — put that in git commit messages
- ❌ Don't document hypothetical future code: "we might need to..." — code when needed
- ❌ Don't add defensive comments: "make sure this doesn't break" — trust the code or add an assertion

**File-specific guidelines**:
- **main.js**: Large file with many event handlers; use `/* === */` section headers liberally
- **routing.js, gps.js, weather/*.js**: Use JSDoc to document exported functions' signatures and behavior
- **sw.js**: Document caching strategies and event handlers with `/* === */` headers
- **state.js**: JSDoc only; comments should explain *why* fields exist and their constraints

**Updating old files**: When touching a file, modernize its comments to match this standard. Don't fix everything at once; gradually converge as files are modified.

## Accessibility Standards (Mandatory for all UI)

**Goal**: Ensure all users—including those with disabilities using screen readers, voice control, or keyboard navigation—can access and understand the interface.

**Icon-only buttons MUST have `aria-label`**:
```html
<!-- ❌ Bad: Screen reader says just "button" -->
<button id="btn-settings">⚙️</button>

<!-- ✅ Good: Screen reader says "Open settings menu, button" -->
<button id="btn-settings" aria-label="Open settings menu">⚙️</button>
```

**Guidelines**:
1. Every button that uses only an emoji or icon must have an `aria-label` attribute describing its action
2. The label should be **action-oriented and concise** (e.g., "Toggle GPS tracking" not "The GPS button")
3. When modifying a button's functionality, update its aria-label
4. New buttons require aria-labels before merge—treat them as mandatory as the button HTML itself
5. Prefer action verbs: "Toggle", "Open", "Close", "Clear", "Export", "Show", "Hide"

**Testing**:
- **Mac/iOS**: Press Cmd+F5 to enable VoiceOver; use arrow keys to navigate and hear aria-labels
- **Windows**: Download and use NVDA (free, open-source screen reader); navigate with Tab key
- **Chrome**: Right-click any button → Inspect → check the Accessibility Tree (DevTools > Accessibility tab)

**Benefits**:
- Screen reader users can understand what each button does
- Voice control users (Dictation, Voice Access) can navigate by button names
- Keyboard-only users get context for buttons they tab through
- Exceeds WCAG AA accessibility standards (industry baseline)

**Scope**:
- Apply to all `<button>` elements with icon-only content
- Apply to any clickable element using `<span role="button">` (like the settings close button)
- Visual labels (text inside the button) don't need aria-label—the text itself is the accessible name

## UI Layout (Current)
**Search bar**: Floating pill, `position: fixed; top: 8px; left/right: 8px`. 72px left segment is mode toggle (🌍/🏕️); right segment is text input. Leaflet controls pushed down via `.leaflet-top { margin-top: 58px }`.

**Status row**: Three translucent pills in one line at `top: 66px; left: 16px`. All share the same dark pill style; independently addressable for future per-pill toggles.
| Pill | ID | Active | Off |
|---|---|---|---|
| 🛰️ GPS | `#gps-status` | `🛰️ 12m` (accuracy) | `🛰️ Off` |
| 🧭 Compass | `#compass-status` | `🧭 245°` (heading) | `🧭 Off` |
| 🔍 Zoom | `#zoom-status` | `🔍 14 / 19` | always visible |

Zoom pill turns red and appends ⚠️ when zoom exceeds 19 (digital zoom range). Driven by `map.on('zoomend')` in map.js via `MAX_NATIVE_ZOOM = 19`. Replaces the old `#zoom-warning` span that was in `#controls`.

**Right-side button column** (all `right: 20px`, bottom-up):
| Button | Bottom | Icon | Active behavior |
|---|---|---|---|
| ⚙️ Settings | 20px | static | opens modal |
| 📈 Elevation Graph | 80px | greyscale→color | colored while chart is open |
| 🥾 GPS Path | 140px | greyscale→color | colored while path recording is on |
| 📍 Locate | 200px | static | centers map on GPS fix |

**Zoom controls** (optional, toggled in settings): `bottom: 320px; right: 20px`

**Campground button** (separate from bottom column, top-right area):
`position: fixed; top: 128px; right: 10px` — directly below the Leaflet layers control toggle, horizontally aligned with it. Opens `#campground-panel` to its left. Green when panel is open.

**Campground panel** (`#campground-panel`): `top: 128px; right: 68px`. Contains agency checkboxes. Currently: CA State Parks. Expands as agencies are added.

**Left-side controls** (`#controls`, bottom-left): route button, route legend.

## Settings Modal — 3 Tabs
**Device**: Wake Lock, GPS, Compass, AR Camera toggles.

**Map Settings**:
- Street Routing: OSRM (unreliable) or Mapbox
- Geocoding: Nominatim (free), Photon (outdoor, free), or Mapbox
- `#api-keys-section`: dynamic — renders one key entry row per unique API-requiring provider currently selected. Empty when all selections are free. Mapbox routing + Mapbox geocoding = one shared key row.
- Map Zoom: Pinch, Double-tap, +/- button toggles

**Storage**: Per-bucket cache sizes with clear buttons; path export + clear.

## Geocoding Providers
| Provider | Key Required | Notes |
|---|---|---|
| Nominatim | No | OSM-based, 1 req/sec rate limit, 800ms debounce enforced |
| Photon (Komoot) | No | OSM-based, outdoor-tuned, default recommendation |
| Mapbox Geocoding v5 | Yes | Shares key with Mapbox Directions if both selected |

## Street Routing Providers
| Provider | Key Required | Notes |
|---|---|---|
| OSRM | No | Public demo server; unreliable, for testing only |
| Mapbox Directions | Yes | Reliable, free tier ~100k req/month |

Fallback: any street routing failure draws a straight dashed blue line rather than blocking navigation.

## Recent Improvements (June 5, 2026)

### Storage & Data Quality Fixes
1. **Removed unconditional `loadParkList()` on boot** — Park manifest was loading for every page refresh, even when user never searched for parks. Now loads only when user toggles to park search mode. Prevents unnecessary data loading.

2. **Fixed park file path errors** — Storage update check was constructing paths as `/parks/ca/state-parks/...` instead of `/parks/ca-state-parks/...`. Fixed path normalization in storage.js line 118 to replace slashes with dashes. Eliminated 315 console 404 errors on app update check.

3. **Switched weather API: Open-Meteo → NWS (api.weather.gov)**
   - **Why**: Open-Meteo doesn't return CORS headers despite claiming support; NWS (National Weather Service) has proper CORS headers. Both provide current conditions, hourly, and 7-day forecasts.
   - **Benefits**: Better weather data (text descriptions instead of codes, plus humidity/dewpoint), US-only coverage is acceptable for current use.
   - **Trade-off**: Two-step API lookup (grid point → forecast) instead of one, but results are cached so user-facing latency is negligible.
   - **Current weather accuracy**: Initially used daily forecast (which showed daytime highs, not current temp). Fixed to use hourly forecast and find the period covering current time, so popup shows actual current temperature.
   - **Humidity display**: Added relative humidity percentage (💧) to weather popup alongside wind speed. Updated popups.js to display: `💨 Wind | 💧 Humidity%`
   - **Actual storage**: ~5-10 KB per weather fetch (measured via Storage Management panel). Chrome DevTools quota shows inflated numbers (3+ MB) due to browser cache storage measurement quirk; use Storage Management as source of truth.

### Chrome DevTools Quota Measurement Issue
Chrome's cache storage quota API reports inflated sizes (600x+) for cached responses, even with proper CORS headers. This is a browser limitation, not a code problem. Actual storage is accurately reported in the app's Storage Management panel (⚙️ → Storage Management). Recommendations:
- Ignore DevTools cache storage quota numbers
- Use Storage Management panel for real measurements
- Monitor actual files as you add new data sources

## Global Weather System (Hybrid NWS + Open-Meteo) — COMPLETED (June 6, 2026)

**Goal**: Single robust weather system for current, 24-hour, and 7-day forecasts worldwide.

**Implementation**:
- **USA**: NWS (api.weather.gov) — text descriptions, humidity, elevation
- **Worldwide**: Open-Meteo (api.open-meteo.com) — WMO codes mapped to text descriptions
- **Architecture**: Provider auto-selection based on location; results cached to avoid redundant NWS checks
- **Offline Support**: Both providers cached in service worker (WEATHER_CACHE) for offline access

**File Structure**:
```
js/weather/
├── weather.js              Provider selector + unified interface
├── nws.js                  NWS provider (USA only)
├── open-meteo.js           Open-Meteo provider (worldwide) + WMO code mapping
├── utils.js                Shared helpers: degreesToCardinal(), formatWind()
├── nws-properties-reference.json        API property availability docs
└── om-properties-reference.json         API property availability docs
```

**Data Returned** (both providers):
- **Current weather popup**: Temperature, elevation (🏔️), wind (💨), humidity (💧), precipitation probability (🌧️), provider attribution link
- **24-hour forecast**: Hourly rows with temperature, wind, short description, provider attribution
- **7-day forecast**: Daily rows with temperature (max/min), wind (max), short description, provider attribution

**Key Features**:
1. **Provider auto-detection**: Attempts NWS first (USA); falls back to Open-Meteo for non-USA locations
2. **Provider caching**: Caches provider decision per coordinate; subsequent calls use cached result
3. **Service worker integration**: Both NWS and Open-Meteo responses cached in WEATHER_CACHE with Network-First strategy
4. **Proper attribution**: NWS → weather.gov link, Open-Meteo → open-meteo.com link (displayed in popups + forecast modals)
5. **No console errors**: NWS 404s for non-USA locations handled gracefully without throwing errors
6. **Storage management**: Weather Data cache size shown in Settings → Storage tab with Clear button
7. **Mobile-optimized forecast layout**: 24-hour and 7-day forecasts use three-column flexbox layout (Date/Time + Temp | Description | Wind + Precip) with text wrapping support. Responsive 12px font with emoji + value formatting. Precipitation probability now included in both forecast views for all providers.

**Future Improvements**:
- Provider cache currently has no TTL (indefinite). If NWS goes down after initial detection, cached result persists until page reload. Consider adding TTL to force periodic provider re-detection (e.g., 1 hour). Low priority — automatic fallback works well on initial load.
- Open-Meteo date parsing uses browser's local timezone. Works correctly when viewing POIs in user's local timezone (typical case), but could be off by 1 day if viewing distant locations where browser timezone differs from POI location. Consider timezone-aware library (date-fns, day.js) if cross-timezone accuracy becomes critical.

## Roadmap: Government GIS Integration

### Goal
Import live public land data from all major U.S. government park agencies — displayed as map layers alongside the existing topology-based routing system. Agencies include California State Parks, NPS, BLM, USFS, and state park systems in other states. Built one agency at a time, methodically.

### Architecture: Generic pipeline + per-agency adapters
The system is split into two parts so adding a new agency never touches shared rendering or caching code:

**Core GIS layer system** (built once, shared):
- Fetch → normalize to internal schema → cache → render → popup
- `campgroundLayer` holds campground markers from all loaded agencies; per-park detail (boundary, entry points, facilities) renders via `loadPark()` when a park is selected
- Service worker caching for offline use
- Agency toggles in the campground panel control visibility

**Per-agency adapters** (one per agency, self-contained):
- API endpoint(s) — ArcGIS REST, WFS, or other
- Field mapping to internal schema (`name`, `type`, `geometry`, `category`)
- Feature categories provided (boundaries, facilities, trail lines)
- Any quirks: pagination, non-WGS84 coordinate systems, auth requirements

### What GIS data covers (geometry only — no routing work needed)
- **Park boundaries** → drawn only for a single selected park via `loadPark()`. OSM base layers provide statewide boundary context, so no global boundary overlay is loaded.
- **Facilities** → point markers with attribute popups (restrooms, campgrounds, amphitheaters, trailheads, parking, visitor centers)
- **Park names/locations** → enriches search results and map context
- **Entry points** → have explicit LAT/LON fields; passed directly to `fetchStreetRoute()` for OSRM/Mapbox street routing with no changes to routing logic

### What GIS data does NOT cover (remains manual editor work)
- **Routing topology** — trail and road linestrings from GIS describe geometry, not traversability. Converting them to a routable node/edge graph requires snapping endpoints, detecting intersections, classifying edge types, and human review. This remains the editor's domain for parks where full routing is desired.
- These two systems coexist at separate layers and serve different purposes. GIS facilities are authoritative live government data; routing topology is custom-built traversal logic.

### Park file spectrum
Every park has a JSON file. The file exists on a spectrum based on how much work has been invested:

**MVP (auto-generated, all parks):**
```json
{
  "meta": { "name": "...", "unitNbr": "...", "agency": "ca-state-parks" },
  "boundary": { ...GeoJSON polygon... },
  "entryPoints": [ { "lat": 0, "lng": 0, "address": "..." } ],
  "facilities": [ ...campgrounds... ]
}
```
Enables (when the park is selected via `loadPark()`): boundary outline, facility pins, weather popups, street routing to gate.

**Full (after manual topology work in editor):**
Adds `"nodes"`, `"edges"`, and `"locations"` fields. Enables trail routing, AR breadcrumbs, multi-modal navigation. The app checks for `nodes`/`edges` at runtime — their absence gracefully degrades to MVP behavior.

(User-facing data experience — the campground panel and the two paths to park detail — is documented under "Roadmap: Campground Menu & Data Architecture" below.)

### Parks folder structure (Option C — hybrid)
```
parks/
├── federal/
│   ├── nps/
│   ├── blm/
│   └── usfs/
├── ca/
│   ├── state-parks/       ← CA State Parks MVP files live here
│   └── county-parks/
├── nv/
│   └── state-parks/
└── custom/                ← hand-built one-offs that don't belong to an agency
```

The `loc_manifest.json` at the root is the master index. Each entry uses a path-aware `id` field:
```json
{ "id": "ca/state-parks/anza-borrego", "name": "Anza-Borrego Desert SP" }
```
`loadPark(id)` fetches `./parks/${id}.json` — subfolder depth is transparent to all fetching logic. The service worker's `/parks/` substring match covers all depths with no changes.

### CA State Parks — confirmed data sources
All hosted at: `https://services2.arcgis.com/AhxrK3F6WM8ECvDi/arcgis/rest/services/`
All support `f=geojson` and `outSR=4326` (WGS84 output, no coordinate conversion needed).
All free, public, no authentication required. Attribution required: "CSP".

| Dataset | Endpoint | Features | Est. size | Tier |
|---|---|---|---|---|
| ParkBoundaries | ParkBoundaries/FeatureServer/0 | 462 | ~4–6 MB | 1 (bundled) |
| ParkEntryPoints | ParkEntryPoints/FeatureServer/2 | 288 | ~140 KB | 1 (bundled) |
| Campgrounds | Campgrounds/FeatureServer/0 | 531 | ~210 KB | 1 (bundled) |
| ParkingPoints | ParkingPoints/FeatureServer/0 | 2,342 | ~950 KB | 2 (per-park, live API) |
| PicnicGrounds | PicnicGrounds/FeatureServer/0 | 1,417 | ~570 KB | 2 (per-park, live API) |
| Buildings | Buildings/FeatureServer/0 | 3,184 | ~1.3 MB | 2 (per-park, live API) |
| Structures | Structures/FeatureServer/0 | 35,258 | ~14 MB ⚠️ | 2 (per-park, filtered by TYPE) |

Structures must be filtered by TYPE/SUBCLASS — loading statewide is not viable. Query distinct values before building the adapter to understand what types are useful.

Key shared fields across all datasets: `UNITNBR` (park identifier, join key), `UNITNAME` (park name), `GISID` (unique feature ID), `TYPE`/`SUBCLASS` (feature classification), `DETAIL` (specific function e.g. "Restroom", "Amphitheater").

### Build script — `parks/ca/state-parks/generate.js`
Run with: `node parks/ca/state-parks/generate.js` (requires Node 18+)

What it does:
1. Fetches boundaries (462), entry points (288), and campgrounds (531) from the ArcGIS API in parallel
2. Joins datasets by `UNITNBR`
3. Filters manifest entries against the hardcoded official 283-park list (sourced from parks.ca.gov/?page_id=21805, last verified May 2026)
4. Resolves duplicate slugs by preferring the richer entry (more entry points > higher acreage)
5. Writes one JSON file per boundary (408 files — all subtypes)
6. Updates `loc_manifest.json` with only the officially listed parks (315 entries)
7. Preserves all non-CA-state-parks entries in the manifest

Results from last run:
- 408 files written to `parks/ca/state-parks/`
- 315 added to manifest (matched official list) — only these are reachable via search or campground "Show Park Details"
- 49 duplicates resolved (richer entry kept)
- 93 excluded from manifest (sub-units, admin properties, divested lands) — written to disk but not reachable; harmless, could be skipped in a future build-script cleanup
- 5 skipped (missing UNITNBR in source data)

Re-run only when upstream CA State Parks data needs refreshing. Update the `OFFICIAL_PARKS` array in the script if CA adds/removes parks from their official list. Each future agency gets its own `generate.js` in its own subfolder.

Output is static JSON committed to the repo and deployed with the app. Richer Tier 2 data (parking, facilities, buildings) will be fetched live from the API when a user selects a park and cached by the service worker thereafter.

## Roadmap: Data Hosting Strategy

### The problem
Bundling all park JSON files in the repo does not scale. CA State Parks alone is ~32MB. At national scale (50 states + federal agencies) this becomes 500MB–1GB+, which GitHub Pages cannot host (GitHub balked at the CA-only push). Bundling was a clean starting point but must be replaced.

### Decided progression (revisit later — captured 2026-05-29)

**Step 1 — NOW: Runtime API fetching + service worker caching (Option D)**
- Remove bundled `parks/ca/state-parks/*.json` from the repo. Keep only `loc_manifest.json` (tiny) and hand-built topology files.
- `loadCACampgrounds()` and `loadPark()` MVP mode query the ArcGIS API directly at runtime instead of fetching local files.
- Service worker caches everything fetched (`tracker-data-v1`, never evicted) — fully offline after first use.
- `generate.js` becomes a reference/backup tool rather than a required build step.
- Matches how iOverlander / AllTrails / Gaia GPS actually work. First load of an agency needs internet (already true for tiles, weather, routing). User preps at home, data caches, then works offline in the field.
- Repo returns to being just code.

**Step 2 — FUTURE: Self-hosted static files (independence goal)**
- Motivation: reliability + protection from agency website changes/outages. User wants to own the data layer eventually.
- Approach: host the generate.js JSON output on a CDN the user controls — Cloudflare R2 recommended (no egress fees, ~$0.015/GB storage, ~$1–5/month total).
- Same JSON file format as today, just decoupled from the repo and served from owned infrastructure. No database, no backend code — still just files over HTTP.
- This is the sweet spot between simplicity and independence.

**Step 3 — LATER (only if needed): Self-hosted queryable API (PostGIS)**
- Enables spatial queries ("campgrounds within 50 miles"), amenity filtering, real-time updates, user data storage.
- Cost: $10–50/month VPS + maintenance burden (uptime, security, backups, SSL) + backend code.
- Only pursue when static files genuinely can't serve a needed feature.

### Why NOT GitHub Releases / Git LFS as the intermediate step
- GitHub Releases (static zip downloads) was considered but rejected: still a third-party dependency, doesn't achieve the stated independence goal, not queryable. It's a shortcut, not the right long-term answer.
- Git LFS: own storage/bandwidth limits, adds complexity without solving the fundamental scaling problem.
- Self-hosted static files (Step 2) achieve independence at nearly the same simplicity, so skip straight there.

### Why NOT a hosted DB (Supabase/PlanetScale) as Step 1 or 2
- PostGIS-capable and has free tiers, but requires network for every query, adds infrastructure to maintain, and breaks the serverless simplicity. Overkill for what is essentially structured JSON. Reserve database thinking for Step 3 only.

## Storage Architecture

### Cache bucket strategy
| Cache | Protection | Management |
|---|---|---|
| `tracker-shell-v1` | Never evict | App shell — JS, CSS, HTML |
| `tracker-data-v1` | Never evict | All park JSON files (MVP + topology). On-demand cached when user checks a campground agency or selects a park — never pre-cached en masse |
| `weather-data-v1` | No management | Small, refreshes automatically |
| `map-tiles` | 5,000 tile cap (~500MB at ~100KB avg) | FIFO eviction — oldest tiles deleted when cap exceeded |
| `tracker-detail-v1` | LRU, 30-day threshold | **Future** — Tier 2 ArcGIS detail fetches (parking, facilities, buildings per park) |

### Key storage decisions
- **Tiles are fetched with `mode: 'cors'`** in the service worker so responses are non-opaque and measurable via `response.blob().size`. Chrome's opaque response padding (7MB per entry in quota reporting) inflated apparent tile storage to ~1.7GB in DevTools; actual tile data is ~30MB per park session.
- **Map tile size measurement** uses real blob reads (parallel `Promise.all`) — accurate but takes a few seconds when opening the Storage tab on a large cache. This is acceptable since it runs in the background.
- **Park data is on-demand, not pre-cached** — MVP files are deployed with the app but only enter `tracker-data-v1` when the user first accesses them (checks a campground agency or selects a park). Scales to all future state/federal agencies with zero changes.
- **`tracker-data-v1` is never touched by eviction logic** — everything in it is intentional user-driven data.
- **QuotaExceededError** is caught in the map tiles handler. If the browser quota is hit despite the cap, caching is skipped silently and a status pill ("Storage full — clear map tiles in Settings") is shown to the user via a SW→client postMessage.

### Tile cap implementation (`sw.js`)
After each tile is cached, `cache.keys().length` is checked against `MAP_TILE_CAP = 5000`. If exceeded, the oldest tiles (FIFO — first entries in the keys array) are deleted until under the cap. This runs asynchronously after the response is already returned to the page, so it never delays tile rendering.

## Roadmap: Campground Menu & Data Architecture

### Core philosophy
OSM base layers already render park shapes, names, and jurisdiction boundaries visually. The app does not need to load GeoJSON boundary overlays globally — OSM handles that context for free. This eliminates the bulk boundary loading performance problem entirely.

### Two paths to park detail
Both call the same `loadPark()` function and produce identical results:

**Path 1 — Discovery via campground:**
Campground menu → user checks an agency → campground markers load → tap marker → weather popup + "Show Park Details" button → `loadPark()` renders full park detail (boundary, entry points, facilities, topology if available)

**Path 2 — Direct park search:**
Search bar (🏕️ park mode) → find park by name → select → `loadPark()` renders full park detail directly

### Campground menu (built)
A dedicated panel separate from the map layers control (`#campground-panel`, opened by the ⛺ button). Current behavior:
- Agency checkboxes — currently CA State Parks; one row per agency as data is added
- Checking an agency runs `loadCACampgrounds()`, which loads campground markers from all CA park files into `campgroundLayer` (loads once per session, stays in memory). Viewport-only loading is a planned optimization, not yet implemented (see below).
- Markers use the ⛺ emoji with zoom-based dot/icon swap. Per-agency color icons are planned (see Deferred: Campground Icon System).
- Tapping a marker shows the weather popup, a "Show Park Website" button (opens `meta.website`), and a "Show Park Details" button
- "Show Park Details" calls `loadPark(parkId)` for that specific park
- `setPOIPopup(marker, lat, lng, name, { parkId, website })` (popups.js) builds the popup; each button renders only when its option is present. `meta.website` is null for parks lacking an entry point record (it derives from ParkEntryPoints' PARK_WEB_PG), so the website button is conditionally hidden.

### Map layers control (stays simple)
Decoupled from campground data entirely. Contains only:
- Base tile layers (OSM, Voyager, Minimal, Satellite)
- Visual overlays (U.S. Federal Lands tile layer, and equivalent tile layers for other agencies if/when they exist)
- State park GeoJSON boundaries are NOT in this panel globally — CA State Parks confirmed no tile service; boundaries only draw for a single selected park via `loadPark()`

### Viewport-based loading (IMPLEMENTED for all campgrounds)
Campground markers from all agencies use incremental viewport-based rendering: markers load only for the current map view, with more loading as the user pans. Currently implemented for CA State Parks (602 campgrounds) and federal campgrounds (5,264 campgrounds). This pattern should be applied to all future POI categories (entrances, trailheads, etc.) to maintain consistent performance at scale.

### Scaling to new agencies
Add NPS, BLM, USFS campgrounds as new agency options in the campground menu. Same popup, same "Show Park Details" button, same `loadPark()` flow. No architectural changes needed per agency — just a new adapter and generate script.

### Campground pricing (deferred — pursue with federal agencies)
Pricing/fees are NOT in any GIS dataset — GIS is spatial/asset inventory only. The CA Campgrounds endpoint has no cost/fee/rate/reservation field (fields: Campground, TYPE, SUBTYPE, UNITNBR, DETAIL, UNITNAME, GISID, WHAT3WORD_ADDRESS).
- **CA State Parks**: real pricing lives in ReserveCalifornia (reservecalifornia.com). Its API is undocumented/unofficial — fragile and ToS risk. Do NOT scrape it. The "Show Park Website" button is the right answer for CA — it sends users to the authoritative pricing/booking source.
- **Federal (NPS/BLM/USFS)**: Recreation.gov's RIDB (Recreation Information Database) has a documented, official public API that includes campground fees and reservation data. When federal agencies are added, RIDB is a legitimate path to show pricing directly in popups. This is the future opportunity worth pursuing.

### Campground marker zoom behavior
Campground markers display differently based on zoom level — no data loading threshold needed since even all CA state parks (~531 campgrounds) is only ~200KB of point data. Visual clutter is the only real concern.

- **Zoom < 10**: small filled dot (4-6px, agency color) — gives spatial density context without icon clutter
- **Zoom ≥ 10**: full tent icon (current divIcon SVG) — legible, tappable, with agency color coding

Implementation: a single CSS class toggle on the `#map` container on every `zoomend` event. Each campground marker's `divIcon` contains both a `.camp-dot` and a `.camp-tent` element. CSS shows/hides the appropriate one based on `#map.zoom-low` / `#map.zoom-high` class. One DOM operation updates all markers simultaneously regardless of count — scales to 25,000+ markers with zero performance penalty.

```css
#map.zoom-low  .camp-tent { display: none; }
#map.zoom-low  .camp-dot  { display: block; }
#map.zoom-high .camp-dot  { display: none; }
#map.zoom-high .camp-tent { display: block; }
```

### Manifest bounding box (needed for viewport-based loading)
Currently the manifest only stores `{id, name}`. Viewport-based campground loading requires knowing which parks overlap the current map view without fetching every park file. Add `bbox: {north, south, east, west}` to each manifest entry during the `generate.js` run — the boundary polygon data is already available to compute it. Then filter manifest entries by bbox intersection before deciding which park files to fetch.

### Dispersed camping strategy

Dispersed camping has no canonical site — it's land status, not a facility. Government data comes in two distinct forms that belong in different parts of the app:

**Dispersed camping zones (approved area polygons)**
- Published by BLM and USFS as boundary polygons ("you can camp anywhere within this area")
- Land status overlays — belong in the **map layers control** alongside the federal lands overlay, not in the campground menu
- Same treatment as the existing federal lands tile layer when the time comes

**Individual dispersed sites (specific spots within zones)**
- Government data does not enumerate these — no "campsite #47" exists in any official dataset
- Community knowledge is more accurate than agency data here
- Source: **manual creation** (editor tool) + **user-generated content (UGC)**
- This is how iOverlander, Campendium, and FreeCampsites.net work — the right model for this app

**UGC infrastructure dependency**
UGC requires a backend to store, sync, and serve user-contributed sites — a meaningful step up from the current serverless architecture. Ties directly into the Step 3 PostGIS roadmap. Moderation is a real concern once users can add markers (false locations, inappropriate content). Keep this scope in mind when approaching Step 3.

**Three data sources, three treatments**
| Data | Source | Where in app |
|---|---|---|
| Developed campgrounds | Government APIs (CA State Parks, BLM, NPS, etc.) | Campground panel — per-agency markers |
| Dispersed camping zones | BLM/USFS boundary polygons | Map layers control — overlay |
| Individual dispersed sites | Manual + UGC | Campground panel (future) — requires PostGIS backend |

### What we are NOT building (yet)
- Global state park boundary overlays (OSM handles visual context)
- ArcGIS spatial query on long press ("which park contains this point?") — interesting technically but not needed given the two primary paths above
- Per-agency sub-menus for data types (boundaries/campgrounds/entry points) at the global level — park detail is always per-park, triggered by user intent
- UGC dispersed site markers — depends on Step 3 PostGIS backend

## Deferred: Campground Icon System

Currently all campgrounds use the ⛺ emoji regardless of agency or site type. The planned upgrade:

**Icon source**: NPS Recreation Symbol Set (public domain, US government works). Used across all federal land agencies — includes camping, group camping, equestrian camping, bicycle camping, picnic areas, trailheads. Credit line: "Recreation symbols courtesy U.S. National Park Service."

**Agency color coding**: Use the `makeTentIcon(color)` SVG approach (already designed and previewed). Colors match the federal lands legend: CA State Parks = blue (#0078FF), BLM = yellow (#FFE57F), NPS = purple (#D9C2E6), USFS = green (#C1E6B3), etc.

**Site type variants** (base + modifier composite icons):
- Single tent = standard campsite
- 3 tents = group site
- Tent + horse = equestrian camping
- Tent + bike = bike-in camping

**Implementation**: `makeTentIcon(type, agency)` function — base NPS SVG colorized by agency, modifier icon layered in corner. Campground `TYPE`/`SUBTYPE` fields in the park files drive which variant is shown.

**Before building**: Query distinct `SUBTYPE` values from the CA State Parks Campgrounds endpoint to understand data quality. "Not Defined" was the most common value seen in Anza-Borrego data — if most campgrounds lack useful type data, icon differentiation has limited value until data improves.

## Architectural Decision: Viewport-Based Rendering for All POI Markers

All point-of-interest markers (campgrounds, parks, entrances, trailheads, etc.) must use viewport-based incremental rendering to maintain consistent performance at scale. This pattern is non-negotiable for new POI categories added to the app.

**Rationale**: 
- Prevents memory bloat when rendering hundreds or thousands of markers
- Ensures consistent user experience regardless of data volume
- Already proven effective: CA State Parks (602) and Federal (5,264) both use this pattern without performance degradation
- Scales to nationwide and beyond without architectural changes

**Implementation Pattern**:
- Fetch POI data (paginated or full; cached)
- On map pan/zoom, filter POIs by current viewport bounds
- Create/show markers only for visible POIs; remove/hide when panned out of view
- Keep POI objects in memory, but DOM markers are ephemeral

**Applies to**: Campgrounds (done), Future categories: entrances, trailheads, parking areas, visitor centers, etc.

## Architectural Decision: Persistent Marker Objects in Memory

All marker objects are stored permanently in Maps (`allFederalMarkers`, `allCAMarkers`, etc.) and never destroyed, even when markers are removed from the map view. Currently ~5,666 marker objects (5,264 federal + 602 CA).

**Rationale**:
- **Popup durability**: Markers remain clickable and popup-ready without re-fetching or re-parsing data on every pan/zoom cycle
- **Performance**: Avoids the cost of destroying and recreating marker DOM elements repeatedly as users pan
- **Simplicity**: Single source of truth for marker state; no need to coordinate between in-memory data and visible markers
- **Proven effective**: Users can navigate the entire map at any zoom level without lag or popup inconsistency

**Tradeoff**:
- Memory grows to ~5,666 objects per viewing session (acceptable for typical mobile devices)
- No automatic cleanup on app close (IndexedDB persists separately; marker memory is session-only)

**This is intentional**: The memory cost is negligible compared to the benefits of instant, reliable popup access anywhere on the map. Not a bug or performance issue.

## Pre-New-State Checklist (Do Before Adding Next Agency/State)

**Standardize popup options structure** (June 2026)
When adding the next campground state or agency, standardize the `setPOIPopup()` options object across all agencies:
- **Current inconsistency**: CA passes `{ parkId, website }`, Federal passes `{ agency }`
- **Proposed solution**: All agencies should pass a unified options object with optional fields: `{ parkId, website, agency, ... }`
- **Why now?**: About to add multiple new states/agencies; better to establish the pattern before it grows messier
- **Effort**: ~5 minutes when bundled with the new state work
- **How**: Update 2 call sites in main.js + 1 function in popups.js to handle all optional fields gracefully
- **Related code**: main.js lines 173, 385; popups.js setPOIPopup() function

When you ask about adding a new state/agency, this will be flagged for completion first.

## Known Limitations / Deferred Items
- **Internal/external POI routing detection (June 2026)**:
  - **Current implementation (loaded parks)**: When a user clicks a facility/campground popup within a loaded park detail view, `toggleRoute()` auto-detects if the destination is an internal topology node (within ~100 feet). If matched, sets `isExternal=false` and includes `node_id`, enabling multi-modal routing (street to park gate + topology within park). This fixes the bug where facilities were treated as external despite being inside loaded parks.
  - **Park routing entrance threshold (1000 feet)**: When routing to an internal destination, the app checks if user is >1000 feet from the closest topology node. If yes, it fetches street route to a park entrance; if no, routes directly from closest node. The 1000 ft threshold is arbitrary and may not work for all park geometries.
  
  **Proposed Solution (Option C — Auto-detect Best Entrance)**: Instead of a fixed threshold, calculate the optimal park entrance dynamically:
  1. For each potential entrance node (trailheads + offroad nodes), calculate: `total_distance = street_route(user → entrance) + trail_distance(entrance → destination)`
  2. Pick the entrance with minimum total distance
  3. Only use street routing if beneficial; if trail routing alone is shorter, skip it
  
  This eliminates the arbitrary threshold by letting the shortest path win. However, this approach has significant tradeoffs and is deferred:
  
  **Issues with Option C**:
  - **API cost explosion**: Would multiply street routing API calls by 10x (1-2 calls → 5-20 per route). On Mapbox free tier (~10 req/sec), rapid map interaction could queue requests or trigger rate limits.
  - **Unreachable entrances**: Nodes marked as trailheads in park JSON might not be reachable via street (OSM data gaps, incorrect coordinates, detours). Requires robust fallback logic and error handling for failed API calls.
  - **Node metadata quality**: Not all parks have accurate `node.type` fields. Hand-built parks vary in completeness, making reliable entrance detection difficult.
  - **Code complexity**: Requires parallel async coordination, sophisticated error handling, and edge case handling (parks with one node, walk-only paths, destination is itself an entrance). ~100+ lines of new logic with multiple failure modes.
  - **Performance during map interaction**: Panning while calculating routes could trigger 50-100 concurrent API calls, causing slowdowns.
  - **Data coupling fragility**: Depends on park JSON accuracy AND OSM street data AND street routing API staying in sync. Silent degradation if any changes.
  
  **Recommended intermediate step**: Pre-compute "entrance viability" once per park load (which nodes are actually reachable from streets) and validate `node.type` metadata on park load. This gets 80% of the benefit with 20% of the complexity. Revisit full Option C only if entrance detection becomes a demonstrated problem in production.
  
  - **Future: Dispersed POI handling**: When dispersed campgrounds are added to index files (can't build individual parks for each), will need a way to route users from streets to remote sites via dirt roads/access paths. Planned approach: index entries for dispersed POIs will include `isInternal: true` flag + simplified node-based path segment (access road to the site, created in editor). Routing logic will detect these via index data and use internal-style routing. This defers the infrastructure build until dispersed site data actually exists, avoiding premature overengineering of index schema.
- **Leaflet layers control hover behavior**: On desktop, the layers panel opens on mouse hover — this is Leaflet's built-in default. Multiple attempts to override it (setTimeout collapse, capture-phase event blocking) all failed or introduced regressions. Reverted to pure Leaflet default. The only reliable fix is replacing `L.control.layers()` entirely with a custom HTML panel. Non-issue on mobile (the primary target platform).
- **Editor**: `map_editor v1.19.html` was explicitly excluded from the module system and remains a standalone monolith.

## Service Worker Cache Buckets
| Name | Contents | Strategy |
|---|---|---|
| tracker-shell-v1 | index.html, styles.css, js/*.js, CDN scripts | Never evict |
| tracker-data-v1 | parks/*.json (all agencies) | Never evict |
| map-tiles | OSM, Esri, CartoDB, BLM tiles | 5,000 tile cap, FIFO eviction |
| weather-data-v1 | Open-Meteo + USGS EPQS responses | No management needed |

## Testing Notes
- Dev environment: VS Code Live Server
- Live environment: GitHub Pages + Android PWA install
- After any SW change: unregister in DevTools → Application → Service Workers, clear site data, refresh
- For all other changes: use Settings → Check for Updates (force update button) or Ctrl+Shift+R
- OSRM public server can be slow (20-30s) or return CORS/502 errors — expected, not a bug
