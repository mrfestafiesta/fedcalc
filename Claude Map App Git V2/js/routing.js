/**
 * routing.js — Multi-modal routing engine and street routing integration
 *
 * Handles all routing concerns: offline topology-based routing using Dijkstra's algorithm,
 * street routing via Mapbox or OSRM, and provider configuration. Routes are multi-modal:
 * street (blue) → park entrance → offroad/trail (brown/yellow).
 *
 * Exports:
 * - getClosestNode, findShortestPath, formatRouteDist: Dijkstra engine for offline routing
 * - fetchStreetRoute, getRoutingProvider, getMapboxKey: Street routing API integration
 * - setRoutingAttribution: Update attribution based on active provider
 * - initRoutingSettingsUI: Populate settings dropdown with saved provider
 */

import { map } from './map.js';

/* === OFFLINE PARK TOPOLOGY ROUTING === */

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

/* === STREET ROUTING PROVIDER CONFIGURATION === */

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

/* === FETCH STREET ROUTE === */

export async function fetchStreetRoute(fromLng, fromLat, toLng, toLat) {
    const provider = getRoutingProvider();
    const url = provider === 'mapbox'
        ? `https://api.mapbox.com/directions/v5/mapbox/driving/${fromLng},${fromLat};${toLng},${toLat}?geometries=geojson&overview=full&steps=true&access_token=${getMapboxKey()}`
        : `https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?geometries=geojson&overview=full&steps=true`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Routing API returned ${res.status}`);
    const data = await res.json();
    if (!data.routes || data.routes.length === 0) throw new Error('No route found');

    const instructions = extractInstructions(data.routes[0], provider);

    return {
        distance: data.routes[0].distance,
        coords: data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]),
        instructions: instructions
    };
}

function extractInstructions(route, provider) {
    const instructions = [];

    if (!route.legs) return instructions;

    route.legs.forEach(leg => {
        if (!leg.steps) return;

        leg.steps.forEach(step => {
            const streetName = step.name || 'Unnamed street';
            const distance = step.distance;
            let instruction = step.instruction || '';

            if (!instruction && step.maneuver) {
                instruction = formatManeuver(step.maneuver, streetName);
            }

            if (instruction && distance > 0) {
                instructions.push({
                    instruction,
                    distance,
                    name: streetName
                });
            }
        });
    });

    return instructions;
}

function formatManeuver(maneuver, streetName) {
    if (!maneuver.type) return '';

    const type = maneuver.type;
    const modifier = maneuver.modifier || '';

    const typeMap = {
        'turn': modifier ? `Turn ${modifier}` : 'Turn',
        'new name': `Continue onto ${streetName}`,
        'merge': modifier ? `Merge ${modifier}` : 'Merge',
        'on ramp': 'Take ramp',
        'off ramp': 'Exit ramp',
        'fork': modifier ? `Take ${modifier} fork` : 'Take fork',
        'arrive': 'Arrive at destination',
        'depart': `Head ${modifier || 'forward'}`
    };

    let instruction = typeMap[type] || type;
    if (type === 'turn' && streetName) instruction += ` onto ${streetName}`;

    return instruction;
}

export function initRoutingSettingsUI() {
    document.getElementById('routing-provider-select').value = getRoutingProvider();
}
