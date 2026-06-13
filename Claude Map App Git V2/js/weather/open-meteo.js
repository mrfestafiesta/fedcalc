/**
 * open-meteo.js — Open-Meteo provider for worldwide locations
 *
 * Handles current conditions, hourly (24-hour), and daily (7-day) forecasts from Open-Meteo's
 * free global weather API. Weather codes (0-99) are mapped to text descriptions for consistency
 * with NWS output. Single-step API call with all parameters in query string; elevation always
 * available in root response. Forecast HTML cached 1 hour per coordinate+mode. Precipitation
 * probability fetched from first hourly data point; daily forecasts use max/min temps, peak
 * wind, dominant direction, and max precipitation. Forecasts use three-column flexbox layout:
 * (Date/Time + Temperature | Description | Wind + Precipitation) for responsive wrapping.
 *
 * Exports:
 * - fetchWeather(lat, lng): Returns current conditions with elevation, humidity, wind, precipitation probability
// - fetchForecastHTML(lat, lng, mode): Returns formatted forecast rows as HTML. mode: 'daily' | 'weekly'

import { formatWind, degreesToCardinal } from './utils.js';

/* === CACHING AND CONFIGURATION === */

const forecastCache = {};
const CACHE_DURATION_MS = 60 * 60 * 1000;

/* === WMO WEATHER CODE MAPPING === */

const weatherCodes = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Depositing rime fog',
  51: 'Light drizzle',
  53: 'Moderate drizzle',
  55: 'Dense drizzle',
  56: 'Light freezing drizzle',
  57: 'Dense freezing drizzle',
  61: 'Slight rain',
  63: 'Moderate rain',
  65: 'Heavy rain',
  66: 'Slight freezing rain',
  67: 'Heavy freezing rain',
  71: 'Slight snow',
  73: 'Moderate snow',
  75: 'Heavy snow',
  77: 'Snow grains',
  80: 'Slight rain showers',
  81: 'Moderate rain showers',
  82: 'Violent rain showers',
  85: 'Slight snow showers',
  86: 'Heavy snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with slight hail',
  99: 'Thunderstorm with heavy hail'
};

function getWeatherDescription(code) {
    return weatherCodes[code] || 'Unknown';
}

/* === PUBLIC API === */

export async function fetchWeather(lat, lng) {
    try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature,weather_code,wind_speed_10m,wind_direction_10m,relative_humidity_2m&hourly=relative_humidity_2m,precipitation_probability&timezone=auto&temperature_unit=fahrenheit&wind_speed_unit=mph`;

        const res = await fetch(url);
        if (!res.ok) throw new Error(`Open-Meteo returned ${res.status}`);
        const data = await res.json();

        const current = data.current;
        const hourly = data.hourly;

        const tempF = Math.round(current.temperature);
        const windDirection = degreesToCardinal(current.wind_direction_10m);
        const windText = formatWind(current.wind_speed_10m, windDirection);
        const humidity = `${current.relative_humidity_2m}%`;
        const precipProb = hourly.precipitation_probability && hourly.precipitation_probability[0] !== null
            ? `${hourly.precipitation_probability[0]}%`
            : '--';
        const elevationM = data.elevation;
        const elevationFt = elevationM ? Math.round(elevationM * 3.28084).toLocaleString() : '--';

        return {
            tempF: tempF,
            windText: windText,
            humidity: humidity,
            elevationFt: elevationFt,
            precipitationProbability: precipProb
        };
    } catch (err) {
        throw new Error(`Failed to fetch Open-Meteo weather: ${err.message}`);
    }
}

// Forecast rows as an HTML string.
// mode: 'daily' (24-hour) or 'weekly' (7-day). Cached for 1 hour per coord+mode.
export async function fetchForecastHTML(lat, lng, mode) {
    const cacheKey = `${lat}_${lng}_${mode}`;
    const now = Date.now();
    if (forecastCache[cacheKey] && (now - forecastCache[cacheKey].timestamp < CACHE_DURATION_MS)) {
        return forecastCache[cacheKey].html;
    }

    try {
        let html = '';

        if (mode === 'weekly') {
            // 7-day forecast from daily endpoint
            const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=temperature_2m_max,temperature_2m_min,weather_code,wind_speed_10m_max,wind_direction_10m_dominant,precipitation_probability_max&timezone=auto&temperature_unit=fahrenheit&wind_speed_unit=mph`;

            const res = await fetch(url);
            if (!res.ok) throw new Error(`Open-Meteo daily forecast returned ${res.status}`);
            const data = await res.json();

            for (let i = 0; i < Math.min(7, data.daily.time.length); i++) {
                const [year, month, day] = data.daily.time[i].split('-');
                const date = new Date(year, month - 1, day);
                const dayName = date.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' });
                const tempMax = Math.round(data.daily.temperature_2m_max[i]);
                const tempMin = Math.round(data.daily.temperature_2m_min[i]);
                const description = getWeatherDescription(data.daily.weather_code[i]);
                const windSpeed = Math.round(data.daily.wind_speed_10m_max[i]);
                const windDir = degreesToCardinal(data.daily.wind_direction_10m_dominant[i]).charAt(0);
                const precip = data.daily.precipitation_probability_max[i] || '--';

                html += `
                    <div style="display: flex; gap: 6px; padding: 6px 0; border-bottom: 1px solid #eee; font-size: 13px;">
                        <div style="display: flex; flex-direction: column; width: 80px;">
                            <span style="font-weight: bold;">${dayName}</span>
                            <span style="font-size: 12px; color: #666; white-space: nowrap;">${tempMax} / ${tempMin} °F</span>
                        </div>
                        <span style="flex: 1; text-align: left;">${description}</span>
                        <div style="display: flex; flex-direction: column; align-items: flex-end;">
                            <span style="font-size: 12px; color: #666; white-space: nowrap;">💨 ${windSpeed}${windDir}</span>
                            <span style="font-size: 12px; color: #666;">🌧️ ${precip}%</span>
                        </div>
                    </div>`;
            }
        } else {
            // 24-hour forecast from hourly endpoint
            const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=temperature_2m,weather_code,wind_speed_10m,wind_direction_10m,precipitation_probability&timezone=auto&temperature_unit=fahrenheit&wind_speed_unit=mph`;

            const res = await fetch(url);
            if (!res.ok) throw new Error(`Open-Meteo hourly forecast returned ${res.status}`);
            const data = await res.json();

            for (let i = 0; i < Math.min(24, data.hourly.time.length); i++) {
                const time = new Date(data.hourly.time[i]).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
                const temp = Math.round(data.hourly.temperature_2m[i]);
                const description = getWeatherDescription(data.hourly.weather_code[i]);
                const windDir = degreesToCardinal(data.hourly.wind_direction_10m[i]);
                const wind = formatWind(data.hourly.wind_speed_10m[i], windDir);
                const precip = data.hourly.precipitation_probability[i] || '--';

                html += `
                    <div style="display: flex; gap: 6px; padding: 6px 0; border-bottom: 1px solid #eee; font-size: 13px;">
                        <div style="display: flex; flex-direction: column; width: 60px;">
                            <span style="font-weight: bold;">${time}</span>
                            <span style="font-size: 12px; color: #666; white-space: nowrap;">${temp}°F</span>
                        </div>
                        <span style="flex: 1; text-align: left;">${description}</span>
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
        throw new Error(`Failed to fetch Open-Meteo forecast: ${err.message}`);
    }
}
