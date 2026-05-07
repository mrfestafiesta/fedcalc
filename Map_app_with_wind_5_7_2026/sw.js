const SHELL_CACHE = 'tracker-shell-v1';
const DATA_CACHE = 'tracker-data-v1';
const MAP_CACHE = 'map-tiles';
const WEATHER_CACHE = 'weather-data-v1';

// 1. INSTALL: Take control immediately
self.addEventListener('install', event => {
    self.skipWaiting();
});

// 2. ACTIVATE: Clean up old caches if we ever change the v-number
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

// 3. FETCH: The Offline Vault
self.addEventListener('fetch', event => {
    // THE MANUAL UPDATE BYPASS
    if (event.request.cache === 'no-store') {
        event.respondWith(fetch(event.request));
        return;
    }

    const url = new URL(event.request.url);

    // Rule A: Map Tiles -> MAP_CACHE (Catches OSM, Esri, CartoDB, and BLM Federal Lands)
    if (url.hostname.includes('openstreetmap.org') || 
        url.hostname.includes('arcgisonline.com') ||
        url.hostname.includes('cartocdn.com') || 
        url.hostname.includes('gis.blm.gov')) {
        event.respondWith(
            caches.match(event.request, { ignoreSearch: true }).then(cached => {
                return cached || fetch(event.request).then(response => {
                    return caches.open(MAP_CACHE).then(cache => {
                        cache.put(event.request, response.clone());
                        return response;
                    });
                });
            })
        );
        return;
    }

    // Rule B: App Data (JSON files) -> DATA_CACHE
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

    // Rule C: App Shell (HTML/CSS/JS) -> SHELL_CACHE
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

    // Rule C.5: Weather & Elevation -> WEATHER_CACHE (Network-First Strategy)
    if (url.hostname.includes('api.open-meteo.com') || url.hostname.includes('epqs.nationalmap.gov')) {
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