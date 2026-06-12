/**
 * main.js — Application entry point and event handlers
 *
 * Wires all DOM interactions (buttons, search, map events, settings modal) to imported functions
 * from other modules. Contains no business logic — all functionality is delegated to specialized modules.
 * Core responsibilities:
 * - Park/campground loading and rendering
 * - Search bar (park/map mode with geocoding)
 * - Route calculations and display
 * - Settings modal management
 * - Storage and cache controls
 * - Map interactions (long-press, click, zoom)
 */

import { state, compassEvent } from './state.js';
import { map, routeLayer, dotLayer, dynamicPoiLayer, trailPathLayer, campgroundLayer } from './map.js';
import { setPOIPopup } from './popups.js';
import { getClosestNode, findShortestPath, formatRouteDist, getRoutingProvider, getMapboxKey, setRoutingAttribution, fetchStreetRoute, initRoutingSettingsUI } from './routing.js';
import { clearARWorld, buildARWorld, handleOrientation, toggleCompassUI, setCompassUnavailable, initCompass } from './ar.js';
import { loadSavedTrip, startGPSLogger, startPositionWatch, stopPositionWatch, exportPathAsGeoJSON, clearPathData } from './gps.js';
import { CACHES, refreshStorageNumbers, requestWakeLock, showStatusPill, registerServiceWorker, forceUpdate } from './storage.js';
import { renderDirections, clearDirections } from './directions.js';

/* === PARK LIST === */
let parkList = [];

async function loadParkList() {
    try {
        const response = await fetch('./parks/loc_manifest.json');
        if (!response.ok) throw new Error("Manifest not found");
        parkList = await response.json();
    } catch (err) { console.error("Failed to load park directory:", err); }
}

// Load park detail data (boundaries, entry points, topology, facilities)
// parkId format: agency/park-name where agency includes region+type
// Example: "ca-state-parks/point-lobos-snr" (agency="ca-state-parks", park="point-lobos-snr")
// Used by "Show Park Details" button when clicking campgrounds in detail view
// Loads from: ./parks/{parkId}.json (e.g., ./parks/ca-state-parks/point-lobos-snr.json)
async function loadPark(parkId) {
    if (!parkId) {
        dynamicPoiLayer.clearLayers();
        trailPathLayer.clearLayers();
        routeLayer.clearLayers();
        state.selectedPOI = null;
        state.activeParkData = null;
        clearARWorld();
        return;
    }
    try {
        const response = await fetch(`./parks/${parkId}.json`);
        if (!response.ok) throw new Error("File not found");
        const data = await response.json();
        state.activeParkData = data;
        dynamicPoiLayer.clearLayers();
        trailPathLayer.clearLayers();
        const bounds = [];

        if (data.nodes && data.edges) {
            /* === TOPOLOGY MODE === */
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
            data.locations?.forEach(poi => {
                bounds.push([poi.lat, poi.lng]);
                const marker = L.marker([poi.lat, poi.lng]).bindPopup('<div style="text-align:center; padding: 10px; font-family: sans-serif;">Loading live weather...</div>');
                marker.on('click', async () => {
                    if (state.searchMarker) { map.removeLayer(state.searchMarker); state.searchMarker = null; }
                    if (state.customPinMarker) { map.removeLayer(state.customPinMarker); state.customPinMarker = null; }
                    state.selectedPOI = { lat: poi.lat, lng: poi.lng, name: poi.name, node_id: poi.node_id };
                    setPOIPopup(marker, poi.lat, poi.lng, poi.name);
                });
                dynamicPoiLayer.addLayer(marker);
            });
        } else if (data.boundary) {
            /* === MVP MODE (GIS data, no topology) === */

            // Boundary outline
            const geoLayer = L.geoJSON({ type: 'Feature', geometry: data.boundary }, {
                style: { color: '#2d7a2d', weight: 2.5, opacity: 0.9, fillColor: '#4CAF50', fillOpacity: 0.1 }
            });
            dynamicPoiLayer.addLayer(geoLayer);
            const lb = geoLayer.getBounds();
            if (lb.isValid()) bounds.push([lb.getSouth(), lb.getWest()], [lb.getNorth(), lb.getEast()]);

            // Entry point markers
            data.entryPoints?.forEach((ep, i) => {
                if (!ep.lat || !ep.lng) return;
                const epName = data.meta.name + (data.entryPoints.length > 1 ? ` Entry ${i + 1}` : ' Entry');
                const marker = L.marker([ep.lat, ep.lng])
                    .bindPopup('<div style="text-align:center; padding:10px; font-family:sans-serif;">Loading live weather...</div>');
                marker.on('click', () => {
                    if (state.searchMarker) { map.removeLayer(state.searchMarker); state.searchMarker = null; }
                    if (state.customPinMarker) { map.removeLayer(state.customPinMarker); state.customPinMarker = null; }
                    state.selectedPOI = { lat: ep.lat, lng: ep.lng, name: epName, isExternal: true, node_id: null };
                    setPOIPopup(marker, ep.lat, ep.lng, epName);
                });
                dynamicPoiLayer.addLayer(marker);
                bounds.push([ep.lat, ep.lng]);
                // Default routing target is the first entry point
                if (i === 0) state.selectedPOI = { lat: ep.lat, lng: ep.lng, name: epName, isExternal: true, node_id: null };
            });

            // Campground markers
            data.facilities?.forEach(facility => {
                if (!facility.lat || !facility.lng) return;
                const facName = facility.name || data.meta.name;
                const marker = L.marker([facility.lat, facility.lng], { icon: campIcon })
                    .bindPopup('<div style="text-align:center; padding:10px; font-family:sans-serif;">Loading live weather...</div>');
                marker.on('click', () => {
                    setPOIPopup(marker, facility.lat, facility.lng, facName, { parkId, website: data.meta.website });
                });
                dynamicPoiLayer.addLayer(marker);
                bounds.push([facility.lat, facility.lng]);
            });
        }

        if (bounds.length > 0) map.fitBounds(bounds, { padding: [50, 50] });
        if (state.isCameraOn && state.latestFix) buildARWorld();
    } catch (error) { alert("Could not load data for that location."); }
}

