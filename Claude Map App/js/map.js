import { state } from './state.js';

export const map = L.map('map').setView([39.8283, -98.5795], 4);

export const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxNativeZoom: 19, maxZoom: 21
});
export const voyagerLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, © <a href="https://carto.com/attributions">CARTO</a>',
    maxNativeZoom: 19, maxZoom: 21
});
export const cartoLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, © <a href="https://carto.com/attributions">CARTO</a>',
    maxNativeZoom: 19, maxZoom: 21
});
export const satelliteLayer = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    {
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
        maxNativeZoom: 19, maxZoom: 21
    }
);
export const federalLandsLayer = L.tileLayer(
    'https://gis.blm.gov/arcgis/rest/services/lands/BLM_Natl_SMA_Cached_without_PriUnk/MapServer/tile/{z}/{y}/{x}',
    {
        opacity: 0.4, maxNativeZoom: 14, maxZoom: 21,
        bounds: [[14.0, -180.0], [72.0, -60.0]],
        attribution: 'Federal Lands © BLM SMA'
    }
);

osmLayer.addTo(map);
L.control.layers(
    { "Street (OSM)": osmLayer, "Street (Voyager)": voyagerLayer, "Street (Minimal)": cartoLayer, "Satellite": satelliteLayer },
    { "U.S. Federal Lands": federalLandsLayer }
).addTo(map);

const LocateControl = L.Control.extend({
    options: { position: 'topright' },
    onAdd: function () {
        const btn = L.DomUtil.create('div', 'leaflet-locate-control');
        btn.innerHTML = '📍';
        btn.title = 'Center Map';
        L.DomEvent.disableClickPropagation(btn);
        btn.onclick = () => {
            if (state.latestFix) map.setView([state.latestFix.lat, state.latestFix.lng], 18);
            else alert("Waiting for GPS signal...");
        };
        return btn;
    }
});
map.addControl(new LocateControl());

export const legend = L.control({ position: 'topright' });
legend.onAdd = function () {
    const div = L.DomUtil.create('div', 'map-legend');
    div.innerHTML += '<strong style="font-size:13px; display:block; margin-bottom:4px;">Federal Layers</strong>';
    div.innerHTML += '<i style="background: #FFE57F"></i> BLM<br>';
    div.innerHTML += '<i style="background: #C1E6B3"></i> Forest Service<br>';
    div.innerHTML += '<i style="background: #D9C2E6"></i> National Park<br>';
    div.innerHTML += '<i style="background: #FFC299"></i> Fish & Wildlife<br>';
    div.innerHTML += '<i style="background: #B2E3FF"></i> State Lands<br>';
    div.innerHTML += '<i style="background: #FFB3C6"></i> Dept. of Defense<br>';
    div.innerHTML += '<i style="background: #FFD3A6"></i> Tribal (BIA)<br>';
    return div;
};
legend.addTo(map);

map.on('overlayadd', e => {
    if (e.name === "U.S. Federal Lands") document.querySelector('.map-legend').style.display = 'block';
});
map.on('overlayremove', e => {
    if (e.name === "U.S. Federal Lands") document.querySelector('.map-legend').style.display = 'none';
});

const zoomWarning = document.getElementById('zoom-warning');
map.on('zoomend', () => { zoomWarning.style.display = map.getZoom() > 19 ? 'block' : 'none'; });

export const userMarker = L.marker([0, 0]).addTo(map);
export const pathLine = L.polyline([], { color: 'red', weight: 4 }).addTo(map);
export const routeLayer = L.featureGroup().addTo(map);
export const dotLayer = L.layerGroup().addTo(map);
export const dynamicPoiLayer = L.layerGroup().addTo(map);
export const trailPathLayer = L.layerGroup().addTo(map);
