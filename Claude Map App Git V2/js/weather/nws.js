/**
 * nws.js — NWS (National Weather Service) provider for USA locations
 *
 * Handles the two-step API lookup (grid point → forecast) to extract current conditions, hourly
 * forecasts, and 7-day forecasts. Text descriptions are provided directly by NWS with no code
 * mapping needed. Grid points are cached in memory to avoid repeated lookups; forecast HTML
 * is cached for 1 hour per coordinate+mode. Forecasts use a three-column flexbox layout:
 * (Date/Time + Temperature | Description | Wind + Precipitation) for responsive wrapping.
 *
 * Exports:
 * - fetchWeather(lat, lng): Returns current conditions with elevation, humidity, wind, precipitation probability
 * - fetchForecastHTML(lat, lng, mode): Returns formatted forecast rows as HTML. mode: 'daily' | 'weekly'
 */

import { formatWind, degreesToCardinal } from './utils.js';

/* === CACHING AND GRID POINT LOOKUP === */

const forecastCache = {};
const CACHE_DURATION_MS = 60 * 60 * 1000;
const gridPointCache = {};

async function getGridPoint(lat, lng) {
    const key = `${lat}_${lng}`;
    if (gridPointCache[key]) {
        return gridPointCache[key];
    }

    const res = await fetch(`https://api.weather.gov/points/${lat},${lng}`);
    if (!res.ok) throw new Error(`NWS grid point lookup returned ${res.status}`);
    const data = await res.json();

    const gridPoint = {
        forecastUrl: data.properties.forecast,
        hourlyUrl: data.properties.forecastHourly
    };

    gridPointCache[key] = gridPoint;
    return gridPoint;
}

/* === ELEVATION LOOKUP === */

async function getElevation(lat, lng) {
    const key = `elev_${lat}_${lng}`;
    if (gridPointCache[key]) {
        return gridPointCache[key];
    }

    const gridPoint = await getGridPoint(lat, lng);
    const res = await fetch(gridPoint.forecastUrl);
    if (!res.ok) throw new Error(`NWS forecast returned ${res.status}`);
    const data = await res.json();

    const elevation = data.properties.elevation ? Math.round(data.properties.elevation.value * 3.28084) : '--';
    gridPointCache[key] = elevation;
    return elevation;
}

/* === PUBLIC API === */

export async function fetchWeather(lat, lng) {
    try {
        const gridPoint = await getGridPoint(lat, lng);
        const res = await fetch(gridPoint.hourlyUrl);
        if (!res.ok) throw new Error(`NWS hourly forecast returned ${res.status}`);
        const data = await res.json();

        const now = new Date();
        let currentPeriod = data.properties.periods[0];

        for (const period of data.properties.periods) {
            const periodStart = new Date(period.startTime);
            const periodEnd = new Date(period.endTime);
            if (now >= periodStart && now < periodEnd) {
                currentPeriod = period;
                break;
            }
        }

        const elevation = await getElevation(lat, lng);
        const elevationFormatted = elevation !== '--' ? elevation.toLocaleString() : '--';

        const humidity = currentPeriod.relativeHumidity ? `${Math.round(currentPeriod.relativeHumidity.value)}%` : '--';
        const precipProb = currentPeriod.probabilityOfPrecipitation?.value !== null && currentPeriod.probabilityOfPrecipitation?.value !== undefined
            ? `${Math.round(currentPeriod.probabilityOfPrecipitation.value)}%`
            : '--';

        return {
            tempF:                  currentPeriod.temperature || '--',
            windText:               formatWind(currentPeriod.windSpeed, currentPeriod.windDirection),
            humidity:               humidity,
            elevationFt:            elevationFormatted,
            precipitationProbability: precipProb
        };
    } catch (err) {
        throw new Error(`Failed to fetch NWS weather: ${err.message}`);
    }
}