/* === CAMPGROUND SYSTEM === */

const campIcon = L.divIcon({
    className: '',
    html: `<div style="width:24px;height:24px;display:flex;align-items:center;justify-content:center;">
        <div class="camp-dot"></div>
        <div class="camp-tent">⛺</div>
    </div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -14]
});

function updateCampZoom() {
    const z = map.getZoom();
    document.getElementById('map').classList.toggle('zoom-high', z >= 10);
    document.getElementById('map').classList.toggle('zoom-low',  z < 10);
}
map.on('zoomend', updateCampZoom);
updateCampZoom();

// Campground loader — fetches campground markers only (no boundaries, no entry points)
const caCampgroundsLoaded = { value: false };
let caAllData = [];
// Marker persistence by design: All marker objects are kept in memory (not destroyed on pan/zoom)
// so that open popups remain attached to markers. This trades memory usage (~100 KB for 602 CA markers)
// for superior UX — popups don't disappear when the map moves. Users can clear POI data via
// Settings > Storage > "Clear POIs" button if needed.
let allCaMarkers = new Map(); // All CA marker objects in memory, keyed by facilityId
let visibleCaMarkers = new Set(); // Which facilityIds are currently in the DOM

// Load CA State Parks campgrounds index from parks/ca-state-parks/ca-state-parks-index.json
// Includes 602 CA State Parks campgrounds consolidated from 408 individual park files
// Pre-creates all marker objects in memory (allCaMarkers Map) for popup persistence
// Then calls renderCACampgrounds() to display those in viewport
//
// Caching Strategy: fetch() with NO cache option allows SW to use CACHE-FIRST strategy
// - First load: fetches from network, SW caches in tracker-data-v1
// - Return visits: loads instantly from cache
// - Size: ~180 KB (never evicted, always available offline)
// DO NOT use `cache: 'no-store'` here — it prevents the SW from caching and defeats offline capability
async function loadCACampgrounds() {
    try {
        showStatusPill('Loading CA campgrounds...');
        const response = await fetch('/parks/ca-state-parks/ca-state-parks-index.json');
        if (!response.ok) {
            showStatusPill('Failed to load CA campgrounds');
            return;
        }

        const caData = await response.json();
        caAllData = caData.campgrounds || [];

        // Pre-create all CA marker objects and store them in memory
        allCaMarkers.clear();
        caAllData.forEach(campground => {
            const { facilityId, name, lat, lng, parkId, website } = campground;
            const marker = L.marker([lat, lng], { icon: campIcon });
            marker.on('click', () => {
                map.closePopup();
                setPOIPopup(marker, lat, lng, name, { parkId, website });
            });
            allCaMarkers.set(facilityId, marker);
        });

        caCampgroundsLoaded.value = true;
        showStatusPill(`CA campgrounds loaded (${caAllData.length} total)`);
        renderCACampgrounds();
    } catch (err) {
        console.error('Error loading CA campgrounds:', err);
        showStatusPill('Error loading CA campgrounds');
    }
}

function renderCACampgrounds() {
    if (!caCampgroundsLoaded.value || caAllData.length === 0) return;

    // Determine which markers should be visible in current viewport
    const mapBounds = map.getBounds();
    const shouldBeVisible = new Set();

    caAllData.forEach(campground => {
        const { facilityId, lat, lng } = campground;
        if (mapBounds.contains([lat, lng])) {
            shouldBeVisible.add(facilityId);
        }
    });

    // Remove markers that are no longer in viewport (but keep in memory)
    visibleCaMarkers.forEach(facilityId => {
        if (!shouldBeVisible.has(facilityId)) {
            const marker = allCaMarkers.get(facilityId);
            if (marker) campgroundLayer.removeLayer(marker);
            visibleCaMarkers.delete(facilityId);
        }
    });

    // Add markers that are newly in viewport
    shouldBeVisible.forEach(facilityId => {
        if (!visibleCaMarkers.has(facilityId)) {
            const marker = allCaMarkers.get(facilityId);
            if (marker) campgroundLayer.addLayer(marker);
            visibleCaMarkers.add(facilityId);
        }
    });

    updateCampgroundLayerVisibility();
}

window.showParkDetails = function(parkId) {
    const park = parkList.find(p => p.id === parkId);
    loadPark(parkId);
    if (park) { searchInput.value = park.name; searchResults.style.display = 'none'; }
    map.closePopup();
};

// Campground panel toggle
const btnCampgrounds = document.getElementById('btn-campgrounds');
const campgroundPanel = document.getElementById('campground-panel');

btnCampgrounds.addEventListener('click', (e) => {
    e.stopPropagation();
    campgroundPanel.classList.toggle('open');
    btnCampgrounds.classList.toggle('active', campgroundPanel.classList.contains('open'));
});

document.addEventListener('click', (e) => {
    if (!campgroundPanel.contains(e.target) && e.target !== btnCampgrounds) {
        campgroundPanel.classList.remove('open');
        btnCampgrounds.classList.remove('active');
    }
});

document.getElementById('camp-toggle-ca-state-parks').addEventListener('change', async (e) => {
    if (e.target.checked) {
        // Load if not loaded, otherwise re-add existing markers to layer
        if (!caCampgroundsLoaded.value) {
            await loadCACampgrounds();
        } else {
            renderCACampgrounds();
        }
    } else {
        // Remove visible CA markers from layer (keep in memory)
        visibleCaMarkers.forEach(facilityId => {
            const marker = allCaMarkers.get(facilityId);
            if (marker) campgroundLayer.removeLayer(marker);
        });
        visibleCaMarkers.clear();
    }
    updateCampgroundLayerVisibility();
});

// Federal campgrounds toggle — unified interface for all 5,264 federal developed campgrounds
// Sources: BLM (306), USFS (3407), NPS (566), ACOE (953), USBR (13), USFWS (6), and others
// Mutually exclusive modes: "All Campgrounds" (show all 5264) OR "By State" (filter CA/NV/AZ/UT)
//
// Marker persistence by design: All 5,264 marker objects are kept in memory (not destroyed)
// so that open popups remain attached during map pan/zoom. This trades memory usage (~500 KB)
// for superior UX. Users can clear POI data via Settings > Storage > "Clear POIs" if needed.
const federalLoaded = { value: false };
let federalLoading = false; // Prevents race condition if user toggles rapidly while loading
let federalAllData = [];
let allFederalMarkers = new Map(); // All marker objects in memory, keyed by facilityId
let visibleFederalMarkers = new Set(); // Which facilityIds are currently in the DOM (viewport-constrained)
const federalStateCheckboxes = document.getElementById('federal-state-checkboxes');
const campToggles = {
    ca: () => document.getElementById('camp-toggle-ca-state-parks')?.checked || false,
    federal: () => {
        const all = document.getElementById('camp-toggle-federal-all')?.checked || false;
        const byState = document.getElementById('camp-toggle-federal-by-state')?.checked || false;
        return all || byState;
    },
};

function updateCampgroundLayerVisibility() {
    const anyActive = Object.values(campToggles).some(fn => fn());
    if (anyActive && !map.hasLayer(campgroundLayer)) {
        campgroundLayer.addTo(map);
    } else if (!anyActive && map.hasLayer(campgroundLayer)) {
        map.removeLayer(campgroundLayer);
    }
}

// Federal "All Campgrounds" toggle
document.getElementById('camp-toggle-federal-all').addEventListener('change', async (e) => {
    if (e.target.checked) {
        // Uncheck "By State" and hide state options
        document.getElementById('camp-toggle-federal-by-state').checked = false;
        federalStateCheckboxes.classList.remove('visible');
        document.querySelectorAll('#federal-state-checkboxes input').forEach(cb => cb.checked = false);

        // Load federal data if needed, then render all campgrounds
        if (!federalLoaded.value && !federalLoading) await loadFederalCampgrounds();
        else if (federalLoaded.value) renderFederalCampgrounds();
    } else {
        // Clear all federal campgrounds when unchecked
        visibleFederalMarkers.forEach(facilityId => {
            const marker = allFederalMarkers.get(facilityId);
            if (marker) campgroundLayer.removeLayer(marker);
        });
        visibleFederalMarkers.clear();
        updateCampgroundLayerVisibility();
    }
});

// Federal "By State" toggle
document.getElementById('camp-toggle-federal-by-state').addEventListener('change', async (e) => {
    if (e.target.checked) {
        // Uncheck "All Campgrounds" and show state options
        document.getElementById('camp-toggle-federal-all').checked = false;
        federalStateCheckboxes.classList.add('visible');

        // Load federal data if needed (but don't render until a state is selected)
        if (!federalLoaded.value && !federalLoading) await loadFederalCampgrounds();
    } else {
        // Hide state options and clear all federal campgrounds
        federalStateCheckboxes.classList.remove('visible');
        document.querySelectorAll('#federal-state-checkboxes input').forEach(cb => cb.checked = false);
        visibleFederalMarkers.forEach(facilityId => {
            const marker = allFederalMarkers.get(facilityId);
            if (marker) campgroundLayer.removeLayer(marker);
        });
        visibleFederalMarkers.clear();
        updateCampgroundLayerVisibility();
    }
});

// Handle individual state checkboxes
document.querySelectorAll('#federal-state-checkboxes input').forEach(checkbox => {
    checkbox.addEventListener('change', () => {
        // Only render if "By State" is checked
        if (document.getElementById('camp-toggle-federal-by-state').checked) {
            renderFederalCampgrounds();
        }
    });
});

// Federal campground icon — yellow circle at low zoom, yellow tent at high zoom
const federalIcon = L.divIcon({
    className: '',
    html: `<div style="width:24px;height:24px;display:flex;align-items:center;justify-content:center;">
        <div class="blm-dot"></div>
        <div class="blm-tent">⛺</div>
    </div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
});

