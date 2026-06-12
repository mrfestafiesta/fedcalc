/**
 * popups.js — Popup and modal composition and display
 *
 * Owns all popup and modal UI that displays to the user. Responsible for assembling
 * weather data (from weather.js) with park-specific buttons and displaying forecasts.
 * Handles:
 * - POI popups: weather conditions, action buttons (website, details, route)
 * - Forecast modal: 24-hour and 7-day forecast display with attribution
 *
 * Exports:
 * - setPOIPopup(marker, lat, lng, name, options): Build and bind POI popup content
 * - showForecast(lat, lng, mode, poiName): Display forecast modal
 */

import { fetchWeather, fetchForecastHTML, selectProvider } from './weather/weather.js';

// Build and set the POI popup on a marker.
// Includes weather data, action buttons (website, park details, show route)
// options: { parkId, website } — each button renders only when its value is present
export async function setPOIPopup(marker, lat, lng, name, options = {}) {
    const safeName = name ? name.toString().replace(/'/g, "\\'") : 'Unknown POI';
    try {
        const { tempF, windText, humidity, elevationFt, precipitationProbability, provider } = await fetchWeather(lat, lng);

        const attribution = provider === 'nws'
            ? '<a href="https://www.weather.gov/" target="_blank" style="color: #0078FF; text-decoration: none; font-size: 11px;">Data by the National Weather Service</a>'
            : '<a href="https://open-meteo.com/" target="_blank" style="color: #0078FF; text-decoration: none; font-size: 11px;">Weather data by Open-Meteo.com</a>';

        const websiteBtn = options.website
            ? `<button onclick="window.open('${options.website}', '_blank')"
                   style="margin-top:8px;width:100%;padding:6px;background:#0078FF;color:white;border:none;border-radius:4px;cursor:pointer;font-size:12px;font-weight:bold;">
                   Show Park Website
               </button>`
            : '';
        const parkBtn = options.parkId
            ? `<button onclick="window.showParkDetails('${options.parkId}')"
                   style="margin-top:8px;width:100%;padding:6px;background:#28a745;color:white;border:none;border-radius:4px;cursor:pointer;font-size:12px;font-weight:bold;">
                   Show Park Details
               </button>`
            : '';

        // Route button: dynamically determines text based on whether this POI is the active route destination
        // Button text is set here when popup opens; updated in real-time by updateOpenPopupButton() in main.js
        // Logic: compare this popup's lat/lng to the currently active route destination (state.routeDestination)
        // - If match: button shows "Clear Route" (this POI has the active route)
        // - If no match: button shows "Show Route" (route is either inactive or to a different POI)
        const { state } = await import('./state.js');
        const isActiveRoute = state.routeDestination &&
                             state.routeDestination.lat === lat &&
                             state.routeDestination.lng === lng;
        const routeButtonText = isActiveRoute ? 'Clear Route' : 'Show Route';

        const routeBtn = `<button class="popup-route-btn" onclick="window.toggleRoute(${lat}, ${lng}, '${safeName}')"
                   style="margin-top:8px;width:100%;padding:6px;background:#FF6B6B;color:white;border:none;border-radius:4px;cursor:pointer;font-size:12px;font-weight:bold;">
                   ${routeButtonText}
               </button>`;

        // Divider between weather attribution and action buttons
        const buttonDivider = (options.website || options.parkId || true) ? '<div style="margin-top:8px;padding-top:8px;border-top:1px solid #eee;"></div>' : '';

        const popupContent = `
            <div class="weather-popup">
                <h4>${safeName}</h4>
                <p class="temp" style="margin-bottom: 4px;">${tempF}°F</p>
                <p class="weather-row" style="margin-bottom: 4px;">🏔️ ${elevationFt} ft &nbsp;&nbsp; 💨 ${windText}</p>
                <p class="weather-row" style="margin-bottom: 8px;">💧 ${humidity} &nbsp;&nbsp; 🌧️ ${precipitationProbability}</p>
                <div class="btn-container">
                    <button class="btn-weather btn-24hr" onclick="window.fetchForecast(${lat}, ${lng}, 'daily', '${safeName}')">24 Hr</button>
                    <button class="btn-weather btn-7day" onclick="window.fetchForecast(${lat}, ${lng}, 'weekly', '${safeName}')">7-Day</button>
                </div>
                <p style="margin: 8px 0 0 0; font-size: 11px; color: #666; text-align: center;">${attribution}</p>
                ${buttonDivider}
                ${websiteBtn}
                ${parkBtn}
                ${routeBtn}
            </div>
        `;
        if (marker.getPopup()) marker.setPopupContent(popupContent);
        else marker.bindPopup(popupContent);
    } catch (err) {
        console.error("Error building POI popup:", err);
        marker.bindPopup(`<b>${name}</b><br>Weather data unavailable.`);
    }
}

// Open the forecast modal and display the requested forecast.
export async function showForecast(lat, lng, mode, poiName) {
    const modal = document.getElementById('forecast-modal');
    const content = document.getElementById('forecast-content');
    const title = document.getElementById('forecast-title');

    modal.style.display = 'block';
    title.innerText = `${mode === 'weekly' ? '7-Day' : '24-Hour'} Forecast`;
    content.innerHTML = `<p style="text-align:center;">Fetching fresh data for ${poiName}...</p>`;

    try {
        const forecastHtml = await fetchForecastHTML(lat, lng, mode);

        // Determine provider for attribution (uses cached result from weather module)
        const provider = await selectProvider(lat, lng);
        const attribution = provider === 'nws'
            ? '<a href="https://www.weather.gov/" target="_blank" style="color: #0078FF; text-decoration: none; font-size: 11px;">Data by the National Weather Service</a>'
            : '<a href="https://open-meteo.com/" target="_blank" style="color: #0078FF; text-decoration: none; font-size: 11px;">Weather data by Open-Meteo.com</a>';

        const attributionHtml = `<div style="text-align: center; margin-top: 12px; padding-top: 12px; border-top: 1px solid #eee; font-size: 11px; color: #666;">${attribution}</div>`;
        content.innerHTML = forecastHtml + attributionHtml;
    } catch (error) {
        console.error('Forecast error:', error);
        content.innerHTML = `<p style="color: red; text-align: center;">Failed to load forecast data.</p>`;
    }
}

// Inline popup buttons call window.fetchForecast — expose it here.
window.fetchForecast = showForecast;
