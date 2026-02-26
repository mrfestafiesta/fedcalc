const SHELL_CACHE = `app-shell`;
const TILE_CACHE = `map-tiles`;
const DATA_CACHE = `app-data`;

// Phase 1: Pre-cache
const SHELL_FILES = [
    './',
    './index.html',
    './parks/loc_manifest.json'
];

self.addEventListener('install', (event) => {
    console.log('[Service Worker] Installing...');
    event.waitUntil(
        caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_FILES))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    console.log('[Service Worker] Activating & cleaning old versioned caches...');
    event.waitUntil(
        caches.keys().then(keys => Promise.all(
            keys.map(key => {
                if (key.includes('v1') || key.includes('v2')) {
                    return caches.delete(key);
                }
            })
        ))
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Rule A: Live APIs (Weather/Elevation) -> Network Only
    if (url.hostname.includes('open-meteo.com') || url.hostname.includes('nationalmap.gov')) {
        return; 
    }

    // Rule B: Map Tiles (Esri / OSM) -> Cache First
    if (url.hostname.includes('arcgisonline.com') || url.hostname.includes('openstreetmap.org')) {
        event.respondWith(
            caches.open(TILE_CACHE).then(cache => {
                return cache.match(event.request).then(cached => {
                    return cached || fetch(event.request).then(response => {
                        cache.put(event.request, response.clone());
                        return response;
                    });
                });
            })
        );
        return;
    }

    // Rule C: App Data (Park JSONs) -> Stale-While-Revalidate + Update Alert
    if (url.pathname.includes('/parks/')) {
        // 1. Kick off the background fetch IMMEDIATELY
        const fetchPromise = fetch(event.request).then(async (networkResponse) => {
            const cache = await caches.open(DATA_CACHE);
            const cachedResponse = await cache.match(event.request, { ignoreSearch: true });
            
            // Compare the texts to see if we need to pop the green pill
            if (cachedResponse) {
                const cacheText = await cachedResponse.clone().text();
                const netText = await networkResponse.clone().text();
                if (cacheText !== netText) {
                    const clients = await self.clients.matchAll();
                    clients.forEach(client => client.postMessage({ action: 'UI_UPDATE' }));
                }
            }
            
            // Save the new data
            cache.put(event.request, networkResponse.clone());
            return networkResponse;
        }).catch(() => console.log('[Service Worker] Offline: JSON sync skipped.'));

        // 2. SYNCHRONOUSLY lock the thread alive
        event.waitUntil(fetchPromise);

        // 3. Immediately serve the fast cache, or wait for the network if cache is empty
        event.respondWith(
            caches.match(event.request, { ignoreSearch: true }).then(cachedResponse => {
                return cachedResponse || fetchPromise;
            })
        );
        return;
    }

    // Rule D: App Shell (HTML/CSS/JS) -> Stale-While-Revalidate + Update Alert
    event.respondWith(
        caches.match(event.request, { ignoreSearch: true }).then(cachedResponse => {
            const fetchPromise = fetch(event.request).then(async (networkResponse) => {
                const cache = await caches.open(SHELL_CACHE);
                
                if (cachedResponse) {
                    const cacheText = await cachedResponse.clone().text();
                    const netText = await networkResponse.clone().text();
                    if (cacheText !== netText) {
                        const clients = await self.clients.matchAll();
                        clients.forEach(client => client.postMessage({ action: 'UI_UPDATE' }));
                    }
                }
                
                cache.put(event.request, networkResponse.clone());
                return networkResponse;
            }).catch(() => console.log('[Service Worker] Offline: Shell sync skipped.'));
            
            event.waitUntil(fetchPromise);
            return cachedResponse || fetchPromise;
        })
    );
});

// Listen for the "Clear Data" command from the UI
self.addEventListener('message', (event) => {
    if (event.data && event.data.action === 'clearCache') {
        caches.keys().then(keys => {
            keys.forEach(key => caches.delete(key));
            console.log('[Service Worker] All caches cleared by user.');
        });
    }
});