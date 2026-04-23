export const forecastCache = {};
const CACHE_DURATION_MS = 60 * 60 * 1000;

export const weatherCodes = {
    0: '☀️ Clear', 1: '🌤️ Mostly Clear', 2: '⛅ Partly Cloudy', 3: '☁️ Overcast',
    45: '🌫️ Fog', 51: '🌧️ Light Drizzle', 61: '🌧️ Light Rain', 63: '🌧️ Moderate Rain',
    71: '❄️ Light Snow', 73: '❄️ Moderate Snow', 95: '⛈️ Thunderstorm'
};

export async function fetchAndSetPOIData(marker, lat, lng, name) {
    try {
        const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current_weather=true&temperature_unit=fahrenheit&timezone=auto`);
        const data = await res.json();
        const currentTemp = data.current_weather ? Math.round(data.current_weather.temperature) : '--';
        const elevation = data.elevation ? Math.round(data.elevation * 3.28084) : '--';
        const safeName = name ? name.toString().replace(/'/g, "\\'") : 'Unknown POI';
        const popupContent = `
            <div class="weather-popup">
                <h4>${safeName}</h4>
                <p class="elev">Elev: ${elevation} ft</p>
                <p class="temp">${currentTemp}°F</p>
                <div class="btn-container">
                    <button class="btn-weather btn-24hr" onclick="fetchForecast(${lat}, ${lng}, 'daily', '${safeName}')">24 Hr</button>
                    <button class="btn-weather btn-7day" onclick="fetchForecast(${lat}, ${lng}, 'weekly', '${safeName}')">7-Day</button>
                </div>
            </div>
        `;
        if (marker.getPopup()) {
            marker.setPopupContent(popupContent);
        } else {
            marker.bindPopup(popupContent);
        }
    } catch (err) {
        console.error("Error fetching POI data:", err);
        marker.bindPopup(`<b>${name}</b><br>Weather data unavailable.`);
    }
}

export async function fetchForecast(lat, lng, mode, poiName) {
    const modal = document.getElementById('forecast-modal');
    const content = document.getElementById('forecast-content');
    const title = document.getElementById('forecast-title');

    modal.style.display = 'block';
    title.innerText = `${mode === 'weekly' ? '7-Day' : '24-Hour'} Forecast`;

    const cacheKey = `${lat}_${lng}_${mode}`;
    const now = Date.now();

    if (forecastCache[cacheKey] && (now - forecastCache[cacheKey].timestamp < CACHE_DURATION_MS)) {
        content.innerHTML = forecastCache[cacheKey].html;
        return;
    }

    content.innerHTML = `<p style="text-align:center;">Fetching fresh data for ${poiName}...</p>`;

    try {
        let url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&temperature_unit=fahrenheit&timezone=auto`;
        if (mode === 'weekly') {
            url += '&daily=weather_code,temperature_2m_max,temperature_2m_min';
        } else {
            url += '&hourly=temperature_2m,weather_code&forecast_days=2';
        }

        const response = await fetch(url);
        const data = await response.json();
        let html = '';

        if (mode === 'weekly') {
            for (let i = 0; i < 7; i++) {
                const date = new Date(data.daily.time[i] + 'T12:00:00');
                const dayName = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                const maxT = Math.round(data.daily.temperature_2m_max[i]);
                const minT = Math.round(data.daily.temperature_2m_min[i]);
                const icon = weatherCodes[data.daily.weather_code[i]] || '🌥️';
                html += `
                    <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee;">
                        <span style="font-weight: bold; width: 80px;">${dayName}</span>
                        <span style="flex: 1; text-align: left; padding-left: 10px;">${icon}</span>
                        <span style="width: 80px; text-align: right;">${maxT}° / <span style="color:#777;">${minT}°</span></span>
                    </div>`;
            }
        } else {
            const currentHourObj = new Date();
            let hoursShown = 0;
            for (let i = 0; i < data.hourly.time.length; i++) {
                const forecastTime = new Date(data.hourly.time[i]);
                if (forecastTime >= currentHourObj && hoursShown < 24) {
                    if (hoursShown % 3 === 0) {
                        const timeStr = forecastTime.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true });
                        const temp = Math.round(data.hourly.temperature_2m[i]);
                        const icon = weatherCodes[data.hourly.weather_code[i]] || '🌥️';
                        html += `
                            <div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #eee;">
                                <span style="font-weight: bold; width: 70px;">${timeStr}</span>
                                <span style="flex: 1; text-align: left; padding-left: 10px;">${icon}</span>
                                <span style="width: 50px; text-align: right; font-weight: bold;">${temp}°F</span>
                            </div>`;
                    }
                    hoursShown++;
                }
            }
        }

        forecastCache[cacheKey] = { timestamp: now, html: html };
        content.innerHTML = html;

    } catch (error) {
        content.innerHTML = `<p style="color: red; text-align: center;">Failed to load forecast data.</p>`;
    }
}
