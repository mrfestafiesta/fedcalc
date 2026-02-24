const CACHE_VERSION = 'v1';
const SHELL_CACHE = `app-shell-${CACHE_VERSION}`;
const TILE_CACHE = `map-tiles-${CACHE_VERSION}`;
const DATA_CACHE = `app-data-${CACHE_VERSION}`;

// Phase 1: The App Shell (Loads instantly on install)
const SHELL_FILES = [
    './',
    './index.Gemini.html',
    './parks/loc_manifest.json'
];

self.addEventListener('install', (event) => {
    console.log('[Service Worker] Installing...');
    event.waitUntil(
        caches.open(SHELL_CACHE).then((cache) => {
            return cache.addAll(SHELL_FILES);
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    console.log('[Service Worker] Activating & Cleaning old caches...');
    event.waitUntil(
        caches.keys().then(keys => Promise.all(
            keys.map(key => {
                if (!key.includes(CACHE_VERSION)) {
                    return caches.delete(key);
                }
            })
        ))
    );
    self.clients.claim();
});

// Phase 2: Runtime Interception
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Rule A: Map Tiles (Esri / OSM) -> Cache First, Network Fallback
    // This aggressively saves tiles to the hard drive for offline use.
    if (url.hostname.includes('arcgisonline.com') || url.hostname.includes('openstreetmap.org')) {
        event.respondWith(
            caches.match(event.request).then(cached => {
                return cached || fetch(event.request).then(response => {
                    const clone = response.clone();
                    caches.open(TILE_CACHE).then(cache => cache.put(event.request, clone));
                    return response;
                });
            })
        );
        return;
    }

    // Rule B: Live APIs (Weather/Elevation) -> Network Only
    // Never cache these, otherwise the user sees old weather data.
    if (url.hostname.includes('open-meteo.com') || url.hostname.includes('nationalmap.gov')) {
        return; 
    }

    // Rule C: Everything Else (Park JSONs, CDNs) -> Network First, Cache Fallback
    // Always try to get the freshest data, but if offline, use the cached version.
    event.respondWith(
        fetch(event.request).then(response => {
            const clone = response.clone();
            caches.open(DATA_CACHE).then(cache => cache.put(event.request, clone));
            return response;
        }).catch(() => {
            return caches.match(event.request);
        })
    );
});

// Step 2 Prep: Listen for the "Clear Data" command from the UI
self.addEventListener('message', (event) => {
    if (event.data && event.data.action === 'clearCache') {
        caches.keys().then(keys => {
            keys.forEach(key => caches.delete(key));
            console.log('[Service Worker] All caches cleared by user.');
        });
    }
});
