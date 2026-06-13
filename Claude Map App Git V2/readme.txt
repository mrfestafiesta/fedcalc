# Dynamic Tracker: Decoupled AR & Routing App

=========================================
OVERVIEW
=========================================
A Progressive Web App (PWA) designed for offline, multi-modal wilderness navigation. The application provides GPS path recording, live AR (Augmented Reality) trail breadcrumbs, U.S. Federal Land overlays, CA State Parks overlays (boundaries, entry points, campgrounds), and Federal Developed Campgrounds (5,264 locations across all agencies: BLM, USFS, NPS, ACOE, USBR, USFWS, etc., with state filtering and agency identification), plus live weather data including wind speed and direction. A floating search bar with switchable park/map modes allows searching both a local park database and a configurable geocoding provider. It utilizes a custom routing engine to gracefully hand off navigation from a configurable street routing API to private, custom-built offline topology graphs. Parks without hand-built topology degrade gracefully to MVP mode: boundary display, facility markers, and street routing to the nearest entry point.

=========================================
CORE FILE ARCHITECTURE
=========================================
The application uses native ES modules (no build tools). index.html is a thin shell; all logic lives in the js/ directory.

1. index.html
The HTML skeleton. Defines DOM structure only: the map container, camera viewport, controls, settings modal, chart modal, and status elements. Loads all JS via <script type="module" src="./js/main.js">.

Key DOM Structures:
- #search-container / #search-pill: A floating pill-shaped search bar fixed above the map (top: 8px, full-width). The left segment is a 72px mode toggle button (🌍 map mode / 🏕️ park mode). In map mode, the input triggers geocoding against the configured provider with 800ms debounce. In park mode, the input filters the local park list loaded from loc_manifest.json. Replaces the former park selector dropdown.
- #status-row: Three side-by-side translucent status pills fixed below the search bar (top: 66px). Each pill is independently addressable for future toggle functionality.
  - #gps-status: Shows "🛰️ Xm" (GPS accuracy in meters) when active, "🛰️ ..." while acquiring, "🛰️ Off" when disabled. Updated by gps.js.
  - #compass-status: Shows "🧭 X°" (device heading in degrees) when active, "🧭 Off" when disabled. Updated by ar.js.
  - #zoom-status: Always visible. Shows "🔍 X / 19" (current zoom / max native zoom). Turns red and appends ⚠️ when zoom exceeds 19 (digital zoom territory). Driven by map.js.
- #camera-container: Absolute-positioned viewport hosting the live video feed. AR breadcrumbs and bubbles are injected here by ar.js.
- #controls: A flex column stack (bottom-left) containing the route legend display. (Note: the "Show Route" button was moved from this location to POI popup buttons for better UX — see "Unified Routing Destination System" section below.) The Elevations graph button was moved to the right-side button column. The zoom warning was replaced by the #zoom-status pill in #status-row.
- Right-side button column: Four fixed circular buttons (50px, rgba(50,50,50,0.9) background) stacked bottom-to-top on the right edge. From bottom: ⚙️ Settings (20px), 📈 Elevation Graph (80px), 🥾 GPS Path (140px), 📍 Locate (200px). Path and graph buttons use grayscale(100%) by default and grayscale(0%) when active.
- ⛺ Campground button: Separate from the bottom column. Fixed at top: 128px, right: 10px — directly below the Leaflet layers control toggle, horizontally aligned with it. Turns green when the panel is open. Opens #campground-panel to its left.
- #campground-panel: Fixed at top: 128px, right: 68px. White card with agency checkboxes. Lists CA State Parks and Federal Developed Campgrounds with hierarchical controls.
  - CA State Parks: Single checkbox. Load/unload 602 campgrounds.
  - Federal Campgrounds: Two mutually exclusive toggles (only one can be selected at a time, default is both off):
    - "All Campgrounds": Loads all 5,264 federal developed campgrounds across all US agencies (BLM, USFS, NPS, ACOE, USBRR, USFWS, etc.).
    - "By State": Shows checkboxes for CA, NV, AZ, UT. User selects one or more states to view only those campgrounds. When unchecked, state checkboxes hide and all federal campground markers are removed.
  - Viewport-based lazy rendering ensures smooth performance: only markers visible in current map bounds are rendered in the DOM (30-100 markers typical at any zoom).
- #settings-modal: Three-tab management hub.
  - Device tab: Wake Lock, GPS, Compass, and AR Camera toggles.
  - Map Settings tab: Street Routing provider select, Geocoding provider select, dynamic #api-keys-section (see API Key Management below), and Map Zoom toggles.
  - Storage tab: Real-time byte calculations of Cache API and IndexedDB storage with granular clear/export buttons.

2. js/state.js
The single source of truth for all shared mutable state. Exports one `state` object that all modules read and write, replacing scattered globals. Also exports shared constants: MAX_AR_RADIUS_FEET, MIN_BREADCRUMB_SPACING, compassEvent.

