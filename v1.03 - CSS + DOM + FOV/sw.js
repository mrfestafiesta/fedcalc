const SHELL_CACHE = 'tracker-shell-v1';
const DATA_CACHE = 'tracker-data-v1';

// 1. INSTALL: Take control immediately
self.addEventListener('install', event => {
    self.skipWaiting();
});

// 2. ACTIVATE: Clean up old caches if we ever change the v-number
self.addEventListener('activate', event => {
    event.waitUntil(self.clients.claim());
});

// 3. FETCH: The Offline Vault
self.addEventListener('fetch', event => {
    // THE MANUAL UPDATE BYPASS: 
    // If the frontend explicitly asks to bypass the cache, step aside and go straight to the network.
    if (event.request.cache === 'no-store') {
        event.respondWith(fetch(event.request));
        return;
    }

    const url = new URL(event.request.url);

    // Rule A: App Data (JSON files) -> Cache First, Fallback to Network
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

    // Rule B: App Shell (HTML/CSS/JS) -> Cache First, Fallback to Network
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

    // Rule C: Everything Else (Images, Map Tiles, etc.) -> Cache First
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
});