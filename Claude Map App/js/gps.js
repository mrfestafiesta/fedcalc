import { get, set, del } from 'https://unpkg.com/idb-keyval@6.2.1/dist/index.js';
import { state } from './state.js';
import { map, userMarker, pathLine, dotLayer } from './map.js';

export async function loadSavedTrip() {
    try {
        const savedPath = await get('my-hike-data');
        if (savedPath && savedPath.length > 0) {
            state.fullPathData = savedPath;
            const latLngs = state.fullPathData.map(p => [p[0], p[1]]);
            pathLine.setLatLngs(latLngs);
            latLngs.forEach(pt => L.circleMarker(pt, { radius: 4, color: 'orange', fillColor: '#f03', fillOpacity: 0.8 }).addTo(dotLayer));

            let restoredDist = 0;
            for (let i = 1; i < latLngs.length; i++) restoredDist += map.distance(latLngs[i-1], latLngs[i]);
            state.totalDistanceFeet = restoredDist * 3.28084;
            document.getElementById('dist-val').innerText = `${state.totalDistanceFeet.toFixed(1)} ft`;

            const lastPoint = state.fullPathData[state.fullPathData.length - 1];
            state.lastLoggedFix = { lat: lastPoint[0], lng: lastPoint[1] };
            map.setView([lastPoint[0], lastPoint[1]], 16);
        }
    } catch (err) { console.error(err); }
}

export function startGPSLogger() {
    setInterval(async () => {
        if (state.latestFix && state.isPathOn) {
            if (state.lastLoggedFix) {
                const from = L.latLng(state.lastLoggedFix.lat, state.lastLoggedFix.lng);
                const to = L.latLng(state.latestFix.lat, state.latestFix.lng);
                const distFeet = from.distanceTo(to) * 3.28084;
                if (distFeet > 3) {
                    state.totalDistanceFeet += distFeet;
                    document.getElementById('dist-val').innerText = `${state.totalDistanceFeet.toFixed(1)} ft`;
                    state.fullPathData.push([state.latestFix.lat, state.latestFix.lng, state.latestFix.alt, Date.now()]);
                    await set('my-hike-data', state.fullPathData);
                    L.circleMarker([state.latestFix.lat, state.latestFix.lng], { radius: 4, color: 'orange', fillColor: '#f03', fillOpacity: 0.8 }).addTo(dotLayer);
                    pathLine.setLatLngs(state.fullPathData.map(p => [p[0], p[1]]));
                    state.lastLoggedFix = state.latestFix;
                }
            } else {
                // No previous fix yet — log the first point of the session unconditionally
                state.fullPathData.push([state.latestFix.lat, state.latestFix.lng, state.latestFix.alt, Date.now()]);
                await set('my-hike-data', state.fullPathData);
                state.lastLoggedFix = state.latestFix;
            }
        }
    }, 5000);
}

export async function getPathSizeMB() {
    try {
        const data = await get('my-hike-data');
        if (!data || data.length === 0) return "0.00";
        const jsonString = JSON.stringify(data);
        return (new Blob([jsonString]).size / (1024 * 1024)).toFixed(2);
    } catch (e) { return "0.00"; }
}

export async function exportPathAsGeoJSON() {
    const data = await get('my-hike-data');
    if (!data || data.length === 0) {
        alert("No path data saved to export.");
        return;
    }
    const geojsonCoords = data.map(pt => [pt[1], pt[0], pt[2]]);
    const geojsonFormat = {
        "type": "FeatureCollection",
        "features": [{
            "type": "Feature",
            "properties": { "name": "Field Test Hike" },
            "geometry": { "type": "LineString", "coordinates": geojsonCoords }
        }]
    };
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(geojsonFormat, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "recorded_hike.geojson");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
}

export function startPositionWatch() {
    if (!navigator.geolocation) return;
    navigator.geolocation.watchPosition(
        (pos) => {
            state.latestFix = {
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                alt: pos.coords.altitude || 0,
                acc: pos.coords.accuracy
            };
            userMarker.setLatLng([state.latestFix.lat, state.latestFix.lng]);
            const altFeet = (state.latestFix.alt * 3.28084).toFixed(0);
            document.getElementById('status').innerText = `GPS Active\nAcc: ${state.latestFix.acc.toFixed(0)}m`;
            document.getElementById('elev-val').innerText = `${altFeet} ft`;
        },
        () => { document.getElementById('status').innerText = "Waiting for GPS..."; },
        { enableHighAccuracy: true, maximumAge: 0 }
    );
}

export async function clearPathData() {
    await del('my-hike-data');
    state.fullPathData = [];
    state.totalDistanceFeet = 0;
    pathLine.setLatLngs([]);
    dotLayer.clearLayers();
    state.lastLoggedFix = null;
    document.getElementById('dist-val').innerText = "0.0 ft";
}
