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
    selectedPOI: null
};

export const MAX_AR_RADIUS_FEET = 300;
export const MIN_BREADCRUMB_SPACING = 15;
export const compassEvent = 'ondeviceorientationabsolute' in window
    ? 'deviceorientationabsolute'
    : 'deviceorientation';
