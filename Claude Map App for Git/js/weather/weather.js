/**
 * weather.js — Unified weather interface with automatic provider selection
 *
 * Provides a single interface for fetching weather data globally by automatically selecting
 * the best available provider: NWS (National Weather Service) for USA locations, and Open-Meteo
 * for everywhere else. Provider selection is cached to avoid redundant API checks for repeated
 * calls to the same location. Both NWS and Open-Meteo API calls are intercepted by sw.js and
 * cached in WEATHER_CACHE with Network-First strategy for offline access.
 *
 * Exports:
 * - fetchWeather(lat, lng): Returns current weather { tempF, windText, humidity, elevationFt, precipitationProbability, provider }
 * - fetchForecastHTML(lat, lng, mode): Returns forecast rows as HTML string. mode: 'daily' | 'weekly'
 * - selectProvider(lat, lng): Determines and caches provider for a location
 */

import * as nws from './nws.js';
import * as openMeteo from './open-meteo.js';

const providerCache = {};

// Determine which provider to use based on coordinates.
// NWS covers USA only; Open-Meteo covers worldwide.
// Strategy: Try NWS first; fall back to Open-Meteo if not in USA.
// Caches provider decision to avoid repeated checks for same location.
export async function selectProvider(lat, lng) {
    const key = `${lat}_${lng}`;

    // Return cached provider if available
    if (providerCache[key]) {
        return providerCache[key];
    }

    try {
        // Try NWS point lookup — returns 404 for non-USA locations (intentional, not logged as error)
        const res = await fetch(`https://api.weather.gov/points/${lat},${lng}`);
        if (res.ok) {
            providerCache[key] = 'nws';
            return 'nws';
        }
    } catch {
        // Network error — treat as non-USA and fall back to Open-Meteo
    }

    providerCache[key] = 'openMeteo';
    return 'openMeteo';
}

// Current conditions for a coordinate. Auto-selects provider.
// Returns: { tempF, windText, humidity, elevationFt, precipitationProbability, provider }
export async function fetchWeather(lat, lng) {
    const provider = await selectProvider(lat, lng);
    const weatherData = provider === 'nws'
        ? await nws.fetchWeather(lat, lng)
        : await openMeteo.fetchWeather(lat, lng);
    return { ...weatherData, provider };
}

// Forecast HTML string. Auto-selects provider.
// mode: 'daily' (24-hour) or 'weekly' (7-day)
export async function fetchForecastHTML(lat, lng, mode) {
    const provider = await selectProvider(lat, lng);
    if (provider === 'nws') {
        return await nws.fetchForecastHTML(lat, lng, mode);
    } else {
        return await openMeteo.fetchForecastHTML(lat, lng, mode);
    }
}
