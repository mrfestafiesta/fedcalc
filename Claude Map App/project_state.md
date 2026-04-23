# Map App — Project State
*Last updated: 2026-04-23*

## What This App Is
A wilderness navigation PWA (Progressive Web App) built with Leaflet.js. Features include:
- Multi-modal routing: OSRM street routing (blue) → park gate → Dijkstra offroad/trail (brown/yellow)
- AR camera overlay with device compass HUD
- GPS path recording with IndexedDB persistence
- Offline-first via service worker with 4 cache buckets
- Weather popups via Open-Meteo API
- Park topology graphs (custom JSON format) with nodes/edges

## File Structure (Current — Post Refactor)
```
Claude Map App/
├── index.html              122-line HTML skeleton (was 1394-line monolith)
├── styles.css              All CSS
├── sw.js                   Service worker (4 cache buckets)
├── manifest.json           PWA manifest
├── project_state.md        This file
├── js/
│   ├── state.js            Shared mutable state object + constants
│   ├── map.js              Leaflet map instance + all layer groups
│   ├── weather.js          fetchAndSetPOIData, fetchForecast, weatherCodes
│   ├── routing.js          findShortestPath (Dijkstra), getClosestNode, formatRouteDist
│   ├── ar.js               AR world, compass, orientation handler
│   ├── gps.js              GPS logger, path load/save/export/clear (uses idb-keyval)
│   ├── storage.js          Cache sizes, wake lock, SW registration, force update
│   └── main.js             All event listeners + boot sequence
├── parks/
│   ├── loc_manifest.json   Index of available parks
│   ├── red_rock_canyon_sp.json
│   ├── lmu_test.json
│   └── ...
└── editor/
    └── map_editor v1.19.html   Standalone editor — NOT part of the module split
```

## Key Architecture Decisions
- **No build tools** — ES modules loaded natively via `<script type="module" src="./js/main.js">`
- **Shared state** — All mutable globals live in `js/state.js` as a single exported `state` object. Replaces all scattered `let` globals from the monolith.
- **`window.SELECTED_POI`** — Replaced throughout with `state.selectedPOI`
- **`window.fetchForecast`** — Set in main.js (`window.fetchForecast = fetchForecast`) so inline HTML popup buttons can call it
- **map.js** — Introduced to hold the Leaflet instance and prevent circular dependencies between routing.js and main.js
- **idb-keyval** — Imported only in gps.js, not re-exported; storage.js imports getPathSizeMB from gps.js

## Bugs Fixed This Session
1. **OSRM wrong destination** — Phase 2 blue line now routes to `targetNode` (park gate), not `SELECTED_POI` (trail destination)
2. **AR fade unreachable** — Changed `Math.abs(diff) > 40` to `> 25` so edge fade fires within the 35° FOV window
3. **GPS duplicate coordinates** — Logger now only pushes when `distFeet > 3`; first-point-of-session captured via else branch
4. **SW cache accumulation** — Activate handler now deletes stale caches before claiming clients
5. **Dead search bar** — Confirmed intentionally hidden (`display: none !important`); comment updated to document intent
6. **Red Rock Canyon isolated nodes** — User fixed: removed duplicate n87, bridged n86↔n80 with walk edge

## Service Worker Cache Buckets
| Name | Contents |
|---|---|
| tracker-shell-v1 | index.html, styles.css, js/*.js, CDN scripts |
| tracker-data-v1 | parks/*.json |
| map-tiles | OSM, Esri, CartoDB, BLM tiles |
| weather-data-v1 | Open-Meteo + USGS EPQS responses |

## Force Update Logic
`storage.js → forceUpdate()` explicitly checks for changes in:
- `./index.html`
- `./styles.css`
- `./js/main.js`
- `./parks/loc_manifest.json`
- Each individual park JSON

If any differ from the cached version, it updates the cache and reloads.

## Testing Notes
- Dev environment: VS Code Live Server
- Live environment: GitHub Pages + Android PWA install
- When testing after a SW change: unregister the SW in DevTools → Application → Service Workers, then clear site data, then refresh
- The OSRM public server (router.project-osrm.org) can be slow (20-30s) or time out. The inner try/catch in the routing logic renders a straight dashed blue fallback line when OSRM is unreachable — this is expected behavior, not a bug.

## What's Next (No Decisions Made Yet)
- Search bar UI: currently hidden (`display: none !important`). Needs mobile button layout rework before it can be re-enabled.
- Code protection / API keys: discussed but deferred. Only server-side APIs can protect data; file splitting does not help.
- The editor (`map_editor v1.19.html`) was explicitly excluded from the module split and remains a standalone monolith.