// Load federal campgrounds index from parks/federal/index.json
// Includes all 5,264 federal developed campgrounds (5264 total, 4189 with state codes, 1075 with state=null)
// Pre-creates all marker objects in memory (allFederalMarkers Map) for popup persistence
// Then calls renderFederalCampgrounds() to display those in viewport
//
// Caching Strategy: fetch() with NO cache option allows SW to use CACHE-FIRST strategy
// - First load: fetches from network, SW caches in tracker-data-v1
// - Return visits: loads instantly from cache
// - Size: ~950 KB (never evicted, always available offline)
// DO NOT use `cache: 'no-store'` here — it prevents the SW from caching and defeats offline capability
async function loadFederalCampgrounds() {
    if (federalLoading) return; // Already loading; ignore duplicate requests
    federalLoading = true;
    try {
        showStatusPill('Loading federal campgrounds...');
        const response = await fetch('/parks/federal/index.json');
        if (!response.ok) {
            showStatusPill('Failed to load federal campgrounds');
            return;
        }

        const federalData = await response.json();
        federalAllData = federalData.campgrounds || [];

        // Pre-create all marker objects and store them in memory
        allFederalMarkers.clear();
        federalAllData.forEach(campground => {
            const { facilityId, name, lat, lng, agency } = campground;
            const marker = L.marker([lat, lng], { icon: federalIcon });
            marker.on('click', () => {
                map.closePopup();
                setPOIPopup(marker, lat, lng, name, { agency });
            });
            allFederalMarkers.set(facilityId, marker);
        });

        federalLoaded.value = true;
        showStatusPill(`Federal campgrounds loaded (${federalAllData.length} total)`);
        renderFederalCampgrounds();
    } catch (err) {
        console.error('Error loading federal campgrounds:', err);
        showStatusPill('Error loading federal campgrounds');
    } finally {
        federalLoading = false;
    }
}