3. js/map.js
Instantiates the Leaflet map and exports all layer groups used across modules. Defines four base tile layers (see External APIs section), the BLM federal lands overlay, and the campground layer group. Exports: map, osmLayer, voyagerLayer, cartoLayer, satelliteLayer, federalLandsLayer, campgroundLayer, userMarker, pathLine, routeLayer, dotLayer, dynamicPoiLayer, trailPathLayer.

campgroundLayer is a Leaflet LayerGroup managed exclusively by the campground panel in main.js — it is NOT registered in the Leaflet layers control. Added to or removed from the map when the user checks/unchecks an agency in the campground panel. Both CA State Parks (602 markers) and BLM (5,264 markers) share this single layer, with viewport-based rendering limiting DOM markers to 30-100 at any time.

Also owns the zoom status display: updateZoomStatus() fires on every zoomend event, updating #zoom-status with the current and max native zoom level. MAX_NATIVE_ZOOM = 19. Adds the .digital CSS class (red text + ⚠️) when zoom exceeds 19.

4. js/routing.js
Owns all routing concerns: offline graph algorithms, street API integration, provider configuration, and routing settings UI initialization.
- getClosestNode / findShortestPath / formatRouteDist: Core offline math engine (Dijkstra's algorithm with 3D Pythagorean weighting).
- getRoutingProvider / getMapboxKey: Read provider preference and API key from localStorage.
- setRoutingAttribution(type): Dynamically updates the Leaflet map attribution to reflect the active street routing provider.
- fetchStreetRoute(fromLng, fromLat, toLng, toLat): Provider-agnostic street routing. Reads the active provider from localStorage and builds the appropriate Mapbox or OSRM request. Both providers return an identical { distance, coords } shape so all downstream logic is shared.
- initRoutingSettingsUI(): Populates the routing provider select with the saved value on settings open. No longer manages the API key section directly — that is handled by updateApiKeySections() in main.js.

5. js/weather/ (Folder)
Unified hybrid weather system serving current conditions, 24-hour, and 7-day forecasts globally. Automatically selects NWS (USA) or Open-Meteo (worldwide) based on location. Knows nothing about popups, markers, parks, or the DOM — display is handled by popups.js.

Structure:
- weather.js: Provider selector and unified interface. Exports fetchWeather(), fetchForecastHTML(), and selectProvider().
- nws.js: NWS (National Weather Service, USA only) provider. Fetches from api.weather.gov.
- open-meteo.js: Open-Meteo (worldwide) provider. Fetches from api.open-meteo.com. Includes WMO weather code mapping.
- utils.js: Shared helpers: degreesToCardinal(deg), formatWind(speed, direction).
- nws-properties-reference.json, om-properties-reference.json: API property availability reference docs.

Exports from weather.js:
- fetchWeather(lat, lng): Returns { tempF, windText, humidity, elevationFt, precipitationProbability, provider }. Throws on API failure.
- fetchForecastHTML(lat, lng, mode): Returns forecast rows as HTML. mode is 'daily' (24-hour) or 'weekly' (7-day). Cached 1 hour per coord+mode.
- selectProvider(lat, lng): Determines which provider to use; results are cached per coordinate.

Provider behavior:
- NWS (USA): Text descriptions from shortForecast field. No weather code mapping needed.
- Open-Meteo (worldwide): WMO weather codes (0-99) mapped to text descriptions via weatherCodes object in open-meteo.js.
- Caching: Provider decisions cached to avoid redundant NWS checks for same location. Both providers cached in service worker for offline access.

Data returned (both providers):
- Current: tempF, windText (speed + cardinal direction), humidity (%), elevationFt, precipitationProbability (%)
- 24hr forecast: hourly rows with time, temperature, wind, description, precipitation probability
- 7-day forecast: daily rows with date, temperature (max/min), wind, description, precipitation probability
- Attribution: NWS → weather.gov, Open-Meteo → open-meteo.com (displayed in popups + forecast modals)

Forecast layout (24hr & 7-day):
- Left column (fixed width): Date/Time and Temperature
- Middle (flexible): Forecast description (wraps without pushing other elements)
- Right column: Wind and Precipitation Probability
- Responsive mobile-friendly design with condensed formatting (12px font, emoji + value pairs)

5b. js/popups.js
Popup and modal COMPOSITION and DISPLAY. Pulls weather values/forecast HTML from weather.js, determines weather provider, and assembles everything else (park website + park details buttons, the forecast modal). Exports:
- setPOIPopup(marker, lat, lng, name, options): calls fetchWeather, builds the POI popup with:
  - Weather section: current temperature, elevation (🏔️), wind (💨), humidity (💧), precipitation probability (🌧️), and provider attribution link
  - Forecast buttons: "24 Hr" and "7-Day" open the forecast modal
  - Conditional park buttons: "Show Park Website" (if meta.website present), "Show Park Details" (if parkId present)
  - Route button: "Show Route" or "Clear Route" depending on whether this POI is the active route destination
  - options = { parkId, website }
- showForecast(lat, lng, mode, poiName): opens the forecast modal, determines provider via selectProvider(), inserts the forecast HTML from fetchForecastHTML, appends provider attribution link at bottom, handles errors.
window.fetchForecast is set to showForecast here so inline popup buttons can call it.

6. js/ar.js
AR world management and compass logic. Exports: buildARWorld, clearARWorld, spawnARNode, updateARPositions, handleOrientation, toggleCompassUI.
- handleOrientation: Updates #compass-status with "🧭 X°" on each device orientation event.
- toggleCompassUI: Sets #compass-status to "🧭 Off" when compass is disabled.

7. js/gps.js
All GPS concerns: live position watching, interval-based path logging, IndexedDB persistence, export, and clearing.
- startPositionWatch(): Registers navigator.geolocation.watchPosition, updates state.latestFix, moves the user marker, and updates #gps-status with "🛰️ Xm" (accuracy in meters).
- startGPSLogger(): 5-second interval that logs coordinates to IndexedDB when path recording is active (only when movement exceeds 3 ft to prevent duplicate points).
- loadSavedTrip / exportPathAsGeoJSON / clearPathData: IndexedDB path management.

8. js/storage.js
Cache management, wake lock, service worker registration, and the force update system.
- CACHES: Exported constant defining all four cache bucket names (imported by main.js for the clear buttons).
- forceUpdate(): Fetches the live version of all app shell files (index.html, styles.css, and all js/*.js modules) and all park JSON files, compares them byte-for-byte against the cached versions, and reloads if any differ.
- refreshStorageNumbers / getCacheSizeMB / getPathSizeMB: Calculate and display storage usage in the settings grid. getCacheSizeMB() reads actual blob sizes in parallel (Promise.all) for all cache buckets — accurate for non-opaque responses. Map tiles are fetched with mode:'cors' in the SW so their sizes are fully readable.
- requestWakeLock / registerServiceWorker / showStatusPill: Device and lifecycle utilities.

9. js/main.js
Event listeners and boot sequence only. Wires all DOM interactions (buttons, selectors, modals, map context menu) to functions imported from the other modules. Contains no business logic.

Key functions defined here:
- loadParkList(): Fetches parks/loc_manifest.json into the parkList array on boot.
- loadPark(parkId): Dual-mode park loader. If the park file contains nodes/edges (hand-built topology), renders trail edge polylines and POI markers — existing behavior. If the park file contains boundary/entryPoints/facilities but no topology (MVP mode), renders a GeoJSON boundary outline, entry point markers with weather + routing, and campground markers with weather. Entry point and campground markers create popups with "Show Route" buttons that set state.routeDestination (unified routing system).
- loadCACampgrounds() / loadFederalCampgrounds(): Load index files from `/parks/ca-state-parks/ca-state-parks-index.json` (602 campgrounds) and `/parks/federal/index.json` (5,264 federal campgrounds from all agencies). Pre-create all marker objects once, store in allCaMarkers / allFederalMarkers Maps. Federal campgrounds also extract and store agency field for popup display.
- renderCACampgrounds() / renderFederalCampgrounds(): Viewport-based incremental rendering. Determine which campgrounds are visible in current map bounds, add newly-visible markers, remove those that left viewport, keep existing visible ones. Markers persist in memory for popup durability during pan/zoom. Federal rendering handles both "All Campgrounds" (no filtering) and "By State" (filter by selected state codes) modes.
- window.showParkDetails(parkId): Called by "Show Park Details" buttons in campground popups. Calls loadPark() and updates the search input. This is the bridge between campground discovery and full park detail.
- getGeocodingProvider(): Reads the active geocoding provider from localStorage (default: 'nominatim').
- updateApiKeySections(): Inspects the active routing and geocoding providers, deduplicates any shared providers (e.g. Mapbox selected for both), and dynamically renders one key entry row per unique API-requiring provider into #api-keys-section. Renders nothing if all active providers are free.
- window.saveApiKey(provider): Called by dynamically-rendered Save Key buttons. Persists the key to localStorage under the provider's storage key and updates the status label.

Also listens for QUOTA_EXCEEDED postMessage from the service worker and shows a red status pill directing the user to clear map tiles in Settings.

Boot sequence: loadParkList → loadSavedTrip → startPositionWatch → startGPSLogger → registerServiceWorker → setRoutingAttribution → applyZoomSettings.

10. sw.js (Service Worker)
Acts as the offline proxy. Intercepts all network requests and routes them to four isolated cache buckets:
- tracker-shell-v1: index.html, styles.css, all js/*.js modules, CDN scripts. Never evicted.
- map-tiles: OSM, CartoDB, Esri satellite, and BLM federal boundary tiles. Capped at 5,000 tiles (~500MB at ~100KB average). Oldest tiles evicted first (FIFO) when cap is exceeded. Tiles fetched with mode:'cors' so responses are non-opaque and size-measurable. QuotaExceededError is caught and reported to the app via postMessage.
- tracker-data-v1: All park JSON files (MVP + topology, all agencies). On-demand cached when accessed — never pre-cached. Never evicted. Includes all index files for campgrounds (ca-state-parks-index.json, federal/index.json).
- weather-data-v1: Open-Meteo and USGS EPQS responses (Network-First strategy). No eviction management needed.

Service Worker Caching Strategy:
The SW intercepts all network requests and applies different strategies based on request type:

1. Map Tiles (OSM, CartoDB, Esri, BLM)
   - Strategy: CACHE-FIRST (check cache, fall back to network)
   - Caching: Yes, with 5,000-tile cap (~500MB)
   - Use case: Map background layers need to be fast; tiling is expensive to re-fetch

2. Park Data (JSON indexes)
   - Strategy: CACHE-FIRST (check cache, fall back to network)
   - Caching: Yes, perpetual (no eviction)
   - Use case: Static data; users expect instant load on return visits
   - Important: Park JSON fetches should NOT use `cache: 'no-store'`
   - Why: `cache: 'no-store'` prevents the SW from caching, defeating the purpose of persistent offline data

3. App Shell (HTML/CSS/JS)
   - Strategy: CACHE-FIRST with network fallback
   - Caching: Yes, persistent
   - Use case: Core app assets must load instantly, even offline

4. Weather Data
   - Strategy: NETWORK-FIRST (try network, fall back to stale cache)
   - Caching: Yes, but expects network updates
   - Use case: Weather should be as fresh as possible, but fallback to last-known if offline

5. API Requests (e.g., Nominatim geocoding)
   - Strategy: CACHE BYPASS (no caching)
   - Method: Use `fetch(url, { cache: 'no-store' })`
   - Use case: Requests that must always return fresh results
   - Example: Search results should reflect current data, not cached from previous search

Fetch Option Guidelines:
- DEFAULT (no cache option): Let SW cache per its strategy (CACHE-FIRST for parks/tiles)
- `cache: 'no-store'`: Only for API requests that genuinely need fresh data every time
  - Used in: Nominatim geocoding (lines 513 in main.js)
  - NOT used in: Park JSON, tiles, or any static data
- Avoid: `cache: 'no-store'` on static data prevents beneficial caching and harms offline capability

Storage notes:
- Chrome inflates opaque (no-cors) response sizes to ~7MB each in DevTools quota reporting. Using mode:'cors' for tiles eliminates this inflation and shows true sizes (~30MB per park session).
- iOS Safari purges all PWA storage if the app has not been opened in 7 days. Users should open the app before a trip to ensure offline tile coverage is current.
- A future tracker-detail-v1 bucket will hold Tier 2 ArcGIS detail fetches (parking, facilities, buildings) with a 30-day LRU eviction policy.
- Park data (CA + Federal indexes combined) is ~1.1 MB and persists indefinitely once cached.

11. manifest.json
Web App Manifest. Defines the app icon, theme color (#28a745), and enables native install on Android/iOS homescreens.

12. parks/loc_manifest.json & parks/[id].json
The park database. loc_manifest.json is the master index — 318 entries (3 hand-built + 315 CA state parks). Each entry uses a path-aware id field so loadPark() constructs the correct subfolder path: { "id": "ca-state-parks/anza-borrego-desert-sp", "name": "Anza-Borrego Desert SP" }.

Park files exist on a spectrum:
- MVP (auto-generated): contains meta, boundary (GeoJSON polygon), entryPoints (lat/lng/address), facilities (campgrounds). Enables boundary overlay, weather, and street routing to the gate.
- Full (hand-built topology): adds nodes, edges, locations. Enables trail routing, AR, and multi-modal navigation.
loadPark() detects which format is present at runtime and renders accordingly.

Folder structure:
  parks/
  ├── loc_manifest.json          (master park index: 318 entries pointing to park files)
  ├── red_rock_canyon_sp.json    (hand-built topology park)
  ├── lmuTest.json               (hand-built topology park)
  ├── ca-state-parks/
  │   ├── ca-state-parks-index.json  (consolidated: 602 CA State Parks campgrounds)
  │   ├── ca-state-parks-index.js    (generator: reads 408 individual parks, generates index)
  │   ├── anza-borrego-desert-sp.json
  │   ├── big-basin-redwoods-sp.json
  │   ├── ... 405 more individual park files (used for detail view when "Show Park Details" is clicked)
  │   └── colonel-allensworth-shp.json
  └── federal/
      ├── index.json             (consolidated: 5,264 federal developed campgrounds)
      └── generate.js            (generator: RIDB API scraper for unified federal index)

Note on parkId: When a CA State Parks campground popup shows "Show Park Details", the click handler uses the
parkId (e.g., "ca-state-parks/colonel-allensworth-shp") to fetch the corresponding detail file from the
parks folder. parkId format MUST match the actual folder structure.

=========================================
FEDERAL DEVELOPED CAMPGROUNDS INTEGRATION (June 2026)
=========================================
Federal developed campgrounds are sourced from the RIDB (Recreation Information Database) API:
https://ridb.recreation.gov/api/v1

Agencies Included (by ParentOrgID):
- 126: BLM (306 campgrounds)
- 128: NPS (566 campgrounds)
- 130: ACOE (953 campgrounds)
- 131: USFS (3,407 campgrounds)
- 129: USBR (13 campgrounds)
- 127: USFWS (6 campgrounds)
- Others: Navy, Presidio Trust, and unknown agencies (10 campgrounds)
Total: 5,264 federal developed campgrounds

Data Generation:
- Script: parks/federal/generate.js (Node 18+)
- Fetches /facilities endpoint (all agencies, no organizationID filter)
- Filters for entries with type="campground" and valid GPS coordinates
- Filters by ParentOrgID to identify managing agency
- Fetches /facilityaddresses endpoint to get state codes (AddressStateCode field)
- Joins state data by FacilityID to each campground
- Output: parks/federal/index.json with structure: { facilityId, name, lat, lng, state, parentOrgId, agency }
- Note: state field is null for 1,075 campgrounds missing address records (future: reverse geocode via lat/lng)

Data Stats:
- Total federal facilities: 15,286
- Developed campgrounds with valid GPS: 5,264
- Campgrounds with state codes: 4,189 (79.6%)
- Campgrounds with null state: 1,075 (20.4%, reserved for future geocoding)
- File size: ~950 KB

MVP UI:
- User opens campground panel (⛺ button)
- Federal Campgrounds section has two mutually exclusive toggles (only one can be on, both default to off):
  - "All Campgrounds": Loads and displays all 5,264 federal developed campgrounds across the US
  - "By State": Shows checkboxes for CA, NV, AZ, UT. User selects state(s) to filter (multiple states can be selected simultaneously)
  - When "By State" is toggled off, all state checkboxes uncheck and all federal markers are removed
- Markers: Yellow circle (low zoom <10) / Yellow tent emoji (high zoom ≥10) — consistent across all agencies
- Popup on click: Campground name + agency (e.g., "BLM", "USFS", "NPS") + weather (temp, wind, elevation)
- Performance: Viewport-based lazy rendering keeps DOM to 30-100 visible markers (even with 5,264 campgrounds in "All Campgrounds" mode)

Popup Information:
- Name (from RIDB)
- Agency (from ParentOrgID mapping)
- Weather: Current conditions from Open-Meteo (temp, wind, elevation)
- Forecast buttons: 24-hour and 7-day forecasts available

Known Limitations:
- 1,075 campgrounds (20.4%) have state=null due to missing address records in RIDB
  - These campgrounds still display correctly (lat/lng is valid)
  - In "By State" mode, they are not shown (cannot filter by missing state)
  - In "All Campgrounds" mode, they are shown (visible at correct geographic location)
- Agency icons are not yet color-coded (all yellow; future enhancement)
- "By State" is limited to CA, NV, AZ, UT (can be expanded to all 50 states if needed)

Future Phases:
- Phase 2: Color-code marker icons by agency (BLM=blue, USFS=green, NPS=red, ACOE=orange, etc.)
- Phase 3: Reverse geocode null-state campgrounds using lat/lng → state lookup tool
- Phase 4: Expand state list beyond CA/NV/AZ/UT to all 50 states
- Phase 5: Global state-first filtering where selecting a state shows ALL agencies for that state

=========================================
CA STATE PARKS INTEGRATION
=========================================
CA State Parks data is sourced from the public ArcGIS REST API and consolidated into index files for fast loading:

Original Data Source:
https://services2.arcgis.com/AhxrK3F6WM8ECvDi/arcgis/rest/services/
All endpoints support f=geojson and outSR=4326 (WGS84). No authentication required.

Bundled MVP datasets (Tier 1 — generated by build script, deployed with app):
- ParkBoundaries/FeatureServer/0: 462 boundary polygons, joined by UNITNBR
- ParkEntryPoints/FeatureServer/2: 288 entry points with street addresses and lat/lng
- Campgrounds/FeatureServer/0: 531 campground points

Index File Generation:
- Script: parks/ca-state-parks/ca-state-parks-index.js (Node 18+)
- Reads all 408 individual park JSON files (stored locally in parks/ca-state-parks/)
- Extracts campground facilities only (no boundaries, no entry points)
- Consolidates into single ca-state-parks-index.json with structure: { facilityId, name, lat, lng, state, parkId, website }
- parkId format: `ca-state-parks/{filename-without-extension}` — used by loadPark() to fetch detail files
- website enable "Show Park Website" button; parkId enables "Show Park Details" button in popups

Data Stats:
- Individual park files: 408 (stored as-is for detail view)
- Consolidated campgrounds: 602
- Index file size: ~180 KB

MVP UI:
- User toggles "CA State Parks" in the campground panel
- Loads all 602 campground markers from single index file (fast load)
- Markers: Brown circle (low zoom <10) / Brown tent emoji (high zoom ≥10)
- Popup on click: Campground name + weather + "Show Park Website" + "Show Park Details"
- Performance: Viewport-based lazy rendering keeps DOM to 30-100 visible markers
- Individual park files still used for full park detail view (boundaries, entry points)

Results: 408 MVP park files written, 315 added to loc_manifest.json (matched against official CA parks list at parks.ca.gov/?page_id=21805). 93 sub-units and admin properties excluded from search but kept on disk for overlay use.

Future per-park detail datasets (Tier 2 — fetched live on park selection, cached in tracker-detail-v1):
- ParkingPoints, PicnicGrounds, Buildings, Structures (filtered by TYPE)

Campground panel behavior:
- ⛺ button (top: 128px, right: 10px) opens the campground panel. Checking "CA State Parks" loads campground markers from index file into campgroundLayer.
- Markers show ⛺ tent icon at zoom ≥ 10 and a 4px brown dot at zoom < 10. The dot→icon swap is CSS-driven (zoom-low/zoom-high class on #map) — one DOM operation updates all markers.
- Tapping a campground marker fetches live weather and shows a "Show Park Website" button (opens meta.website) and a "Show Park Details" button.
- "Show Park Details" calls loadPark() for that specific park, drawing its boundary, entry points, and facilities from the original park file.
- OSM base layers provide park boundary context visually — no global GeoJSON boundary overlay needed.

Park file UNITNBR is the join key across all CA State Parks datasets. The official park list (OFFICIAL_PARKS array in generate.js) was last verified May 2026 against parks.ca.gov/?page_id=21805.

=========================================
CAMPGROUND RENDERING ARCHITECTURE
=========================================
Both CA State Parks (602) and Federal (5,264) campgrounds use a unified viewport-based lazy rendering system for performance:

Key Concepts:
1. Index Files: Single consolidated JSON per data source (ca-state-parks-index.json, federal/index.json)
2. Memory Loading: On first toggle, all campgrounds are loaded from index file into memory
3. Marker Creation: All marker objects created once and stored in Maps (allCaMarkers, allFederalMarkers)
4. Viewport Rendering: On every map movement (pan/zoom), renderCampgrounds() determines which markers are in viewport bounds
5. Filtering: Federal rendering supports two modes:
   - "All Campgrounds": No filtering, all 5,264 campgrounds considered for viewport rendering
   - "By State": Filter to only campgrounds with state=selectedState(s), skip those with state=null
6. Incremental Updates: Only ADD new markers entering viewport, REMOVE ones leaving viewport, KEEP existing visible ones
7. Popup Persistence: Marker objects persist in memory (never destroyed), so popups remain attached during map interaction

Performance Results:
- DOM markers at any time: 30-100 (constrained by viewport)
- CA load time: <1 second (602 campgrounds from 180 KB index)
- Federal load time: <2 seconds (5,264 campgrounds from 950 KB index)
- No slowdown when panning/zooming (markers already in memory, just toggling visibility)
- "All Campgrounds" mode: Even at world zoom (showing entire US), viewport rendering limits visible DOM markers

Why This Approach:
- Before: Individual park files required 408+ fetch requests for CA. Attempting to show all 5,264 BLM campgrounds simultaneously caused DOM bloat and map lag.
- After: Single fetch per source. Viewport-based rendering keeps DOM lean (~30-100 visible at a time). Markers persist for popup durability. Handles both small (CA: 602) and large (Federal: 5,264) datasets with same efficient pattern.

=========================================
UNIFIED ROUTING DESTINATION SYSTEM
=========================================
The app uses a unified routing system that works with any POI type (campgrounds, park entries, dropped pins, search results, etc.). The architecture is driven by state.routeDestination, a single source of truth for the user's selected routing endpoint.

state.routeDestination Structure:
- lat, lng: Coordinates of the destination
- name: Display name of the destination
- isExternal: Boolean flag
  - true: External destination (campgrounds, search results, dropped pins) — uses street routing only
  - false: Internal park destination — uses street routing + park topology routing

Route Button Behavior:
- "Show Route" button appears in all POI popups (weather popups for any point on the map)
- When clicked, the button shows the route and immediately changes to "Clear Route"
- Button text is determined dynamically: if popup's destination matches state.routeDestination, shows "Clear Route"; otherwise shows "Show Route"
- Supports seamless switching: click "Show Route" on POI A (route shows), then click POI B → old route clears, new route shows, POI A button reverts to "Show Route"
- Real-time updates: button text changes immediately without requiring popup close/reopen

Key Functions:
- toggleRoute(lat, lng, poiName, isExternal): Main entry point from popup buttons. Handles both showing new routes and clearing existing ones. Manages state transitions and updates button state in real-time.
- performRouting(): Calculates the actual route. Works with state.routeDestination (no parameters). Supports multi-modal routes (street + trail + offroad).
- updateOpenPopupButton(isActiveRoute): Updates button text in the currently open popup immediately after route state changes.

Flow Examples:
1. Click a campground popup → "Show Route" button (campground is external destination)
2. Click button → route displays via street routing, button becomes "Clear Route"
3. Click another campground → old route clears automatically, new route shows, old popup's button reverts to "Show Route"
4. Click "Clear Route" → route clears, button shows "Show Route", state.routeDestination nulled

=========================================
STREET ROUTING CONFIGURATION
=========================================
Street routing (the blue line) is provider-agnostic. The active provider is selected in Settings > Map Settings > Street Routing and persisted to localStorage. If the selected provider requires an API key, a key entry row appears automatically in the API Keys section below the provider selects.

Mapbox Directions (Recommended)
- Requires a free-tier Mapbox account and API key (pk.eyJ1...).
- Key is entered in Settings > Map Settings > API Keys and saved to localStorage. Never hardcoded.
- Free tier covers ~100,000 requests/month, far exceeding typical personal use.
- URL: https://api.mapbox.com/directions/v5/mapbox/driving/LNG,LAT;LNG,LAT?geometries=geojson&overview=full&access_token=KEY

OSRM (Fallback / Unreliable)
- No API key required. Uses the public demo server (router.project-osrm.org).
- The public server is frequently unavailable (CORS errors, 502 Bad Gateway). When unavailable, the routing engine automatically renders a straight dashed blue fallback line between the user's position and the park gate.
- Suitable for testing only.

Fallback Behavior
If any street routing request fails (either provider), the app catches the error and draws a straight dashed blue line to the destination rather than blocking navigation.

=========================================
GEOCODING CONFIGURATION
=========================================
Map-mode search geocoding is provider-agnostic. The active provider is selected in Settings > Map Settings > Geocoding and persisted to localStorage. Results are bounded loosely to the current map viewport.

Photon by Komoot (Recommended default for outdoor use)
- No API key required.
- OSM-based geocoder built and maintained by Komoot (a hiking/cycling navigation company). Tuned for outdoor features: parks, peaks, trailheads, rivers, trails.
- Public hosted instance; no strict rate limit for typical personal use.
- URL: https://photon.komoot.io/api/?q=QUERY&limit=5&lang=en&bbox=W,S,E,N
- Response: GeoJSON FeatureCollection. Coordinates at feature.geometry.coordinates ([lng, lat]). Display name assembled from feature.properties fields: name, city, state, country.

Nominatim (Free / OSM-based)
- No API key required.
- The reference OpenStreetMap geocoder. Broad coverage but rate-limited to 1 request/second on the public instance. The app enforces an 800ms debounce on the search input to comply.
- URL: https://nominatim.openstreetmap.org/search?format=json&q=QUERY&viewbox=W,N,E,S&bounded=0&limit=5
- Note: Nominatim's viewbox parameter uses W,N,E,S order (north before south), unlike Mapbox/Photon which use W,S,E,N.

Mapbox Geocoding API v5
- Requires a Mapbox API key. If Mapbox is also selected for Street Routing, the same key is reused automatically — only one key entry row appears.
- URL: https://api.mapbox.com/geocoding/v5/mapbox.places/QUERY.json?access_token=KEY&limit=5&bbox=W,S,E,N
- Response: GeoJSON FeatureCollection. Coordinates at feature.center ([lng, lat]). Display name at feature.place_name.

API Key Management
The #api-keys-section in Map Settings is fully dynamic. It inspects the active routing and geocoding providers on every settings open and provider change, then renders exactly one key entry row per unique API-requiring provider. Selecting Mapbox for both routing and geocoding shows one shared row. Switching both back to free providers collapses the section entirely. Keys are stored in localStorage under provider-specific keys (e.g. mapbox-api-key) and are never hardcoded.

=========================================
EXTERNAL APIS & DATA QUERIES
=========================================

1. OpenStreetMap (Base Layer: "Street (OSM)")
- URL: https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png
- Return: 256x256 PNG tiles.
- Completely open-source, no authentication required. Full road/boundary detail.

2. CartoDB Voyager (Base Layer: "Street (Voyager)")
- URL: https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png
- Return: 256x256 PNG tiles.
- Full-detail street map with a refined, modern visual style. No authentication required.

3. CartoDB Light (Base Layer: "Street (Minimal)")
- URL: https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png
- Return: 256x256 PNG tiles.
- Minimal greyscale style. Useful for emphasizing overlaid route lines and custom markers.

4. Esri / ArcGIS (Satellite Layer)
- URL: https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}
- Return: 256x256 PNG tiles.
- High-fidelity raster imagery for visual terrain orientation.

5. Bureau of Land Management (Federal Overlay Layer)
- URL: https://gis.blm.gov/arcgis/rest/services/lands/BLM_Natl_SMA_Cached_without_PriUnk/MapServer/tile/{z}/{y}/{x}
- Return: 256x256 PNG tiles (or HTTP 404).
- Quirks: The BLM server does not cache transparent tiles over oceans or dense urban areas. HTTP 404s are suppressed by applying a geographic bounding box (bounds: [[14.0, -180.0], [72.0, -60.0]]) to the Leaflet layer to cull off-continent requests.

6. RIDB (Recreation Information Database API — BLM Campgrounds)
- URL: https://ridb.recreation.gov/api/v1
- Endpoints: /facilities (paginated, 1000 per page), /facilityaddresses (paginated, 1000 per page)
- Auth: API key (RIDB_API_KEY) via query parameter
- Rate limit: 50 requests/minute. Script implements exponential backoff for 429/503 responses.
- Response: JSON with metadata and RECDATA array
- Usage: Fetches all BLM facilities, filters for campgrounds with GPS coordinates, joins state codes from facilityaddresses, outputs index.json

7. Mapbox Directions (Street Routing — Recommended)
- URL: https://api.mapbox.com/directions/v5/mapbox/driving/LNG,LAT;LNG,LAT?geometries=geojson&overview=full&access_token=KEY
- Return: JSON payload with a GeoJSON linestring and distance in meters.
- Requires a free-tier API key stored in localStorage. See Street Routing Configuration section.

8. Project OSRM (Street Routing — Fallback)
- URL: https://router.project-osrm.org/route/v1/driving/LNG,LAT;LNG,LAT?geometries=geojson&overview=full
- Return: JSON payload with a GeoJSON linestring and distance in meters.
- Open-source, no authentication. Public demo server is unreliable. See Street Routing Configuration section.

9. Photon by Komoot (Geocoding — Recommended)
- URL: https://photon.komoot.io/api/?q=QUERY&limit=5&lang=en&bbox=W,S,E,N
- Return: GeoJSON FeatureCollection. Each feature has geometry.coordinates ([lng, lat]) and properties (name, city, state, country, osm_type).
- No authentication required. Outdoor-tuned OSM geocoder; preferred for park and trail searches.

10. Nominatim (Geocoding — Free)
- URL: https://nominatim.openstreetmap.org/search?format=json&q=QUERY&viewbox=W,N,E,S&bounded=0&limit=5
- Return: JSON array. Each result has lat, lon (strings), and display_name.
- No authentication required. Rate-limited to 1 req/sec; enforced via 800ms input debounce.
- Note: viewbox parameter order is W,N,E,S — north and south are swapped compared to Mapbox/Photon bbox.

11. Mapbox Geocoding API v5 (Geocoding — API Key Required)
- URL: https://api.mapbox.com/geocoding/v5/mapbox.places/QUERY.json?access_token=KEY&limit=5&bbox=W,S,E,N
- Return: GeoJSON FeatureCollection. Each feature has center ([lng, lat]) and place_name.
- Shares the same API key as Mapbox Directions if both are selected.

12. Open-Meteo (Weather & Elevation)
- URL: https://api.open-meteo.com/v1/forecast?latitude=X&longitude=Y&current_weather=true&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto
- Return: JSON payload.
- Free-use meteorological database. No API key required.
- POI popup: current_weather block returns temperature, windspeed, winddirection. Wind displayed as "💨 12 mph NW" (cardinal direction computed from bearing degrees).
- 24-hour forecast: &hourly=temperature_2m,weather_code,windspeed_10m — wind shown as sub-line per slot.
- 7-day forecast: &daily=weather_code,temperature_2m_max,temperature_2m_min,windspeed_10m_max,winddirection_10m_dominant — max wind + dominant direction shown as sub-line per day.
- Forecast results cached in-memory (forecastCache, 1-hour TTL) to avoid redundant API calls.

13. USGS National Map (High-Fidelity Elevation)
- URL: https://epqs.nationalmap.gov/v1/json?x=LONG&y=LAT&units=Meters
- Return: JSON payload ({ "value": 150.5 }).
- Gold standard for US elevation data. Used conservatively on single POI clicks to overwrite Open-Meteo elevation with higher topographical accuracy. The USGS servers are rate-limited; the Map Editor batches requests (10 at a time, 300ms delays) to avoid HTTP 503 timeouts.

=========================================
TESTING & DEPLOYMENT NOTES
=========================================
- Dev environment: VS Code Live Server
- Live environment: GitHub Pages + Android PWA install

After any service worker (sw.js) change:
1. Open DevTools > Application > Service Workers > Unregister
2. Clear site data
3. Refresh

For all other file changes, use Settings > Check for Updates inside the app (force update button). This compares all shell files and park data against the live server and reloads if anything differs. Hard refresh (Ctrl+Shift+R) also clears browser cache without touching the SW.

The OSRM public server can be slow (20-30s) or return CORS errors / 502 Bad Gateway. This is expected. Switch to Mapbox in Settings > Map Settings for reliable street routing.

=========================================
RECENT UPDATES (June 2026)
=========================================
- BLM Campgrounds Integration: Added 5,264 BLM developed campgrounds from RIDB API with state-based filtering (CA/NV/AZ/UT)
- Index File Architecture: Both CA State Parks and BLM now use consolidated index files for faster loading (single fetch vs. multiple requests)
- Viewport-Based Rendering: Implemented lazy rendering for performance. Only visible markers rendered in DOM (30-100 at any zoom)
- Unified Rendering Pipeline: CA and BLM use identical rendering system (incremental updates, persistent markers)
- Popup Persistence Fix: Marker objects now persist in memory during map panning/zooming, preventing popup loss
- Single-Click Popup Switching: Fixed to allow moving between popups without double-clicking
- BLM Menu Improvements: Default states unchecked, mutual exclusivity between "All US BLM" and "By State", proper cleanup on toggle
- CA Parks Popup Restoration: Added parkId and website to ca-state-parks-index.json, restoring "Park Details" and website buttons
