/**
 * state.js — Shared mutable application state
 *
 * Exports a single `state` object that serves as the single source of truth for all
 * application state. All modules read and write to this object instead of maintaining
 * their own global variables. This approach prevents state inconsistencies and makes
 * the app's overall state observable in one place.
 *
 * State includes:
 * - GPS position and path recording
 * - Camera and compass state
 * - Active park data and selected POI
 * - Routing destination and display state
 * - AR elements and visual markers
 * - Chart and wake lock references
 */

export const state = {
    latestFix: null,
    lastLoggedFix: null,
    deviceHeading: 0,
    fullPathData: [],
    totalDistanceFeet: 0,
    isCameraOn: false,
    isCompassActive: false,
    isPathOn: false,
    currentStream: null,
    myChart: null,
    wakeLockSentinel: null,
    isWakeLockRequested: false,
    searchMarker: null,
    customPinMarker: null,
    activeParkData: null,
    activeARNodes: [],
    selectedPOI: null,
    gpsWatchId: null,

    // === ROUTING STATE ===
    // routeDestination: unified destination for all routing requests
    // Structure: { lat, lng, name, isExternal, node_id? }
    // - lat/lng: coordinates of the destination
    // - name: display name of the destination
    // - isExternal: true for external destinations (campgrounds, search results, etc.)
    //              false for internal park topology destinations
    // - node_id: (optional, internal destinations only) ID of the closest topology node
    //           Populated when destination is inside a loaded park and toggleRoute()
    //           auto-detects internal routing. Used by performRouting() for multi-modal routing.
    // Set by: toggleRoute() when user clicks "Show Route" button
    //         Auto-detects isExternal status and finds node_id for loaded parks
    // Cleared by: toggleRoute() when user clicks "Clear Route" button
    routeDestination: null,

    // routeDisplayed: whether a route is currently shown on the map
    // true: route layer has active route, popups show "Clear Route" button
    // false: no route displayed, popups show "Show Route" button
    // Updated by: toggleRoute() and performRouting()
    routeDisplayed: false,

    // activeRouteDirections: turn-by-turn instructions for the current route
    // Array of { instruction, distance, name }
    // Populated by: performRouting() after fetching street route
    // Cleared by: toggleRoute() when user clears the route
    activeRouteDirections: [],

    // activeRouteMeta: metadata about the current route
    // Structure: { provider, totalDistance, type }
    // - provider: 'osrm' or 'mapbox' (for street routes)
    // - totalDistance: total meters of the route
    // - type: 'street', 'multi-modal', 'trail' (for UI display)
    // Populated by: performRouting()
    // Cleared by: toggleRoute()
    activeRouteMeta: null,

    // currentDirectionIndex: index of the current direction step in activeRouteDirections
    // -1: no active direction (route not active or user not progressing)
    // 0+: current step number; updated as user progresses along route
    // Used for: progress tracking, highlighting current instruction
    currentDirectionIndex: -1
};

export const MAX_AR_RADIUS_FEET = 300;
export const MIN_BREADCRUMB_SPACING = 15;
export const compassEvent = 'ondeviceorientationabsolute' in window
    ? 'deviceorientationabsolute'
    : 'deviceorientation';
