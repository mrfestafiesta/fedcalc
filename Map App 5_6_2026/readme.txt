# Dynamic Tracker: Decoupled AR & Routing App

=========================================
OVERVIEW
=========================================
A Progressive Web App (PWA) designed for offline, multi-modal wilderness navigation. The application provides GPS path recording, live AR (Augmented Reality) trail breadcrumbs, U.S. Federal Land overlays, and live weather data. A floating search bar with switchable park/map modes allows searching both a local park database and a configurable geocoding provider. It utilizes a custom routing engine to gracefully hand off navigation from a configurable street routing API to private, custom-built offline topology graphs.

=========================================
CORE FILE ARCHITECTURE
=========================================
The application uses native ES modules (no build tools). index.html is a thin shell; all logic lives in the js/ directory.

1. index.html
The HTML skeleton. Defines DOM structure only: the map container, camera viewport, controls, settings modal, chart modal, and status elements. Loads all JS via <script type="module" src="./js/main.js">.

Key DOM Structures:
- #search-container / #search-pill: A floating pill-shaped search bar fixed above the map (top: 8px, full-width). The left segment is a 72px mode toggle button (🌍 map mode / 🏕️ park mode). In map mode, the input triggers geocoding against the configured provider with 800ms debounce. In park mode, the input filters the local park list loaded from loc_manifest.json. Replaces the former park selector dropdown.
- #status-row: Two side-by-side translucent status pills fixed below the search bar (top: 66px). The left pill shows live GPS accuracy ("GPS Acc: Xm") or "GPS: Off". The right pill shows compass heading or "Compass: Off".
- #camera-container: Absolute-positioned viewport hosting the live video feed. AR breadcrumbs and bubbles are injected here by ar.js.
- #controls: A flex column stack (bottom-left) containing the route button, route legend, and zoom warning. The Elevations graph button was moved to the right-side button column.
- Right-side button column: Four fixed circular buttons (50px, rgba(50,50,50,0.9) background) stacked bottom-to-top on the right edge. From bottom: ⚙️ Settings (20px), 📈 Elevation Graph (80px), 🥾 GPS Path (140px), 📍 Locate (200px). Path and graph buttons use grayscale(100%) by default and grayscale(0%) when active.
- #settings-modal: Three-tab management hub.
  - Device tab: Wake Lock, GPS, Compass, and AR Camera toggles.
  - Map Settings tab: Street Routing provider select, Geocoding provider select, dynamic #api-keys-section (see API Key Management below), and Map Zoom toggles.
  - Storage tab: Real-time byte calculations of Cache API and IndexedDB storage with granular clear/export buttons.

2. js/state.js
The single source of truth for all shared mutable state. Exports one `state` object that all modules read and write, replacing scattered globals. Also exports shared constants: MAX_AR_RADIUS_FEET, MIN_BREADCRUMB_SPACING, compassEvent.

3. js/map.js
Instantiates the Leaflet map and exports all layer groups used across modules. Defines four base tile layers (see External APIs section) and the BLM federal lands overlay. Exports: map, osmLayer, voyagerLayer, cartoLayer, satelliteLayer, federalLandsLayer, userMarker, pathLine, routeLayer, dotLayer, dynamicPoiLayer, trailPathLayer.

