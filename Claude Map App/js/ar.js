import { state, MAX_AR_RADIUS_FEET, MIN_BREADCRUMB_SPACING } from './state.js';
import { map } from './map.js';

export function clearARWorld() {
    document.querySelectorAll('.ar-node').forEach(n => n.remove());
    state.activeARNodes = [];
}

export function buildARWorld() {
    if (!state.activeParkData || !state.latestFix || !state.isCameraOn) return;
    clearARWorld();
    const userLoc = { lat: state.latestFix.lat, lng: state.latestFix.lng };
    const cameraContainer = document.getElementById('camera-container');

    let lastBreadcrumb = null;
    if (state.activeParkData.trail_path) {
        state.activeParkData.trail_path.forEach(coord => {
            const pt = { lat: coord[0], lng: coord[1], elev: coord[2] };
            const distToUser = map.distance([userLoc.lat, userLoc.lng], [pt.lat, pt.lng]) * 3.28084;
            if (distToUser <= MAX_AR_RADIUS_FEET) {
                if (!lastBreadcrumb || (map.distance([lastBreadcrumb.lat, lastBreadcrumb.lng], [pt.lat, pt.lng]) * 3.28084) >= MIN_BREADCRUMB_SPACING) {
                    spawnARNode(pt, 'breadcrumb', '', cameraContainer);
                    lastBreadcrumb = pt;
                }
            }
        });
    }

    if (state.activeParkData.locations) {
        state.activeParkData.locations.forEach(poi => {
            const distToUser = map.distance([userLoc.lat, userLoc.lng], [poi.lat, poi.lng]) * 3.28084;
            if (poi.has_ar && distToUser <= MAX_AR_RADIUS_FEET) {
                spawnARNode(poi, poi.ar_type || 'text', poi.name, cameraContainer);
            }
        });
    }
    updateARPositions();
}

export function spawnARNode(targetData, type, content, cameraContainer) {
    if (!cameraContainer) cameraContainer = document.getElementById('camera-container');
    const nodeDiv = document.createElement('div');
    nodeDiv.className = 'ar-node';
    if (type === 'breadcrumb') {
        nodeDiv.innerHTML = `<div class="ar-breadcrumb"></div>`;
    } else {
        nodeDiv.innerHTML = `<div class="ar-bubble">${content}</div><div class="ar-dist dist-label">-- ft</div>`;
    }
    cameraContainer.appendChild(nodeDiv);
    state.activeARNodes.push({ lat: targetData.lat, lng: targetData.lng, element: nodeDiv, isPOI: type !== 'breadcrumb' });
}

export function updateARPositions() {
    if (!state.isCameraOn || !state.latestFix || state.activeARNodes.length === 0) return;
    const userLoc = L.latLng(state.latestFix.lat, state.latestFix.lng);

    state.activeARNodes.forEach(node => {
        const targetLoc = L.latLng(node.lat, node.lng);
        const distFeet = userLoc.distanceTo(targetLoc) * 3.28084;

        const y = Math.sin(targetLoc.lng * Math.PI/180 - userLoc.lng * Math.PI/180) * Math.cos(targetLoc.lat * Math.PI/180);
        const x = Math.cos(userLoc.lat * Math.PI/180) * Math.sin(targetLoc.lat * Math.PI/180) - Math.sin(userLoc.lat * Math.PI/180) * Math.cos(targetLoc.lat * Math.PI/180) * Math.cos(targetLoc.lng * Math.PI/180 - userLoc.lng * Math.PI/180);
        let bearing = Math.atan2(y, x) * 180 / Math.PI;
        bearing = (bearing + 360) % 360;

        let diff = bearing - state.deviceHeading;
        while (diff < -180) diff += 360;
        while (diff > 180) diff -= 360;

        if (Math.abs(diff) < 35) {
            node.element.style.display = 'block';
            node.element.style.left = (50 + (diff * 1.5)) + "%";
            node.element.style.opacity = Math.abs(diff) > 25 ? "0.4" : "1.0";
            if (node.isPOI) node.element.querySelector('.dist-label').innerText = `${distFeet.toFixed(0)} ft`;
        } else {
            node.element.style.display = 'none';
        }
    });
}

export function handleOrientation(e) {
    let heading = 0;
    if (e.webkitCompassHeading) {
        heading = e.webkitCompassHeading;
    } else if (e.alpha !== null && e.beta !== null && e.gamma !== null) {
        const degToRad = Math.PI / 180;
        const alpha = e.alpha * degToRad; const beta = e.beta * degToRad; const gamma = e.gamma * degToRad;
        const cA = Math.cos(alpha), sA = Math.sin(alpha);
        const cB = Math.cos(beta),  sB = Math.sin(beta);
        const cG = Math.cos(gamma), sG = Math.sin(gamma);
        const x_w = -cA * sG - sA * sB * cG;
        const y_w = -sA * sG + cA * sB * cG;
        let compassHeading = Math.atan2(x_w, y_w) * (180 / Math.PI);
        if (compassHeading < 0) compassHeading += 360;
        heading = compassHeading;
    }
    state.deviceHeading = heading;
    const debugDiv = document.getElementById('debug-console');
    debugDiv.innerHTML = `DEBUG<br>Hdg: ${state.deviceHeading.toFixed(0)}°<br>Nodes: ${state.activeARNodes.length}`;
    updateARPositions();
}

export function toggleCompassUI(turningOn) {
    state.isCompassActive = turningOn;
    document.getElementById('btn-compass').classList.toggle('active', turningOn);
    document.getElementById('debug-console').style.display = turningOn ? 'block' : 'none';
}