// Render federal campgrounds with viewport-based lazy loading
// Mode 1: "All Campgrounds" (allChecked) — renders all 5,264 campgrounds visible in viewport
// Mode 2: "By State" (byStateChecked) — filters to selected states, renders only those in viewport
// Handles state=null campgrounds: included in "All Campgrounds" mode, excluded from "By State" mode
function renderFederalCampgrounds() {
    if (!federalLoaded.value || federalAllData.length === 0) return;

    let campgroundsToRender = federalAllData;
    const allChecked = document.getElementById('camp-toggle-federal-all').checked;
    const byStateChecked = document.getElementById('camp-toggle-federal-by-state').checked;

    // If "By State" is checked, filter to selected states
    if (byStateChecked && !allChecked) {
        const selectedStates = Array.from(document.querySelectorAll('#federal-state-checkboxes input:checked'))
            .map(cb => cb.dataset.state);

        if (selectedStates.length === 0) {
            // No states selected, remove all visible federal markers but keep in memory
            visibleFederalMarkers.forEach(facilityId => {
                const marker = allFederalMarkers.get(facilityId);
                if (marker) campgroundLayer.removeLayer(marker);
            });
            visibleFederalMarkers.clear();
            updateCampgroundLayerVisibility();
            return;
        }

        campgroundsToRender = federalAllData.filter(camp => {
            const stateCode = camp.state?.trim().toUpperCase();
            return stateCode && stateCode.length === 2 && selectedStates.includes(stateCode);
        });
    }

    // Determine which markers should be visible in current viewport
    const mapBounds = map.getBounds();
    const shouldBeVisible = new Set(); // facilityIds that should be in viewport

    campgroundsToRender.forEach(campground => {
        const { facilityId, lat, lng } = campground;
        if (mapBounds.contains([lat, lng])) {
            shouldBeVisible.add(facilityId);
        }
    });

    // Remove markers that are no longer in viewport (but keep in memory)
    visibleFederalMarkers.forEach(facilityId => {
        if (!shouldBeVisible.has(facilityId)) {
            const marker = allFederalMarkers.get(facilityId);
            if (marker) campgroundLayer.removeLayer(marker);
            visibleFederalMarkers.delete(facilityId);
        }
    });

    // Add markers that are newly in viewport
    shouldBeVisible.forEach(facilityId => {
        if (!visibleFederalMarkers.has(facilityId)) {
            const marker = allFederalMarkers.get(facilityId);
            if (marker) campgroundLayer.addLayer(marker);
            visibleFederalMarkers.add(facilityId);
        }
    });

    updateCampgroundLayerVisibility();
}

// Re-render campgrounds on map pan/zoom to implement viewport-based lazy loading
map.on('moveend', () => {
    const federalAllChecked = document.getElementById('camp-toggle-federal-all')?.checked || false;
    const federalByStateChecked = document.getElementById('camp-toggle-federal-by-state')?.checked || false;
    if (federalAllChecked || federalByStateChecked) {
        renderFederalCampgrounds();
    }
    if (document.getElementById('camp-toggle-ca-state-parks')?.checked) {
        renderCACampgrounds();
    }
});


/* === SEARCH BAR === */
let searchMode = 'map';
const searchModeToggle = document.getElementById('search-mode-toggle');
const searchInput = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');
let searchTimeout;
let currentController = null;

searchModeToggle.addEventListener('click', () => {
    searchMode = searchMode === 'map' ? 'park' : 'map';
    searchModeToggle.textContent = searchMode === 'map' ? '🌍' : '🏕️';
    searchInput.placeholder = searchMode === 'map' ? 'Search map...' : 'Search parks...';
    searchInput.value = '';
    searchResults.style.display = 'none';
    if (searchMode === 'park' && parkList.length === 0) loadParkList();
});

searchInput.addEventListener('focus', () => {
    if (searchMode === 'park' && parkList.length > 0) showParkResults(parkList);
});

searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    const query = e.target.value.trim();

    if (searchMode === 'park') {
        const filtered = query.length === 0 ? parkList : parkList.filter(p => p.name.toLowerCase().includes(query.toLowerCase()));
        showParkResults(filtered);
        return;
    }

    if (query.length < 3) { searchResults.style.display = 'none'; return; }

    searchTimeout = setTimeout(async () => {
        if (currentController) currentController.abort();
        currentController = new AbortController();
        searchResults.innerHTML = '<li style="color:#888; pointer-events:none; padding:12px 20px;">Searching...</li>';
        searchResults.style.display = 'block';
        try {
            const bounds = map.getBounds();
            const geocodingProvider = getGeocodingProvider();
            let url;

            if (geocodingProvider === 'mapbox') {
                const key = getMapboxKey();
                if (!key) {
                    searchResults.innerHTML = '<li style="color:#d9534f; pointer-events:none; padding:12px 20px;">Mapbox key not set — check Map Settings</li>';
                    return;
                }
                const bbox = `${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}`;
                url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${key}&limit=5&bbox=${bbox}`;
            } else if (geocodingProvider === 'photon') {
                const bbox = `${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}`;
                url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5&lang=en&bbox=${bbox}`;
            } else {
                // cache: 'no-store' bypasses the service worker so Nominatim is always hit fresh
                const viewbox = `${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()},${bounds.getSouth()}`;
                url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&viewbox=${viewbox}&bounded=0&limit=5`;
            }

            const res = await fetch(url, { signal: currentController.signal, cache: 'no-store' });
            if (!res.ok) throw new Error("API error");
            const data = await res.json();
            const results = (geocodingProvider === 'mapbox' || geocodingProvider === 'photon') ? data.features : data;

            searchResults.innerHTML = '';
            if (results && results.length > 0) {
                results.forEach(place => {
                    let lat, lon, displayName;
                    if (geocodingProvider === 'mapbox') {
                        lat = place.center[1]; lon = place.center[0]; displayName = place.place_name;
                    } else if (geocodingProvider === 'photon') {
                        lat = place.geometry.coordinates[1]; lon = place.geometry.coordinates[0];
                        const p = place.properties;
                        displayName = [p.name, p.city, p.state, p.country].filter(Boolean).join(', ');
                    } else {
                        lat = parseFloat(place.lat); lon = parseFloat(place.lon); displayName = place.display_name;
                    }
                    const li = document.createElement('li');
                    li.textContent = displayName || 'Unknown place';
                    li.onclick = () => {
                        map.setView([lat, lon], 14);
                        if (state.searchMarker) { map.removeLayer(state.searchMarker); state.searchMarker = null; }
                        if (state.customPinMarker) { map.removeLayer(state.customPinMarker); state.customPinMarker = null; }
                        state.searchMarker = L.marker([lat, lon]).addTo(map)
                            .bindPopup('<div style="text-align:center; padding: 10px; font-family: sans-serif;">Loading live weather...</div>')
                            .openPopup();
                        setPOIPopup(state.searchMarker, lat, lon, displayName);
                        let isExternal = true;
                        let closestNodeId = null;
                        if (state.activeParkData && state.activeParkData.nodes) {
                            closestNodeId = getClosestNode(lat, lon, state.activeParkData);
                            const node = state.activeParkData.nodes[closestNodeId];
                            const distFeet = map.distance([lat, lon], [node.lat, node.lng]) * 3.28084;
                            if (distFeet <= 1500) isExternal = false;
                        }
                        state.selectedPOI = { lat, lng: lon, name: displayName, node_id: closestNodeId, isExternal };
                        searchInput.value = '';
                        searchResults.style.display = 'none';
                        searchInput.blur();
                        document.getElementById('forecast-modal').style.display = 'none';
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

function showParkResults(parks) {
    searchResults.innerHTML = '';
    if (parks.length === 0) {
        searchResults.innerHTML = '<li style="color:#888; pointer-events:none; padding:12px 20px;">No parks found</li>';
    } else {
        parks.forEach(park => {
            const li = document.createElement('li');
            li.textContent = park.name;
            li.onclick = () => {
                loadPark(park.id);
                searchInput.value = park.name;
                searchResults.style.display = 'none';
                searchInput.blur();
                document.getElementById('forecast-modal').style.display = 'none';
            };
            searchResults.appendChild(li);
        });
    }
    searchResults.style.display = 'block';
}

document.addEventListener('click', (e) => {
    if (!document.getElementById('search-container').contains(e.target)) {
        searchResults.style.display = 'none';
    }
});

// === MAP CLICK/INTERACTION ===
// Close forecast modal when user clicks on map (but allow zoom/pan to keep it open)
map.on('click', () => {
    const modal = document.getElementById('forecast-modal');
    if (modal && modal.style.display !== 'none') {
        modal.style.display = 'none';
    }
});

// Close forecast modal on long-press
map.on('contextmenu', (e) => {
    const lat = e.latlng.lat;
    const lng = e.latlng.lng;
    if (state.searchMarker) { map.removeLayer(state.searchMarker); state.searchMarker = null; }
    if (state.customPinMarker) { map.removeLayer(state.customPinMarker); state.customPinMarker = null; }
    state.customPinMarker = L.marker([lat, lng]).addTo(map)
        .bindPopup('<div style="text-align:center; padding: 10px; font-family: sans-serif;">Loading live weather...</div>')
        .openPopup();
    setPOIPopup(state.customPinMarker, lat, lng, "Dropped Pin");
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

/* === CAMERA (settings toggle) === */
document.getElementById('btn-toggle-camera').addEventListener('click', async () => {
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
            updateToggleBtn('btn-toggle-camera', true);
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
        updateToggleBtn('btn-toggle-camera', false);
        clearARWorld();
        setTimeout(() => map.invalidateSize(), 100);
    }
});

/* === COMPASS (settings toggle) === */
document.getElementById('btn-toggle-compass').addEventListener('click', async () => {
    if (!state.isCompassActive) {
        await initCompass();
    } else {
        window.removeEventListener('deviceorientationabsolute', handleOrientation);
        window.removeEventListener('deviceorientation', handleOrientation);
        toggleCompassUI(false);
    }
});

/* === LOCATE BUTTON === */
document.getElementById('btn-locate').addEventListener('click', () => {
    if (state.latestFix) map.setView([state.latestFix.lat, state.latestFix.lng], 18);
    else alert("Waiting for GPS signal...");
});

/* === GPS PATH BUTTON === */
document.getElementById('btn-path').addEventListener('click', () => {
    state.isPathOn = !state.isPathOn;
    const btnPath = document.getElementById('btn-path');
    btnPath.classList.toggle('active', state.isPathOn);
    document.getElementById('data-display').style.display = state.isPathOn ? 'flex' : 'none';
    if (state.isPathOn && !state.lastLoggedFix && state.latestFix) state.lastLoggedFix = state.latestFix;
});

/* === RESET TRIP === */
document.getElementById('btn-reset').addEventListener('click', async () => {
    if (!confirm("Reset trip?")) return;
    await clearPathData();
    routeLayer.clearLayers();
});

/* === ELEVATION GRAPH === */
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
    document.getElementById('btn-graph').classList.add('active');
});

document.getElementById('close-chart').addEventListener('click', () => {
    document.getElementById('chart-modal').style.display = 'none';
    document.getElementById('btn-graph').classList.remove('active');
});

/* === ROUTING === */
// Routing calculation engine
// Calculates and displays multi-modal route from current GPS location (state.latestFix) to state.routeDestination
// Supports two routing modes based on isExternal:
// - External (true): street routing only (OSRM/Mapbox) — for campgrounds, search results, dropped pins, etc.
// - Internal (false): street routing + park topology routing — for destinations inside loaded parks
// Route visualization: blue=street, brown=offroad, yellow=hiking trail
async function performRouting() {
    if (!state.latestFix) return alert("Waiting for GPS...");
    if (!state.routeDestination) return alert("Please click a map pin to select a destination first!");
    if (!state.routeDestination.isExternal && (!state.activeParkData || !state.activeParkData.nodes)) {
        return alert("Offline routing graph not available for this location.");
    }

    routeLayer.clearLayers();
    document.getElementById('route-legend').style.display = 'none';

    try {
        let distBlue = 0, distBrown = 0, distYellow = 0;

        /* === EXTERNAL DESTINATION: use street routing only === */
        if (state.routeDestination.isExternal) {
            const route = await fetchStreetRoute(state.latestFix.lng, state.latestFix.lat, state.routeDestination.lng, state.routeDestination.lat);
            distBlue = route.distance * 3.28084;
            L.polyline(route.coords, { color: '#0078FF', weight: 6, opacity: 0.8 }).addTo(routeLayer);
            setRoutingAttribution(getRoutingProvider());

            state.activeRouteDirections = route.instructions || [];
            state.activeRouteMeta = {
                provider: getRoutingProvider(),
                totalDistance: route.distance,
                type: 'street'
            };
            state.currentDirectionIndex = 0;

            if (routeLayer.getLayers().length > 0) map.fitBounds(routeLayer.getBounds(), { padding: [50, 50] });
            const legendDiv = document.getElementById('route-legend');
            legendDiv.innerHTML = `<div class="legend-row"><div class="legend-label"><div class="legend-color" style="background:#0078FF;"></div> Street</div> <span>${formatRouteDist(distBlue)}</span></div>`;
            legendDiv.style.display = 'flex';
            renderDirections(state.activeRouteDirections);
            return;
        }

        // --- OFF-GRID ROUTING (internal park destination) ---
        const endNodeId = state.routeDestination.node_id;
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

                state.activeRouteDirections = route.instructions || [];
                state.activeRouteMeta = {
                    provider: getRoutingProvider(),
                    totalDistance: route.distance,
                    type: 'multi-modal'
                };
                state.currentDirectionIndex = 0;
            } catch (e) {
                // Provider unavailable — render a straight dashed fallback line
                distBlue = map.distance([state.latestFix.lat, state.latestFix.lng], [targetNode.lat, targetNode.lng]) * 3.28084;
                L.polyline([[state.latestFix.lat, state.latestFix.lng], [targetNode.lat, targetNode.lng]], { color: '#0078FF', weight: 4, dashArray: '5, 10' }).addTo(routeLayer);
                setRoutingAttribution('fallback');

                state.activeRouteDirections = [];
                state.activeRouteMeta = {
                    provider: 'fallback',
                    totalDistance: distBlue / 3.28084,
                    type: 'multi-modal'
                };
                state.currentDirectionIndex = -1;
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
        renderDirections(state.activeRouteDirections);

    } catch (err) {
        console.error("Routing error:", err);
        alert(err.message || "An error occurred while calculating the route.");
        setRoutingAttribution('fallback');
    }
}

// Button state is now determined dynamically in setPOIPopup based on whether
// the popup's destination matches state.routeDestination. No need to update buttons here.

// Route toggling and switching logic
// Called from: popup "Show Route" / "Clear Route" button (onclick handler)
// Implements unified routing destination system that handles:
// 1. Toggling route on/off for the same POI (same destination = clear route)
// 2. Switching routes between different POIs (different destination = clear old, show new)
// 3. Real-time button state updates in the open popup
// 4. Internal/external detection: if a park is loaded, detects if destination matches a
//    topology node and automatically uses internal routing (isExternal=false)
//
// Behavior:
// - First route: Sets state.routeDestination and calls performRouting()
// - Switch POI while route active: Clears old route, shows new route, updates button states
// - Clear route: Nulls state.routeDestination, clears map, updates button state
// - Internal detection: finds closest node in loaded park; if within ~100ft, uses internal routing
window.toggleRoute = async function(lat, lng, poiName, isExternal = true) {
    // AUTO-DETECT INTERNAL DESTINATIONS
    // If a park with topology is loaded, check if this destination matches a node
    // This enables internal routing for facilities/campgrounds clicked within a park detail view
    if (state.activeParkData && state.activeParkData.nodes) {
        const closestNode = getClosestNode(lat, lng, state.activeParkData);
        if (closestNode) {
            const node = state.activeParkData.nodes[closestNode];
            const distanceToNodeFeet = map.distance([lat, lng], [node.lat, node.lng]) * 3.28084;
            // If within ~100 feet of a topology node, treat as internal destination
            if (distanceToNodeFeet < 100) {
                isExternal = false;
            }
        }
    }

    // Check if this is the same destination as the currently active route
    const isSameDestination = state.routeDisplayed &&
                             state.routeDestination &&
                             state.routeDestination.lat === lat &&
                             state.routeDestination.lng === lng;

    if (isSameDestination) {
        // Clear the active route (clicking "Clear Route" on the same POI)
        routeLayer.clearLayers();
        document.getElementById('route-legend').style.display = 'none';
        setRoutingAttribution('fallback');
        state.routeDisplayed = false;
        state.routeDestination = null;
        state.activeRouteDirections = [];
        state.activeRouteMeta = null;
        state.currentDirectionIndex = -1;
        clearDirections();
        updateOpenPopupButton(false); // Update button text immediately
    } else {
        // Show route to a new destination (or show first route)
        try {
            // If a route to a different destination is already active, clear it first
            if (state.routeDisplayed && state.routeDestination) {
                routeLayer.clearLayers();
                document.getElementById('route-legend').style.display = 'none';
                state.activeRouteDirections = [];
                state.activeRouteMeta = null;
                state.currentDirectionIndex = -1;
                clearDirections();
            }

            // Build destination object with auto-detected internal/external status
            const destination = {
                lat: lat,
                lng: lng,
                name: poiName,
                isExternal: isExternal
            };

            // If internal destination, include the closest node_id for park topology routing
            if (!isExternal && state.activeParkData && state.activeParkData.nodes) {
                const closestNode = getClosestNode(lat, lng, state.activeParkData);
                if (closestNode) {
                    destination.node_id = closestNode;
                }
            }

            state.routeDestination = destination;
            await performRouting();
            state.routeDisplayed = true;
            updateOpenPopupButton(true); // Update button text immediately
        } catch (err) {
            state.routeDisplayed = false;
            state.routeDestination = null;
            updateOpenPopupButton(false);
        }
    }
};

// Update route button text in the currently open popup in real-time
// Called immediately after toggleRoute() changes routing state
// This ensures the button reflects the current state without requiring popup close/reopen
// isActiveRoute: true = route just became active (show "Clear Route")
//               false = route just became inactive (show "Show Route")
function updateOpenPopupButton(isActiveRoute) {
    const routeBtn = document.querySelector('.popup-route-btn');
    if (routeBtn) {
        routeBtn.innerText = isActiveRoute ? 'Clear Route' : 'Show Route';
    }
}

/* === WAKE LOCK === */
document.getElementById('btn-wake').addEventListener('click', async () => {
    const val = !state.isWakeLockRequested;
    state.isWakeLockRequested = val;
    localStorage.setItem('wake-lock-enabled', val);
    if (val) {
        await requestWakeLock();
    } else {
        if (state.wakeLockSentinel) { await state.wakeLockSentinel.release(); state.wakeLockSentinel = null; }
        updateToggleBtn('btn-wake', false);
    }
});

/* === GPS STATUS === */
document.getElementById('btn-toggle-gps').addEventListener('click', () => {
    const val = !getZoomSetting('gps-enabled', true);
    localStorage.setItem('gps-enabled', val);
    if (val) startPositionWatch(); else stopPositionWatch();
    updateToggleBtn('btn-toggle-gps', val);
});

document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible' && state.isWakeLockRequested) await requestWakeLock();
});

/* === SETTINGS MODAL === */
document.getElementById('btn-settings').addEventListener('click', () => {
    // Reset to first tab on open
    document.querySelectorAll('.settings-tab').forEach((t, i) => t.classList.toggle('active', i === 0));
    document.querySelectorAll('.settings-panel').forEach((p, i) => p.classList.toggle('active', i === 0));
    document.getElementById('settings-modal').style.display = 'flex';
    refreshStorageNumbers();
    initDeviceSettingsUI();
    initRoutingSettingsUI();
    document.getElementById('geocoding-provider-select').value = getGeocodingProvider();
    initZoomSettingsUI();
    updateApiKeySections();
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

/* === API KEY MANAGEMENT === */
function getGeocodingProvider() {
    return localStorage.getItem('geocoding-provider') || 'nominatim';
}

const API_KEY_PROVIDERS = {
    mapbox: { label: 'Mapbox API Key', storageKey: 'mapbox-api-key', placeholder: 'pk.eyJ1...' }
};

function updateApiKeySections() {
    const section = document.getElementById('api-keys-section');
    const needed = new Set();
    if (getRoutingProvider() === 'mapbox') needed.add('mapbox');
    if (getGeocodingProvider() === 'mapbox') needed.add('mapbox');

    if (needed.size === 0) { section.innerHTML = ''; return; }

    let html = '<h3 style="margin-top: 0; margin-bottom: 15px;">API Keys</h3>';
    needed.forEach(provider => {
        const cfg = API_KEY_PROVIDERS[provider];
        html += `<div style="margin-bottom: 15px;">
            <div class="grid-header" style="margin-bottom: 6px;">${cfg.label}</div>
            <input type="password" id="api-key-input-${provider}" placeholder="${cfg.placeholder}"
                   style="width:100%; padding:8px 10px; border-radius:6px; border:1px solid #ccc; font-size:13px; box-sizing:border-box; margin-bottom:8px; font-family:monospace;">
            <div style="display:flex; align-items:center; gap:10px;">
                <button class="btn-clear-row" style="background:#28a745; flex:1;" onclick="saveApiKey('${provider}')">Save Key</button>
                <span id="api-key-status-${provider}" style="font-size:12px; color:#28a745; font-weight:bold;"></span>
            </div>
        </div>`;
    });
    section.innerHTML = html;

    needed.forEach(provider => {
        const savedKey = localStorage.getItem(API_KEY_PROVIDERS[provider].storageKey) || '';
        const input = document.getElementById(`api-key-input-${provider}`);
        const status = document.getElementById(`api-key-status-${provider}`);
        if (input) input.value = savedKey;
        if (status && savedKey) status.textContent = '✓ Saved';
    });
}

window.saveApiKey = function(provider) {
    const cfg = API_KEY_PROVIDERS[provider];
    const key = document.getElementById(`api-key-input-${provider}`).value.trim();
    const status = document.getElementById(`api-key-status-${provider}`);
    if (key) {
        localStorage.setItem(cfg.storageKey, key);
        status.textContent = '✓ Key saved';
        status.style.color = '#28a745';
    } else {
        localStorage.removeItem(cfg.storageKey);
        status.textContent = 'Key removed';
        status.style.color = '#888';
    }
};

document.getElementById('routing-provider-select').addEventListener('change', (e) => {
    localStorage.setItem('routing-provider', e.target.value);
    updateApiKeySections();
    setRoutingAttribution(e.target.value);
});

document.getElementById('geocoding-provider-select').addEventListener('change', (e) => {
    localStorage.setItem('geocoding-provider', e.target.value);
    updateApiKeySections();
});

/* === CACHE CLEAR BUTTONS === */
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

document.getElementById('btn-clear-weather').addEventListener('click', async () => {
    if (confirm("Clear cached weather data?")) { await caches.delete(CACHES.weather); document.getElementById('size-weather').innerText = "0.00 MB"; }
});

/* === EXPORT PATH === */
document.getElementById('btn-export-path').addEventListener('click', exportPathAsGeoJSON);

/* === FORCE UPDATE === */
document.getElementById('btn-force-update').addEventListener('click', forceUpdate);

/* === MAP ZOOM SETTINGS === */
function getZoomSetting(key, defaultVal) {
    const val = localStorage.getItem(key);
    return val === null ? defaultVal : val === 'true';
}

function updateToggleBtn(id, enabled) {
    const btn = document.getElementById(id);
    btn.textContent = enabled ? 'Enabled' : 'Disabled';
    btn.style.background = enabled ? '#28a745' : '#d9534f';
}

function applyZoomSettings() {
    getZoomSetting('zoom-pinch', true)    ? map.touchZoom.enable()        : map.touchZoom.disable();
    getZoomSetting('zoom-doubletap', true) ? map.doubleClickZoom.enable()  : map.doubleClickZoom.disable();
    document.getElementById('zoom-controls').style.display = getZoomSetting('zoom-control', false) ? 'block' : 'none';
}

function initDeviceSettingsUI() {
    updateToggleBtn('btn-wake',            getZoomSetting('wake-lock-enabled', false));
    updateToggleBtn('btn-toggle-gps',      getZoomSetting('gps-enabled', true));
    updateToggleBtn('btn-toggle-compass',  state.isCompassActive);
    updateToggleBtn('btn-toggle-camera',   state.isCameraOn);
}

function initZoomSettingsUI() {
    updateToggleBtn('btn-toggle-pinch',     getZoomSetting('zoom-pinch', true));
    updateToggleBtn('btn-toggle-doubletap', getZoomSetting('zoom-doubletap', true));
    updateToggleBtn('btn-toggle-zoomctrl',  getZoomSetting('zoom-control', false));
}

document.getElementById('btn-toggle-pinch').addEventListener('click', () => {
    const val = !getZoomSetting('zoom-pinch', true);
    localStorage.setItem('zoom-pinch', val);
    val ? map.touchZoom.enable() : map.touchZoom.disable();
    updateToggleBtn('btn-toggle-pinch', val);
});
document.getElementById('btn-toggle-doubletap').addEventListener('click', () => {
    const val = !getZoomSetting('zoom-doubletap', true);
    localStorage.setItem('zoom-doubletap', val);
    val ? map.doubleClickZoom.enable() : map.doubleClickZoom.disable();
    updateToggleBtn('btn-toggle-doubletap', val);
});
document.getElementById('btn-toggle-zoomctrl').addEventListener('click', () => {
    const val = !getZoomSetting('zoom-control', false);
    localStorage.setItem('zoom-control', val);
    document.getElementById('zoom-controls').style.display = val ? 'block' : 'none';
    updateToggleBtn('btn-toggle-zoomctrl', val);
});

document.getElementById('btn-zoom-in').addEventListener('click',  () => map.zoomIn());
document.getElementById('btn-zoom-out').addEventListener('click', () => map.zoomOut());

/* === SERVICE WORKER MESSAGES === */
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', event => {
        if (event.data?.type === 'QUOTA_EXCEEDED') {
            showStatusPill('Storage full — clear map tiles in Settings', '#dc3545');
        }
    });
}

/* === BOOT === */
loadSavedTrip();
if (getZoomSetting('gps-enabled', true)) startPositionWatch();
else document.getElementById('gps-status').innerText = "🛰️ Off";
startGPSLogger();
registerServiceWorker();
setRoutingAttribution(getRoutingProvider());
applyZoomSettings();
if (getZoomSetting('wake-lock-enabled', false)) { state.isWakeLockRequested = true; requestWakeLock(); }
