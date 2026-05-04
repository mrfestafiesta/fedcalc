# Dynamic Tracker: Decoupled AR & Routing App

=========================================
OVERVIEW
=========================================
A Progressive Web App (PWA) designed for offline, multi-modal wilderness navigation. The application provides GPS path recording, live AR (Augmented Reality) trail breadcrumbs, U.S. Federal Land overlays, and live weather data. It utilizes a custom routing engine to gracefully hand off navigation from a configurable street routing API to private, custom-built offline topology graphs.

=========================================
CORE FILE ARCHITECTURE
=========================================
The application uses native ES modules (no build tools). index.html is a thin shell; all logic lives in the js/ directory.

1. index.html
The HTML skeleton. Defines DOM structure only: the map container, camera viewport, controls, settings modal, chart modal, and status elements. Loads all JS via <script type="module" src="./js/main.js">.

Key DOM Structures:
- #camera-container: Absolute-positioned viewport hosting the live video feed. AR breadcrumbs and bubbles are injected here by ar.js.
- #controls: A flex column stack with max-height and overflow-y constraints, ensuring core buttons remain accessible and scrollable on small mobile screens.
- #settings-modal: Two-tab management hub. The "Device & Storage" tab provides real-time byte calculations of Cache API and IndexedDB storage with granular clear buttons and screen Wake Lock controls. The "Map Settings" tab provides street routing provider selection and Mapbox API key management.

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
- initRoutingSettingsUI(): Populates the routing settings controls in the Settings modal with saved values on open.

5. js/weather.js
Handles all weather data fetching and caching. Exports fetchAndSetPOIData (fetches elevation + weather and builds the POI popup content) and fetchForecast (fetches 24-hour or 7-day forecast for the forecast modal). window.fetchForecast is set in main.js to expose it to inline HTML popup buttons.

6. js/ar.js
AR world management and compass logic. Exports: buildARWorld, clearARWorld, spawnARNode, updateARPositions, handleOrientation, toggleCompassUI.

7. js/gps.js
All GPS concerns: live position watching, interval-based path logging, IndexedDB persistence, export, and clearing.
- startPositionWatch(): Registers navigator.geolocation.watchPosition, updates state.latestFix, moves the user marker, and refreshes the status/elevation display.
- startGPSLogger(): 5-second interval that logs coordinates to IndexedDB when path recording is active (only when movement exceeds 3 ft to prevent duplicate points).
- loadSavedTrip / exportPathAsGeoJSON / clearPathData: IndexedDB path management.

8. js/storage.js
Cache management, wake lock, service worker registration, and the force update system.
- CACHES: Exported constant defining all four cache bucket names (imported by main.js for the clear buttons).
- forceUpdate(): Fetches the live version of all app shell files (index.html, styles.css, and all 8 js/*.js modules) and all park JSON files, compares them byte-for-byte against the cached versions, and reloads if any differ.
- refreshStorageNumbers / getCacheSizeMB / getPathSizeMB: Calculate and display storage usage in the settings grid.
- requestWakeLock / registerServiceWorker / showStatusPill: Device and lifecycle utilities.

9. js/main.js
Event listeners and boot sequence only. Wires all DOM interactions (buttons, selectors, modals, map context menu) to functions imported from the other modules. Contains no business logic. Boot sequence: loadParkMenu → loadSavedTrip → startPositionWatch → startGPSLogger → registerServiceWorker → setRoutingAttribution.

10. sw.js (Service Worker)
Acts as the offline proxy. Intercepts all network requests and routes them to four isolated cache buckets:
- tracker-shell-v1: index.html, styles.css, all js/*.js modules, CDN scripts.
- map-tiles: OSM, CartoDB, Esri satellite, and BLM federal boundary tiles.
- tracker-data-v1: parks/loc_manifest.json and all park topology JSON files.
- weather-data-v1: Open-Meteo and USGS EPQS responses (Network-First strategy).

11. manifest.json
Web App Manifest. Defines the app icon, theme color (#28a745), and enables native install on Android/iOS homescreens.

12. parks/loc_manifest.json & parks/[id].json
The park database. loc_manifest.json is a simple array index that populates the park selector dropdown. Individual park files contain a node dictionary, edge dictionary, and POI array generated by the Map Editor tool.

13. editor/map_editor v1.19.html
Standalone topology editor. Not part of the module system — remains a self-contained monolith.

=========================================
STREET ROUTING CONFIGURATION
=========================================
Street routing (the blue line) is provider-agnostic. The active provider is selected in Settings > Map Settings and persisted to localStorage.

Mapbox Directions (Recommended)
- Requires a free-tier Mapbox account and API key (pk.eyJ1...).
- The API key is entered once in Settings > Map Settings > Mapbox API Key and saved to localStorage. It is never hardcoded.
- Free tier covers ~100,000 requests/month, far exceeding typical personal use.
- URL: https://api.mapbox.com/directions/v5/mapbox/driving/LNG,LAT;LNG,LAT?geometries=geojson&overview=full&access_token=KEY

OSRM (Fallback / Unreliable)
- No API key required. Uses the public demo server (router.project-osrm.org).
- The public server is frequently unavailable (CORS errors, 502 Bad Gateway). When unavailable, the routing engine automatically renders a straight dashed blue fallback line between the user's position and the park gate.
- Suitable for testing only.

Fallback Behavior
If any street routing request fails (either provider), the app catches the error and draws a straight dashed blue line to the destination rather than blocking navigation.

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

8. Open-Meteo (Weather & Elevation)
- URL: https://api.open-meteo.com/v1/forecast?latitude=X&longitude=Y&current_weather=true
- Return: JSON payload.
- Free-use meteorological database. Used for live temperatures and wind speeds in POI popups and for bulk elevation queries in the Map Editor.

9. USGS National Map (High-Fidelity Elevation)
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
