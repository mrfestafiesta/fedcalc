import { state, compassEvent } from './state.js';
import { map, routeLayer, dotLayer, dynamicPoiLayer, trailPathLayer } from './map.js';
import { fetchAndSetPOIData, fetchForecast } from './weather.js';
import { getClosestNode, findShortestPath, formatRouteDist, getRoutingProvider, getMapboxKey, setRoutingAttribution, fetchStreetRoute, initRoutingSettingsUI } from './routing.js';
import { clearARWorld, buildARWorld, handleOrientation, toggleCompassUI } from './ar.js';
import { loadSavedTrip, startGPSLogger, startPositionWatch, exportPathAsGeoJSON, clearPathData } from './gps.js';
import { CACHES, refreshStorageNumbers, requestWakeLock, showStatusPill, registerServiceWorker, forceUpdate } from './storage.js';

// Inline HTML popup buttons call window.fetchForecast — expose it here
window.fetchForecast = fetchForecast;

// === PARK MENU LOADER ===
async function loadParkMenu() {
    try {
        const response = await fetch('./parks/loc_manifest.json');
        if (!response.ok) throw new Error("Manifest not found");
        const parkList = await response.json();
        const parkSelector = document.getElementById('park-selector');
        parkList.forEach(park => {
            const option = document.createElement('option');
            option.value = park.id;
            option.textContent = park.name;
            parkSelector.appendChild(option);
        });
    } catch (err) { console.error("Failed to load park directory:", err); }
}

// === SEARCH BAR ===
const searchInput = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');
let searchTimeout;
let currentController = null;

searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    const query = e.target.value.trim();
    if (query.length < 3) { searchResults.style.display = 'none'; return; }

    // 800ms debounce to respect Nominatim's 1 req/sec limit
    searchTimeout = setTimeout(async () => {
        if (currentController) currentController.abort();
        currentController = new AbortController();
        searchResults.innerHTML = '<li style="color:#888; pointer-events:none; padding:12px 20px;">Searching...</li>';
        searchResults.style.display = 'block';
        try {
            const bounds = map.getBounds();
            const viewbox = `${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()},${bounds.getSouth()}`;
            const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&viewbox=${viewbox}&bounded=0&limit=5`;

            // cache: 'no-store' bypasses the service worker so Nominatim is always hit fresh
            const res = await fetch(url, { signal: currentController.signal, cache: 'no-store' });
            if (!res.ok) throw new Error("API Limit");
            const data = await res.json();
            searchResults.innerHTML = '';
            if (data.length > 0) {
                data.forEach(place => {
                    const li = document.createElement('li');
                    li.textContent = place.display_name;
                    li.onclick = () => {
                        const lat = parseFloat(place.lat);
                        const lon = parseFloat(place.lon);
                        map.setView([lat, lon], 14);
                        if (state.searchMarker) { map.removeLayer(state.searchMarker); state.searchMarker = null; }
                        if (state.customPinMarker) { map.removeLayer(state.customPinMarker); state.customPinMarker = null; }
                        state.searchMarker = L.marker([lat, lon]).addTo(map)
                            .bindPopup('<div style="text-align:center; padding: 10px; font-family: sans-serif;">Loading live weather...</div>')
                            .openPopup();
                        fetchAndSetPOIData(state.searchMarker, lat, lon, place.display_name);
                        let isExternal = true;
                        let closestNodeId = null;
                        if (state.activeParkData && state.activeParkData.nodes) {
                            closestNodeId = getClosestNode(lat, lon, state.activeParkData);
                            const node = state.activeParkData.nodes[closestNodeId];
                            const distFeet = map.distance([lat, lon], [node.lat, node.lng]) * 3.28084;
                            if (distFeet <= 1500) isExternal = false;
                        }
                        state.selectedPOI = { lat, lng: lon, name: place.display_name, node_id: closestNodeId, isExternal };
                        searchInput.value = '';
                        searchResults.style.display = 'none';
                        searchInput.blur();
                    };
                    searchResults.appendChild(li);
                });
            } else {
                searchResults.innerHTML = '<li style="color:#888; pointer-events:none; padding:12px 20px;">No results found</li>';
            }
        } catch (err) {
            if (err.name === 'AbortError') return;
            console.warn("Search offline or failed:", err);
            searchResults.innerHTML = '<li style="color:#d9534f; pointer-events:none; padding:12px 20px;">Search temporarily unavailable</li>';
        }
    }, 800);
});

document.addEventListener('click', (e) => {
    if (!document.getElementById('search-container').contains(e.target)) {
        searchResults.style.display = 'none';
    }
});

// === PARK SELECTOR ===
document.getElementById('park-selector').addEventListener('change', async (e) => {
    const selectedPark = e.target.value;
    if (!selectedPark) {
        dynamicPoiLayer.clearLayers();
        trailPathLayer.clearLayers();
        routeLayer.clearLayers();
        state.selectedPOI = null;
        state.activeParkData = null;
        clearARWorld();
        return;
    }
    try {
        const response = await fetch(`./parks/${selectedPark}.json`);
        if (!response.ok) throw new Error("File not found");
        const data = await response.json();
        state.activeParkData = data;
        dynamicPoiLayer.clearLayers();
        trailPathLayer.clearLayers();
        const bounds = [];

        if (data.nodes && data.edges) {
            const drawnEdges = new Set();
            for (const [startNodeId, connectedNodes] of Object.entries(data.edges)) {
                const startNode = data.nodes[startNodeId];
                bounds.push([startNode.lat, startNode.lng]);
                for (const [endNodeId] of Object.entries(connectedNodes)) {
                    const endNode = data.nodes[endNodeId];
                    const edgeId = [startNodeId, endNodeId].sort().join('-');
                    if (!drawnEdges.has(edgeId)) {
                        drawnEdges.add(edgeId);
                        L.polyline([[startNode.lat, startNode.lng], [endNode.lat, endNode.lng]], { color: '#0078FF', weight: 3, opacity: 0.3 }).addTo(trailPathLayer);
                    }
                }
            }
        }

        data.locations.forEach(poi => {
            bounds.push([poi.lat, poi.lng]);
            const marker = L.marker([poi.lat, poi.lng]).bindPopup('<div style="text-align:center; padding: 10px; font-family: sans-serif;">Loading live weather...</div>');
            marker.on('click', async () => {
                if (state.searchMarker) { map.removeLayer(state.searchMarker); state.searchMarker = null; }
                if (state.customPinMarker) { map.removeLayer(state.customPinMarker); state.customPinMarker = null; }
                state.selectedPOI = { lat: poi.lat, lng: poi.lng, name: poi.name, node_id: poi.node_id };
                fetchAndSetPOIData(marker, poi.lat, poi.lng, poi.name);
            });
            dynamicPoiLayer.addLayer(marker);
        });

        if (bounds.length > 0) map.fitBounds(bounds, { padding: [50, 50] });
        if (state.isCameraOn && state.latestFix) buildARWorld();
    } catch (error) { alert("Could not load data for that location."); }
});

// === MAP LONG-PRESS ===
map.on('contextmenu', (e) => {
    const lat = e.latlng.lat;
    const lng = e.latlng.lng;
    if (state.searchMarker) { map.removeLayer(state.searchMarker); state.searchMarker = null; }
    if (state.customPinMarker) { map.removeLayer(state.customPinMarker); state.customPinMarker = null; }
    state.customPinMarker = L.marker([lat, lng]).addTo(map)
        .bindPopup('<div style="text-align:center; padding: 10px; font-family: sans-serif;">Loading live weather...</div>')
        .openPopup();
    fetchAndSetPOIData(state.customPinMarker, lat, lng, "Dropped Pin");
    let isExternal = true;
    let closestNodeId = null;
    if (state.activeParkData && state.activeParkData.nodes) {
        closestNodeId = getClosestNode(lat, lng, state.activeParkData);
        const node = state.activeParkData.nodes[closestNodeId];
        const distFeet = map.distance([lat, lng], [node.lat, node.lng]) * 3.28084;
        if (distFeet <= 1500) isExternal = false;
    }
    state.selectedPOI = { lat, lng, name: "Dropped Pin", node_id: closestNodeId, isExternal };
});

// === CAMERA ===
document.getElementById('btn-cam').addEventListener('click', async () => {
    const btnCam = document.getElementById('btn-cam');
    const videoElement = document.getElementById('video-feed');
    const cameraContainer = document.getElementById('camera-container');
    const camPlaceholder = document.getElementById('camera-placeholder');
    if (!state.isCameraOn) {
        try {
            state.currentStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
            videoElement.srcObject = state.currentStream;
            videoElement.classList.add('active');
            camPlaceholder.style.display = 'none';
            cameraContainer.classList.add('active');
            state.isCameraOn = true;
            btnCam.classList.add('active');
            setTimeout(() => map.invalidateSize(), 100);
            buildARWorld();
        } catch (err) { alert("Camera failed."); }
    } else {
        if (state.currentStream) state.currentStream.getTracks().forEach(t => t.stop());
        videoElement.srcObject = null;
        videoElement.classList.remove('active');
        camPlaceholder.style.display = 'block';
        cameraContainer.classList.remove('active');
        state.isCameraOn = false;
        btnCam.classList.remove('active');
        clearARWorld();
        setTimeout(() => map.invalidateSize(), 100);
    }
});

// === COMPASS ===
document.getElementById('btn-compass').addEventListener('click', async () => {
    if (!state.isCompassActive) {
        if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
            try {
                const r = await DeviceOrientationEvent.requestPermission();
                if (r === 'granted') { window.addEventListener(compassEvent, handleOrientation); toggleCompassUI(true); }
                else alert("Compass access denied.");
            } catch (err) { console.error(err); }
        } else { window.addEventListener(compassEvent, handleOrientation); toggleCompassUI(true); }
    } else { window.removeEventListener(compassEvent, handleOrientation); toggleCompassUI(false); }
});

// === GPS PATH BUTTON ===
document.getElementById('btn-path').addEventListener('click', () => {
    state.isPathOn = !state.isPathOn;
    const btnPath = document.getElementById('btn-path');
    btnPath.classList.toggle('active', state.isPathOn);
    document.getElementById('data-display').style.display = state.isPathOn ? 'flex' : 'none';
    if (state.isPathOn && !state.lastLoggedFix && state.latestFix) state.lastLoggedFix = state.latestFix;
});

// === RESET TRIP ===
document.getElementById('btn-reset').addEventListener('click', async () => {
    if (!confirm("Reset trip?")) return;
    await clearPathData();
    routeLayer.clearLayers();
});

// === ELEVATION GRAPH ===
document.getElementById('btn-graph').addEventListener('click', () => {
    if (state.fullPathData.length < 2) { alert("Not enough data."); return; }
    const labels = [], dataPoints = []; let accumDist = 0;
    for (let i = 0; i < state.fullPathData.length; i++) {
        const point = state.fullPathData[i];
        if (i > 0) {
            const prev = state.fullPathData[i-1];
            accumDist += (map.distance([prev[0], prev[1]], [point[0], point[1]]) * 3.28084);
        }
        labels.push(accumDist.toFixed(0));
        dataPoints.push((point[2] * 3.28084));
    }
    const ctx = document.getElementById('elevationChart').getContext('2d');
    if (state.myChart) state.myChart.destroy();
    state.myChart = new Chart(ctx, {
        type: 'line',
        data: { labels: labels, datasets: [{ label: 'Elevation (ft)', data: dataPoints, borderColor: 'rgb(75, 192, 192)', backgroundColor: 'rgba(75, 192, 192, 0.2)', fill: true, tension: 0.3 }] },
        options: { responsive: true, maintainAspectRatio: false, scales: { x: { title: { display: true, text: 'Distance (ft)' } }, y: { title: { display: true, text: 'Altitude (ft)' } } } }
    });
    document.getElementById('chart-modal').style.display = 'flex';
});

document.getElementById('close-chart').addEventListener('click', () => {
    document.getElementById('chart-modal').style.display = 'none';
});

// === ROUTING ===
document.getElementById('btn-route').addEventListener('click', async () => {
    if (!state.latestFix) return alert("Waiting for GPS...");
    if (!state.selectedPOI) return alert("Please click a map pin to select a destination first!");
    if (!state.selectedPOI.isExternal && (!state.activeParkData || !state.activeParkData.nodes)) {
        return alert("Offline routing graph not available for this location.");
    }

    const btnRoute = document.getElementById('btn-route');
    btnRoute.innerText = "Calculating...";
    routeLayer.clearLayers();
    document.getElementById('route-legend').style.display = 'none';

    try {
        let distBlue = 0, distBrown = 0, distYellow = 0;

        // === EXTERNAL GEOFENCE BYPASS: target outside park, use street routing only ===
        if (state.selectedPOI.isExternal) {
            const route = await fetchStreetRoute(state.latestFix.lng, state.latestFix.lat, state.selectedPOI.lng, state.selectedPOI.lat);
            distBlue = route.distance * 3.28084;
            L.polyline(route.coords, { color: '#0078FF', weight: 6, opacity: 0.8 }).addTo(routeLayer);
            setRoutingAttribution(getRoutingProvider());

            if (routeLayer.getLayers().length > 0) map.fitBounds(routeLayer.getBounds(), { padding: [50, 50] });
            const legendDiv = document.getElementById('route-legend');
            legendDiv.innerHTML = `<div class="legend-row"><div class="legend-label"><div class="legend-color" style="background:#0078FF;"></div> Street</div> <span>${formatRouteDist(distBlue)}</span></div>`;
            legendDiv.style.display = 'flex';
            btnRoute.innerText = "Update Route";
            return;
        }

        // --- OFF-GRID ROUTING ---
        const endNodeId = state.selectedPOI.node_id;
        const closestNodeId = getClosestNode(state.latestFix.lat, state.latestFix.lng, state.activeParkData);
        const distToParkFeet = map.distance(
            [state.latestFix.lat, state.latestFix.lng],
            [state.activeParkData.nodes[closestNodeId].lat, state.activeParkData.nodes[closestNodeId].lng]
        ) * 3.28084;

        let startNodeId = closestNodeId;
        let needsDrivingRoute = false;

        if (distToParkFeet > 1000) {
            needsDrivingRoute = true;
            let validEntrances = [];
            for (let nodeId in state.activeParkData.nodes) {
                const node = state.activeParkData.nodes[nodeId];
                const edges = state.activeParkData.edges[nodeId] || {};
                let driveEdgeCount = 0;
                for (let target in edges) if (edges[target] === 'drive') driveEdgeCount++;
                // Only allow routing to dead-end dirt roads or trailheads directly on streets
                if (node.type === 'trailhead' && driveEdgeCount === 0) validEntrances.push(nodeId);
                else if (node.type === 'offroad' && Object.keys(edges).length === 1) validEntrances.push(nodeId);
            }
            if (validEntrances.length === 0) {
                for (let nodeId in state.activeParkData.nodes) {
                    if (state.activeParkData.nodes[nodeId].type === 'offroad' || state.activeParkData.nodes[nodeId].type === 'trailhead') {
                        validEntrances.push(nodeId);
                    }
                }
            }

            let bestEntrance = null; let lowestWalkCost = Infinity;
            for (let nodeId of validEntrances) {
                const resultObj = findShortestPath(nodeId, endNodeId, state.activeParkData);
                if (resultObj && resultObj.path) {
                    const resultPath = resultObj.path;
                    let walkCost = 0;
                    for (let i = 0; i < resultPath.length - 1; i++) {
                        if (state.activeParkData.edges[resultPath[i]][resultPath[i+1]] === 'walk') walkCost++;
                    }
                    if (walkCost < lowestWalkCost) { lowestWalkCost = walkCost; bestEntrance = nodeId; }
                }
            }
            if (!bestEntrance) throw new Error("Could not find a valid entrance.");
            startNodeId = bestEntrance;
        }

        // --- PHASE 1: Draw the park route (brown/yellow) ---
        const routeResult = findShortestPath(startNodeId, endNodeId, state.activeParkData);
        const pathNodes = routeResult ? routeResult.path : null;

        if (pathNodes) {
            for (let i = 0; i < pathNodes.length - 1; i++) {
                const n1 = pathNodes[i]; const n2 = pathNodes[i+1];
                const pt1 = state.activeParkData.nodes[n1]; const pt2 = state.activeParkData.nodes[n2];
                const edgeType = state.activeParkData.edges[n1][n2];
                const segDistFeet = map.distance([pt1.lat, pt1.lng], [pt2.lat, pt2.lng]) * 3.28084;
                const color = edgeType === 'drive' ? '#8B4513' : '#FFD700';
                const dash = edgeType === 'walk' ? '10, 10' : '';
                if (edgeType === 'drive') distBrown += segDistFeet;
                if (edgeType === 'walk') distYellow += segDistFeet;
                L.polyline([[pt1.lat, pt1.lng], [pt2.lat, pt2.lng]], { color, weight: 7, opacity: 1.0, dashArray: dash }).addTo(routeLayer);
            }
        } else { throw new Error("Could not find a connected trail."); }

        // --- PHASE 2: Draw the driving route to the park gate (blue) ---
        if (needsDrivingRoute) {
            const targetNode = state.activeParkData.nodes[startNodeId];
            try {
                const route = await fetchStreetRoute(state.latestFix.lng, state.latestFix.lat, targetNode.lng, targetNode.lat);
                distBlue = route.distance * 3.28084;
                L.polyline(route.coords, { color: '#0078FF', weight: 6, opacity: 0.8 }).addTo(routeLayer);
                setRoutingAttribution(getRoutingProvider());
            } catch (e) {
                // Provider unavailable — render a straight dashed fallback line
                distBlue = map.distance([state.latestFix.lat, state.latestFix.lng], [targetNode.lat, targetNode.lng]) * 3.28084;
                L.polyline([[state.latestFix.lat, state.latestFix.lng], [targetNode.lat, targetNode.lng]], { color: '#0078FF', weight: 4, dashArray: '5, 10' }).addTo(routeLayer);
                setRoutingAttribution('fallback');
            }
        }

        if (routeLayer.getLayers().length > 0) map.fitBounds(routeLayer.getBounds(), { padding: [50, 50] });

        // --- PHASE 3: Render the multi-modal legend ---
        const legendDiv = document.getElementById('route-legend');
        legendDiv.innerHTML = '';
        let hasLegend = false;
        if (distBlue > 0) { legendDiv.innerHTML += `<div class="legend-row"><div class="legend-label"><div class="legend-color" style="background:#0078FF;"></div> Street</div> <span>${formatRouteDist(distBlue)}</span></div>`; hasLegend = true; }
        if (distBrown > 0) { legendDiv.innerHTML += `<div class="legend-row"><div class="legend-label"><div class="legend-color" style="background:#8B4513;"></div> Offroad</div> <span>${formatRouteDist(distBrown)}</span></div>`; hasLegend = true; }
        if (distYellow > 0) { legendDiv.innerHTML += `<div class="legend-row"><div class="legend-label"><div class="legend-color" style="background:#FFD700; border-top: 2px dashed rgba(0,0,0,0.3);"></div> Hike</div> <span>${formatRouteDist(distYellow)}</span></div>`; hasLegend = true; }
        legendDiv.style.display = hasLegend ? 'flex' : 'none';
        btnRoute.innerText = "Update Route";

    } catch (err) {
        console.error("Routing error:", err);
        alert(err.message || "An error occurred while calculating the route.");
        document.getElementById('btn-route').innerText = "Show Route";
        setRoutingAttribution('fallback');
    }
});

// === WAKE LOCK ===
document.getElementById('btn-wake').addEventListener('click', async () => {
    const btnWake = document.getElementById('btn-wake');
    if (!state.isWakeLockRequested) {
        state.isWakeLockRequested = true;
        await requestWakeLock();
    } else {
        state.isWakeLockRequested = false;
        if (state.wakeLockSentinel) { await state.wakeLockSentinel.release(); state.wakeLockSentinel = null; }
        btnWake.style.background = '#6c757d';
        btnWake.innerText = "🔒 Off";
    }
});

document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible' && state.isWakeLockRequested) await requestWakeLock();
});

// === SETTINGS MODAL ===
document.getElementById('btn-settings').addEventListener('click', () => {
    // Reset to first tab on open
    document.querySelectorAll('.settings-tab').forEach((t, i) => t.classList.toggle('active', i === 0));
    document.querySelectorAll('.settings-panel').forEach((p, i) => p.classList.toggle('active', i === 0));
    document.getElementById('settings-modal').style.display = 'flex';
    refreshStorageNumbers();
    initRoutingSettingsUI();
});
document.getElementById('close-settings').addEventListener('click', () => {
    document.getElementById('settings-modal').style.display = 'none';
});
window.addEventListener('click', (event) => {
    const settingsModal = document.getElementById('settings-modal');
    if (event.target === settingsModal) settingsModal.style.display = 'none';
});
document.querySelectorAll('.settings-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.settings-panel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
    });
});

// === ROUTING SETTINGS ===
document.getElementById('routing-provider-select').addEventListener('change', (e) => {
    const provider = e.target.value;
    localStorage.setItem('routing-provider', provider);
    document.getElementById('mapbox-key-section').style.display = provider === 'mapbox' ? 'block' : 'none';
    setRoutingAttribution(provider);
});

document.getElementById('btn-save-mapbox-key').addEventListener('click', () => {
    const key = document.getElementById('mapbox-key-input').value.trim();
    const status = document.getElementById('mapbox-key-status');
    if (key) {
        localStorage.setItem('mapbox-api-key', key);
        status.textContent = '✓ Key saved';
    } else {
        localStorage.removeItem('mapbox-api-key');
        status.textContent = 'Key removed';
    }
});

// === CACHE CLEAR BUTTONS ===
document.getElementById('btn-clear-app').addEventListener('click', async () => {
    if (confirm("Clear core app data?")) { await caches.delete(CACHES.app); document.getElementById('size-app').innerText = "0.00 MB"; }
});
document.getElementById('btn-clear-map').addEventListener('click', async () => {
    if (confirm("Clear offline map tiles?")) { await caches.delete(CACHES.map); document.getElementById('size-map').innerText = "0.00 MB"; }
});
document.getElementById('btn-clear-poi').addEventListener('click', async () => {
    if (confirm("Clear downloaded park POIs?")) { await caches.delete(CACHES.poi); document.getElementById('size-poi').innerText = "0.00 MB"; }
});
document.getElementById('btn-clear-path').addEventListener('click', async () => {
    if (confirm("Delete your current recorded GPS path?")) {
        await clearPathData();
        document.getElementById('size-path').innerText = "0.0000 MB";
    }
});

// === EXPORT PATH ===
document.getElementById('btn-export-path').addEventListener('click', exportPathAsGeoJSON);

// === FORCE UPDATE ===
document.getElementById('btn-force-update').addEventListener('click', forceUpdate);

// === BOOT ===
loadParkMenu();
loadSavedTrip();
startPositionWatch();
startGPSLogger();
registerServiceWorker();
setRoutingAttribution(getRoutingProvider());