// Forecast rows as an HTML string (weather-domain presentation of weather data).
// mode: 'daily' (24-hour) or 'weekly' (7-day). Cached for 1 hour per coord+mode.
// Throws on failure; popups.js owns the modal and error display.
export async function fetchForecastHTML(lat, lng, mode) {
    const cacheKey = `${lat}_${lng}_${mode}`;
    const now = Date.now();
    if (forecastCache[cacheKey] && (now - forecastCache[cacheKey].timestamp < CACHE_DURATION_MS)) {
        return forecastCache[cacheKey].html;
    }

    try {
        const gridPoint = await getGridPoint(lat, lng);
        let html = '';

        if (mode === 'weekly') {
            // 7-day forecast: consolidate day/night periods into high/low format
            const res = await fetch(gridPoint.forecastUrl);
            if (!res.ok) throw new Error(`NWS forecast returned ${res.status}`);
            const data = await res.json();
            const periods = data.properties.periods;

            // Group periods by calendar day
            const daysByDate = {};
            periods.forEach(period => {
                const date = new Date(period.startTime);
                const dateKey = date.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' });
                if (!daysByDate[dateKey]) {
                    daysByDate[dateKey] = { day: null, night: null };
                }
                if (period.isDaytime) {
                    daysByDate[dateKey].day = period;
                } else {
                    daysByDate[dateKey].night = period;
                }
            });

            // Generate HTML for each day (condensed mobile-friendly format)
            Object.entries(daysByDate).forEach(([dateStr, temps]) => {
                const dayPeriod = temps.day;
                const nightPeriod = temps.night;

                if (!dayPeriod || !nightPeriod) return; // Skip incomplete days

                const highTemp = dayPeriod.temperature || '--';
                const lowTemp = nightPeriod.temperature || '--';
                const dayDescription = dayPeriod.shortForecast || '';
                const dayPrecip = dayPeriod.probabilityOfPrecipitation?.value ?? '--';
                const dayWindSpeed = Math.round(parseFloat(dayPeriod.windSpeed || 0));
                const nightWindSpeed = Math.round(parseFloat(nightPeriod.windSpeed || 0));
                const dayWindDir = (dayPeriod.windDirection || '').charAt(0);
                const nightWindDir = (nightPeriod.windDirection || '').charAt(0);

                html += `
                    <div style="display: flex; gap: 6px; padding: 6px 0; border-bottom: 1px solid #eee; font-size: 13px;">
                        <div style="display: flex; flex-direction: column; width: 80px;">
                            <span style="font-weight: bold;">${dateStr}</span>
                            <span style="font-size: 12px; color: #666; white-space: nowrap;">${highTemp} / ${lowTemp} °F</span>
                        </div>
                        <span style="flex: 1; text-align: left;">${dayDescription}</span>
                        <div style="display: flex; flex-direction: column; align-items: flex-end;">
                            <span style="font-size: 12px; color: #666; white-space: nowrap;">💨 ${dayWindSpeed}${dayWindDir} / ${nightWindSpeed}${nightWindDir}</span>
                            <span style="font-size: 12px; color: #666;">🌧️ ${dayPrecip}%</span>
                        </div>
                    </div>`;
            });
        } else {
            // 24-hour forecast from hourly endpoint
            const res = await fetch(gridPoint.hourlyUrl);
            if (!res.ok) throw new Error(`NWS hourly forecast returned ${res.status}`);
            const data = await res.json();

            const now = new Date();
            for (let i = 0; i < Math.min(24, data.properties.periods.length); i++) {
                const period = data.properties.periods[i];
                const periodStart = new Date(period.startTime);
                const time = periodStart.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
                const temp = period.temperature || '--';
                const wind = formatWind(period.windSpeed, period.windDirection);
                const precip = period.probabilityOfPrecipitation?.value ?? '--';
                html += `
                    <div style="display: flex; gap: 6px; padding: 6px 0; border-bottom: 1px solid #eee; font-size: 13px;">
                        <div style="display: flex; flex-direction: column; width: 60px;">
                            <span style="font-weight: bold;">${time}</span>
                            <span style="font-size: 12px; color: #666; white-space: nowrap;">${temp}°F</span>
                        </div>
                        <span style="flex: 1; text-align: left;">${period.shortForecast}</span>
                        <div style="display: flex; flex-direction: column; align-items: flex-end;">
                            <span style="font-size: 12px; color: #666; white-space: nowrap;">💨 ${wind}</span>
                            <span style="font-size: 12px; color: #666;">🌧️ ${precip}%</span>
                        </div>
                    </div>`;
            }
        }

        forecastCache[cacheKey] = { html, timestamp: now };
        return html;
    } catch (err) {
        throw new Error(`Failed to fetch NWS forecast: ${err.message}`);
    }
}

