/**
 * sw.js — Service worker for offline support and caching
 *
 * Intercepts all network requests and applies different caching strategies based on
 * request type: app shell (CACHE-FIRST), park data (CACHE-FIRST), map tiles (CACHE-FIRST
 * with 5,000 tile cap), and weather (NETWORK-FIRST). Enables full offline functionality
 * after initial load.
 *
 * Caching strategies:
 * - App shell: Never evict
 * - Park data: Never evict
 * - Map tiles: FIFO eviction at 5,000 tile cap
 * - Weather: Network-first, fallback to cache
 * - API requests: Cache bypass (cache: 'no-store')
 */

const SHELL_CACHE = 'tracker-shell-v1';
const DATA_CACHE = 'tracker-data-v1';
const MAP_CACHE = 'map-tiles';
const WEATHER_CACHE = 'weather-data-v1';

// ~500MB cap at ~100KB average tile size. Oldest tiles (FIFO) evicted when exceeded.
const MAP_TILE_CAP = 5000;

/* === INSTALL: Take control immediately === */
self.addEventListener('install', event => {
    self.skipWaiting();
});

/* === ACTIVATE: Clean up old caches if version numbers change === */
self.addEventListener('activate', event => {
    const CURRENT_CACHES = [SHELL_CACHE, DATA_CACHE, MAP_CACHE, WEATHER_CACHE];
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(key => !CURRENT_CACHES.includes(key)).map(key => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

/* === FETCH: Offline caching and routing === */
self.addEventListener('fetch', event => {
    // CACHE BYPASS: Explicit opt-out for requests that need fresh data every time
    // Used by: Nominatim geocoding (we want fresh search results, not cached from previous searches)
    // How it works: If fetch() is called with `cache: 'no-store'`, bypass all caching strategies
    // DO NOT use `cache: 'no-store'` for static data (parks, tiles) — it prevents beneficial caching
    // ONLY use for API requests that genuinely need fresh results on every call
    if (event.request.cache === 'no-store') {
        event.respondWith(fetch(event.request));
        return;
    }

    const url = new URL(event.request.url);

    /* === RULE A: MAP TILES === */

    if (url.hostname.includes('openstreetmap.org') ||
        url.hostname.includes('arcgisonline.com') ||
        url.hostname.includes('cartocdn.com') ||
        url.hostname.includes('gis.blm.gov')) {
        event.respondWith(
            caches.match(event.request, { ignoreSearch: true }).then(async cached => {
                if (cached) return cached;

                const response = await fetch(new Request(event.request.url, { mode: 'cors', credentials: 'omit' }));
                const toCache = response.clone();

                event.waitUntil(
                    caches.open(MAP_CACHE).then(async cache => {
                        try {
                            await cache.put(event.request, toCache);
                            const keys = await cache.keys();
                            if (keys.length > MAP_TILE_CAP) {
                                await Promise.all(
                                    keys.slice(0, keys.length - MAP_TILE_CAP).map(k => cache.delete(k))
                                );
                            }
                        } catch (err) {
                            if (err.name === 'QuotaExceededError') {
                                const clients = await self.clients.matchAll();
                                clients.forEach(c => c.postMessage({ type: 'QUOTA_EXCEEDED' }));
                            }
                        }
                    })
                );

                return response;
            })
        );
        return;
    }

    /* === RULE B: APP DATA (PARK JSON) === */

    if (url.pathname.includes('/parks/')) {
        event.respondWith(
            caches.match(event.request, { ignoreSearch: true }).then(cached => {
                return cached || fetch(event.request).then(response => {
                    return caches.open(DATA_CACHE).then(cache => {
                        cache.put(event.request, response.clone());
                        return response;
                    });
                });
            })
        );
        return;
    }

    /* === RULE C: APP SHELL === */

    if (event.request.mode === 'navigate') {
        event.respondWith(
            caches.match('./index.html', { ignoreSearch: true }).then(cached => {
                return cached || fetch(event.request).then(response => {
                    return caches.open(SHELL_CACHE).then(cache => {
                        cache.put('./index.html', response.clone());
                        return response;
                    });
                });
            })
        );
        return;
    }

    /* === RULE D: WEATHER DATA === */
    if (url.hostname.includes('api.weather.gov') || url.hostname.includes('api.open-meteo.com') || url.hostname.includes('epqs.nationalmap.gov')) {
        event.respondWith(
            fetch(event.request).then(response => {
                // 1. We have cell service! Save a fresh copy to the vault and return it.
                const clone = response.clone();
                caches.open(WEATHER_CACHE).then(cache => cache.put(event.request, clone));
                return response;
            }).catch(() => {
                // 2. Network failed (Off-grid). Serve the last saved forecast from the vault.
                return caches.match(event.request);
            })
        );
        return;
    }

    // Rule D: App Shell Assets (HTML/CSS/JS/Icons & CDNs) -> SHELL_CACHE
    // We explicitly filter this to PREVENT caching live external APIs
    const isLocal = url.origin === location.origin;
    const isScriptCDN = url.hostname.includes('unpkg.com') || url.hostname.includes('jsdelivr.net');

    if (isLocal || isScriptCDN) {
        event.respondWith(
            caches.match(event.request, { ignoreSearch: true }).then(cached => {
                return cached || fetch(event.request).then(response => {
                    return caches.open(SHELL_CACHE).then(cache => {
                        cache.put(event.request, response.clone());
                        return response;
                    });
                });
            })
        );
        return;
    }
});