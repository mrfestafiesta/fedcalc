# Map App — Project State
*Last updated: 2026-05-06*

## What This App Is
A wilderness navigation PWA (Progressive Web App) built with Leaflet.js. Features include:
- Multi-modal routing: configurable street routing (blue) → park gate → Dijkstra offroad/trail (brown/yellow)
- Floating unified search bar with switchable park/map mode and configurable geocoding provider
- AR camera overlay with device compass HUD
- GPS path recording with IndexedDB persistence
- Offline-first via service worker with 4 cache buckets
- Weather popups via Open-Meteo API
- Park topology graphs (custom JSON format) with nodes/edges

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
│   ├── weather.js          fetchAndSetPOIData, fetchForecast, weatherCodes
│   ├── routing.js          Dijkstra engine, street routing, provider config
│   ├── ar.js               AR world, compass, orientation handler
│   ├── gps.js              GPS logger, path load/save/export/clear (uses idb-keyval)
│   ├── storage.js          Cache sizes, wake lock, SW registration, force update
│   └── main.js             All event listeners, search logic, API key mgmt, boot
├── parks/
│   ├── loc_manifest.json   Index of available parks
│   └── [id].json           Individual park topology files
└── editor/
    └── map_editor v1.19.html   Standalone editor — NOT part of module system
```

## Key Architecture Decisions
- **No build tools** — ES modules loaded natively via `<script type="module" src="./js/main.js">`
- **Shared state** — All mutable globals live in `js/state.js` as a single exported `state` object
- **`window.fetchForecast`** — Set in main.js so inline HTML popup buttons can call it
- **`window.saveApiKey(provider)`** — Set in main.js so dynamically-rendered Save Key buttons can call it
- **map.js** — Holds the Leaflet instance to prevent circular dependencies
- **idb-keyval** — Imported only in gps.js; storage.js imports getPathSizeMB from gps.js

## UI Layout (Current)
**Search bar**: Floating pill, `position: fixed; top: 8px; left/right: 8px`. 72px left segment is mode toggle (🌍/🏕️); right segment is text input. Leaflet controls pushed down via `.leaflet-top { margin-top: 58px }`.

**Status row**: Two translucent pills at `top: 66px; left: 16px`. Left = GPS accuracy / "GPS: Off". Right = compass heading / "Compass: Off".

**Right-side button column** (all `right: 20px`, bottom-up):
| Button | Bottom | Icon | Active behavior |
|---|---|---|---|
| ⚙️ Settings | 20px | static | opens modal |
| 📈 Elevation Graph | 80px | greyscale→color | colored while chart is open |
| 🥾 GPS Path | 140px | greyscale→color | colored while path recording is on |
| 📍 Locate | 200px | static | centers map on GPS fix |

**Zoom controls** (optional, toggled in settings): `bottom: 320px; right: 20px`

**Left-side controls** (`#controls`, bottom-left): route button, route legend, zoom warning label.

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

## Known Limitations / Deferred Items
- **Leaflet layers control hover behavior**: On desktop, the layers panel opens on mouse hover — this is Leaflet's built-in default. Multiple attempts to override it (setTimeout collapse, capture-phase event blocking) all failed or introduced regressions. Reverted to pure Leaflet default. The only reliable fix is replacing `L.control.layers()` entirely with a custom HTML panel. Non-issue on mobile (the primary target platform).
- **Editor**: `map_editor v1.19.html` was explicitly excluded from the module system and remains a standalone monolith.

## Service Worker Cache Buckets
| Name | Contents |
|---|---|
| tracker-shell-v1 | index.html, styles.css, js/*.js, CDN scripts |
| tracker-data-v1 | parks/*.json |
| map-tiles | OSM, Esri, CartoDB, BLM tiles |
| weather-data-v1 | Open-Meteo + USGS EPQS responses |

## Testing Notes
- Dev environment: VS Code Live Server
- Live environment: GitHub Pages + Android PWA install
- After any SW change: unregister in DevTools → Application → Service Workers, clear site data, refresh
- For all other changes: use Settings → Check for Updates (force update button) or Ctrl+Shift+R
- OSRM public server can be slow (20-30s) or return CORS/502 errors — expected, not a bug
