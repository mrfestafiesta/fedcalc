import { state } from './state.js';
import { getPathSizeMB } from './gps.js';

const CACHES = { app: 'tracker-shell-v1', map: 'map-tiles', poi: 'tracker-data-v1' };

export async function getCacheSizeMB(cacheName, isTiles = false) {
    if (!('caches' in window)) return "0.00";
    try {
        const hasCache = await caches.has(cacheName);
        if (!hasCache) return "0.00";
        const cache = await caches.open(cacheName);
        const requests = await cache.keys();
        if (isTiles) {
            return ((requests.length * 25 * 1024) / (1024 * 1024)).toFixed(2);
        } else {
            let totalBytes = 0;
            for (let req of requests) {
                const res = await cache.match(req);
                if (res) { const blob = await res.blob(); totalBytes += blob.size; }
            }
            return (totalBytes / (1024 * 1024)).toFixed(2);
        }
    } catch (e) { return "0.00"; }
}

export async function refreshStorageNumbers() {
    const sizeApp = document.getElementById('size-app');
    const sizeMap = document.getElementById('size-map');
    const sizePoi = document.getElementById('size-poi');
    const sizePath = document.getElementById('size-path');
    sizeApp.innerText = "Calc..."; sizeMap.innerText = "Calc...";
    sizePoi.innerText = "Calc..."; sizePath.innerText = "Calc...";
    sizeApp.innerText = `${await getCacheSizeMB(CACHES.app)} MB`;
    sizeMap.innerText = `${await getCacheSizeMB(CACHES.map, true)} MB`;
    sizePoi.innerText = `${await getCacheSizeMB(CACHES.poi)} MB`;
    sizePath.innerText = `${await getPathSizeMB()} MB`;
}

export async function requestWakeLock() {
    const btnWake = document.getElementById('btn-wake');
    try {
        state.wakeLockSentinel = await navigator.wakeLock.request('screen');
        btnWake.style.background = '#28a745';
        btnWake.innerText = "🔓 On";
        state.wakeLockSentinel.addEventListener('release', () => {
            if (!state.isWakeLockRequested) {
                btnWake.style.background = '#6c757d';
                btnWake.innerText = "🔒 Off";
            }
        });
    } catch (err) {
        state.isWakeLockRequested = false;
        btnWake.style.background = '#6c757d';
        btnWake.innerText = "🔒 Off";
    }
}

export function showStatusPill(message, bgColor = '#333') {
    const pill = document.getElementById('status-pill');
    pill.innerText = message;
    pill.style.background = bgColor;
    pill.style.display = 'block';
    setTimeout(() => pill.style.opacity = '1', 10);
    setTimeout(() => {
        pill.style.opacity = '0';
        setTimeout(() => pill.style.display = 'none', 300);
    }, 3000);
}

export function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js')
                .then(() => console.log('Vault Service Worker Registered!'))
                .catch(err => console.error('SW Registration Failed!', err));
            if (sessionStorage.getItem('appJustUpdated') === 'true') {
                sessionStorage.removeItem('appJustUpdated');
                showStatusPill('App Update Complete ✅', '#28a745');
            }
        });
    }
}

export async function forceUpdate() {
    const btn = document.getElementById('btn-force-update');
    const originalText = btn.innerText;
    btn.innerText = "Checking...";
    try {
        const shellCache = await caches.open('tracker-shell-v1');
        const dataCache = await caches.open('tracker-data-v1');
        let updatesFound = false;

        // Check app shell files
        const shellFiles = ['./index.html', './styles.css', './js/main.js'];
        for (const filePath of shellFiles) {
            const liveRes = await fetch(filePath, { cache: 'no-store' });
            const liveText = await liveRes.clone().text();
            const cachedRes = await shellCache.match(filePath);
            const cachedText = cachedRes ? await cachedRes.text() : '';
            if (cachedText === '') await shellCache.put(filePath, liveRes.clone());
            else if (liveText !== cachedText) { await shellCache.put(filePath, liveRes.clone()); updatesFound = true; }
        }

        // Check park directory index
        const liveManifestRes = await fetch('./parks/loc_manifest.json', { cache: 'no-store' });
        const liveManifestText = await liveManifestRes.clone().text();
        const cachedManifest = await dataCache.match('./parks/loc_manifest.json');
        const cachedManifestText = cachedManifest ? await cachedManifest.text() : '';

        if (cachedManifestText === '') await dataCache.put('./parks/loc_manifest.json', liveManifestRes.clone());
        else if (liveManifestText !== cachedManifestText) { await dataCache.put('./parks/loc_manifest.json', liveManifestRes.clone()); updatesFound = true; }

        const manifestData = await liveManifestRes.json();

        // Check individual park files
        for (const park of manifestData) {
            const parkUrl = `./parks/${park.id}.json`;
            try {
                const liveParkRes = await fetch(parkUrl, { cache: 'no-store' });
                const liveParkText = await liveParkRes.clone().text();
                const cachedPark = await dataCache.match(parkUrl);
                const cachedParkText = cachedPark ? await cachedPark.text() : '';
                if (cachedParkText === '') await dataCache.put(parkUrl, liveParkRes.clone());
                else if (liveParkText !== cachedParkText) { await dataCache.put(parkUrl, liveParkRes.clone()); updatesFound = true; }
            } catch (err) { console.log(`Skipping missing park file: ${parkUrl}`); }
        }

        if (updatesFound) { sessionStorage.setItem('appJustUpdated', 'true'); window.location.reload(); }
        else { btn.innerText = originalText; showStatusPill('No Update Available', '#6c757d'); }
    } catch (err) {
        btn.innerText = originalText;
        showStatusPill('Check Failed (Offline?)', '#dc3545');
    }
}
