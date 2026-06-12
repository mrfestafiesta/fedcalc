/**
 * utils.js — Shared weather utility functions
 *
 * Provides format and transformation helpers used by both NWS and Open-Meteo providers
 * to ensure consistent user-facing results (e.g., "12 mph NW", "Calm").
 *
 * Exports:
 * - degreesToCardinal(deg): Converts compass degree to cardinal direction
 * - formatWind(speed, direction): Formats wind speed and direction for display
 */

export function degreesToCardinal(deg) {
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    return dirs[Math.round(deg / 45) % 8];
}

export function formatWind(speed, direction) {
    const spd = Math.round(parseFloat(speed));
    if (spd === 0) return 'Calm';
    return direction !== undefined && direction !== '' ? `${spd} mph ${direction}` : `${spd} mph`;
}