4. js/routing.js
Owns all routing concerns: offline graph algorithms, street API integration, provider configuration, and routing settings UI initialization.
- getClosestNode / findShortestPath / formatRouteDist: Core offline math engine (Dijkstra's algorithm with 3D Pythagorean weighting).
- getRoutingProvider / getMapboxKey: Read provider preference and API key from localStorage.
- setRoutingAttribution(type): Dynamically updates the Leaflet map attribution to reflect the active street routing provider.
- fetchStreetRoute(fromLng, fromLat, toLng, toLat): Provider-agnostic street routing. Reads the active provider from localStorage and builds the appropriate Mapbox or OSRM request. Both providers return an identical { distance, coords } shape so all downstream logic is shared.
- initRoutingSettingsUI(): Populates the routing provider select with the saved value on settings open. No longer manages the API key section directly — that is handled by updateApiKeySections() in main.js.

5. js/weather.js
Handles all weather data fetching and caching. Exports fetchAndSetPOIData (fetches elevation + weather and builds the POI popup content) and fetchForecast (fetches 24-hour or 7-day forecast for the forecast modal). window.fetchForecast is set in main.js to expose it to inline HTML popup buttons.

6. js/ar.js
AR world management and compass logic. Exports: buildARWorld, clearARWorld, spawnARNode, updateARPositions, handleOrientation, toggleCompassUI.

7. js/gps.js
All GPS concerns: live position watching, interval-based path logging, IndexedDB persistence, export, and clearing.
- startPositionWatch(): Registers navigator.geolocation.watchPosition, updates state.latestFix, moves the user marker, and refreshes the GPS status pill.
- startGPSLogger(): 5-second interval that logs coordinates to IndexedDB when path recording is active (only when movement exceeds 3 ft to prevent duplicate points).
- loadSavedTrip / exportPathAsGeoJSON / clearPathData: IndexedDB path management.

8. js/storage.js
Cache management, wake lock, service worker registration, and the force update system.
- CACHES: Exported constant defining all four cache bucket names (imported by main.js for the clear buttons).
- forceUpdate(): Fetches the live version of all app shell files (index.html, styles.css, and all js/*.js modules) and all park JSON files, compares them byte-for-byte against the cached versions, and reloads if any differ.
- refreshStorageNumbers / getCacheSizeMB / getPathSizeMB: Calculate and display storage usage in the settings grid.
- requestWakeLock / registerServiceWorker / showStatusPill: Device and lifecycle utilities.

9. js/main.js
Event listeners and boot sequence only. Wires all DOM interactions (buttons, selectors, modals, map context menu) to functions imported from the other modules. Contains no business logic.

Key functions defined here:
- loadParkList(): Fetches parks/loc_manifest.json into the parkList array on boot.
- loadPark(parkId): Fetches and renders a park's node graph, trail polylines, and POI markers.
- getGeocodingProvider(): Reads the active geocoding provider from localStorage (default: 'nominatim').
- updateApiKeySections(): Inspects the active routing and geocoding providers, deduplicates any shared providers (e.g. Mapbox selected for both), and dynamically renders one key entry row per unique API-requiring provider into #api-keys-section. Renders nothing if all active providers are free.
- window.saveApiKey(provider): Called by dynamically-rendered Save Key buttons. Persists the key to localStorage under the provider's storage key and updates the status label.

Boot sequence: loadParkList → loadSavedTrip → startPositionWatch → startGPSLogger → registerServiceWorker → setRoutingAttribution → applyZoomSettings.

10. sw.js (Service Worker)
Acts as the offline proxy. Intercepts all network requests and routes them to four isolated cache buckets:
- tracker-shell-v1: index.html, styles.css, all js/*.js modules, CDN scripts.
- map-tiles: OSM, CartoDB, Esri satellite, and BLM federal boundary tiles.
- tracker-data-v1: parks/loc_manifest.json and all park topology JSON files.
- weather-data-v1: Open-Meteo and USGS EPQS responses (Network-First strategy).

11. manifest.json
Web App Manifest. Defines the app icon, theme color (#28a745), and enables native install on Android/iOS homescreens.

12. parks/loc_manifest.json & parks/[id].json
The park database. loc_manifest.json is a simple array index that populates the park search list. Individual park files contain a node dictionary, edge dictionary, and POI array generated by the Map Editor tool.

13. editor/map_editor v1.19.html
Standalone topology editor. Not part of the module system — remains a self-contained monolith.

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

6. Mapbox Directions (Street Routing — Recommended)
- URL: https://api.mapbox.com/directions/v5/mapbox/driving/LNG,LAT;LNG,LAT?geometries=geojson&overview=full&access_token=KEY
- Return: JSON payload with a GeoJSON linestring and distance in meters.
- Requires a free-tier API key stored in localStorage. See Street Routing Configuration section.

7. Project OSRM (Street Routing — Fallback)
- URL: https://router.project-osrm.org/route/v1/driving/LNG,LAT;LNG,LAT?geometries=geojson&overview=full
- Return: JSON payload with a GeoJSON linestring and distance in meters.
- Open-source, no authentication. Public demo server is unreliable. See Street Routing Configuration section.

8. Photon by Komoot (Geocoding — Recommended)
- URL: https://photon.komoot.io/api/?q=QUERY&limit=5&lang=en&bbox=W,S,E,N
- Return: GeoJSON FeatureCollection. Each feature has geometry.coordinates ([lng, lat]) and properties (name, city, state, country, osm_type).
- No authentication required. Outdoor-tuned OSM geocoder; preferred for park and trail searches.

9. Nominatim (Geocoding — Free)
- URL: https://nominatim.openstreetmap.org/search?format=json&q=QUERY&viewbox=W,N,E,S&bounded=0&limit=5
- Return: JSON array. Each result has lat, lon (strings), and display_name.
- No authentication required. Rate-limited to 1 req/sec; enforced via 800ms input debounce.
- Note: viewbox parameter order is W,N,E,S — north and south are swapped compared to Mapbox/Photon bbox.

10. Mapbox Geocoding API v5 (Geocoding — API Key Required)
- URL: https://api.mapbox.com/geocoding/v5/mapbox.places/QUERY.json?access_token=KEY&limit=5&bbox=W,S,E,N
- Return: GeoJSON FeatureCollection. Each feature has center ([lng, lat]) and place_name.
- Shares the same API key as Mapbox Directions if both are selected.

11. Open-Meteo (Weather & Elevation)
- URL: https://api.open-meteo.com/v1/forecast?latitude=X&longitude=Y&current_weather=true
- Return: JSON payload.
- Free-use meteorological database. Used for live temperatures and wind speeds in POI popups and for bulk elevation queries in the Map Editor.

12. USGS National Map (High-Fidelity Elevation)
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
