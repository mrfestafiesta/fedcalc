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
