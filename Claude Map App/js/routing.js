import { map } from './map.js';

export function getClosestNode(lat, lng, graphData) {
    let closestNode = null; let minDist = Infinity;
    for (let nodeId in graphData.nodes) {
        const node = graphData.nodes[nodeId];
        const d = map.distance([lat, lng], [node.lat, node.lng]);
        if (d < minDist) { minDist = d; closestNode = nodeId; }
    }
    return closestNode;
}

export function findShortestPath(startNodeId, endNodeId, graphData) {
    const distances = {}; const previous = {}; const unvisited = new Set(Object.keys(graphData.nodes));
    for (let node in graphData.nodes) { distances[node] = Infinity; previous[node] = null; }
    distances[startNodeId] = 0;

    while (unvisited.size > 0) {
        let currNode = null; let minVal = Infinity;
        for (let node of unvisited) {
            if (distances[node] < minVal) { minVal = distances[node]; currNode = node; }
        }
        if (currNode === null || currNode === endNodeId) break;
        unvisited.delete(currNode);

        const neighbors = graphData.edges[currNode] || {};
        for (let neighbor in neighbors) {
            if (unvisited.has(neighbor)) {
                const pt1 = graphData.nodes[currNode]; const pt2 = graphData.nodes[neighbor];
                const edgeType = neighbors[neighbor];
                const flatDistFeet = map.distance([pt1.lat, pt1.lng], [pt2.lat, pt2.lng]) * 3.28084;
                const altDiff = (pt2.elev || 0) - (pt1.elev || 0);
                let weight = Math.sqrt(Math.pow(flatDistFeet, 2) + Math.pow(altDiff, 2));
                if (edgeType === 'drive') weight *= 0.1;
                const altDistance = distances[currNode] + weight;
                if (altDistance < distances[neighbor]) { distances[neighbor] = altDistance; previous[neighbor] = currNode; }
            }
        }
    }

    if (distances[endNodeId] === Infinity) return { path: null, cost: Infinity };
    const path = []; let current = endNodeId;
    while (current !== null) { path.unshift(current); if (current === startNodeId) break; current = previous[current]; }
    return path.length > 1 && path[0] === startNodeId ? { path: path, cost: distances[endNodeId] } : { path: null, cost: Infinity };
}

export function formatRouteDist(feet) {
    return feet > 5280 ? (feet / 5280).toFixed(1) + ' mi' : feet.toFixed(0) + ' ft';
}

// === STREET ROUTING PROVIDER ===
export function getRoutingProvider() { return localStorage.getItem('routing-provider') || 'osrm'; }
export function getMapboxKey() { return localStorage.getItem('mapbox-api-key') || ''; }

let _routingAttribution = '';
export function setRoutingAttribution(type) {
    if (_routingAttribution) map.attributionControl.removeAttribution(_routingAttribution);
    const labels = {
        osrm:     'Street: OSRM',
        mapbox:   'Street: <a href="https://www.mapbox.com/">Mapbox</a>',
        fallback: 'Street: Fallback'
    };
    _routingAttribution = labels[type] || '';
    if (_routingAttribution) map.attributionControl.addAttribution(_routingAttribution);
}

export async function fetchStreetRoute(fromLng, fromLat, toLng, toLat) {
    const provider = getRoutingProvider();
    const url = provider === 'mapbox'
        ? `https://api.mapbox.com/directions/v5/mapbox/driving/${fromLng},${fromLat};${toLng},${toLat}?geometries=geojson&overview=full&access_token=${getMapboxKey()}`
        : `https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?geometries=geojson&overview=full`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Routing API returned ${res.status}`);
    const data = await res.json();
    if (!data.routes || data.routes.length === 0) throw new Error('No route found');
    return {
        distance: data.routes[0].distance,
        coords: data.routes[0].geometry.coordinates.map(c => [c[1], c[0]])
    };
}

export function initRoutingSettingsUI() {
    const select = document.getElementById('routing-provider-select');
    const keySection = document.getElementById('mapbox-key-section');
    const keyInput = document.getElementById('mapbox-key-input');
    const keyStatus = document.getElementById('mapbox-key-status');
    select.value = getRoutingProvider();
    keySection.style.display = select.value === 'mapbox' ? 'block' : 'none';
    const savedKey = getMapboxKey();
    keyInput.value = savedKey;
    keyStatus.textContent = savedKey ? '✓ Key saved' : '';
}
