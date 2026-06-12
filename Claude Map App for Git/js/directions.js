/**
 * directions.js — Turn-by-turn directions UI
 *
 * Renders and manages the collapsible directions panel that displays step-by-step
 * turn-by-turn instructions fetched from OSRM/Mapbox. Handles expansion/collapse,
 * scrolling, and highlighting the current direction as the user progresses.
 *
 * Exports:
 * - renderDirections(directions): Build and display the directions panel
 * - updateCurrentDirection(index): Highlight the current step
 * - clearDirections(): Remove the directions panel
 * - toggleDirectionsPanel(): Expand/collapse the panel
 */

import { state } from './state.js';

/* === DIRECTIONS PANEL MANAGEMENT === */

export function renderDirections(directions) {
    if (!directions || directions.length === 0) {
        clearDirections();
        return;
    }

    const panel = getOrCreateDirectionsPanel();
    const list = panel.querySelector('.directions-list');

    list.innerHTML = '';
    directions.forEach((dir, idx) => {
        const item = document.createElement('div');
        item.className = 'direction-item';
        item.dataset.index = idx;

        const number = document.createElement('div');
        number.className = 'direction-number';
        number.innerText = idx + 1;

        const emoji = document.createElement('div');
        emoji.className = 'direction-emoji';
        emoji.innerText = getDirectionEmoji(dir.instruction);

        const content = document.createElement('div');
        content.className = 'direction-content';

        const street = document.createElement('div');
        street.className = 'direction-street';
        street.innerText = dir.name || 'Unnamed';

        const distance = document.createElement('div');
        distance.className = 'direction-distance';
        distance.innerText = formatDistance(dir.distance);

        content.appendChild(street);
        content.appendChild(distance);

        item.appendChild(number);
        item.appendChild(emoji);
        item.appendChild(content);
        list.appendChild(item);
    });

    panel.style.display = 'flex';
    highlightCurrentDirection();
}

export function updateCurrentDirection(index) {
    state.currentDirectionIndex = index;
    highlightCurrentDirection();

    const list = document.querySelector('.directions-list');
    if (!list) return;

    const items = list.querySelectorAll('.direction-item');
    if (items[index]) {
        items[index].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

export function clearDirections() {
    const panel = document.getElementById('directions-panel');
    if (panel) {
        panel.style.display = 'none';
        state.activeRouteDirections = [];
        state.currentDirectionIndex = -1;
    }
}

export function toggleDirectionsPanel() {
    const panel = document.getElementById('directions-panel');
    if (!panel) return;

    const content = panel.querySelector('.directions-list');
    const toggle = panel.querySelector('.directions-toggle');
    const isExpanded = content.style.display !== 'none';

    if (isExpanded) {
        content.style.display = 'none';
        panel.classList.add('collapsed');
        toggle.innerText = '▶';
    } else {
        content.style.display = 'flex';
        panel.classList.remove('collapsed');
        toggle.innerText = '▼';
    }
}

/* === HELPERS === */

function getOrCreateDirectionsPanel() {
    let panel = document.getElementById('directions-panel');
    if (panel) return panel;

    panel = document.createElement('div');
    panel.id = 'directions-panel';
    panel.className = 'directions-panel';

    const header = document.createElement('div');
    header.className = 'directions-header';

    const title = document.createElement('span');
    title.className = 'directions-title';
    title.innerText = 'Directions';

    const toggle = document.createElement('button');
    toggle.className = 'directions-toggle';
    toggle.innerText = '▼';
    toggle.onclick = (e) => {
        e.stopPropagation();
        toggleDirectionsPanel();
    };

    header.appendChild(title);
    header.appendChild(toggle);

    const list = document.createElement('div');
    list.className = 'directions-list';

    panel.appendChild(header);
    panel.appendChild(list);

    const routeLegend = document.getElementById('route-legend');
    if (routeLegend && routeLegend.parentNode) {
        routeLegend.parentNode.insertBefore(panel, routeLegend);
    }

    return panel;
}

function highlightCurrentDirection() {
    const list = document.querySelector('.directions-list');
    if (!list) return;

    const items = list.querySelectorAll('.direction-item');
    items.forEach((item, idx) => {
        if (idx === state.currentDirectionIndex) {
            item.classList.add('current');
        } else {
            item.classList.remove('current');
        }
    });
}

function formatDistance(meters) {
    const feet = Math.round(meters * 3.28084);
    if (feet < 528) return `${feet} ft`;
    const miles = (feet / 5280).toFixed(1);
    return `${miles} mi`;
}

function getDirectionEmoji(instruction) {
    const lowerInst = instruction.toLowerCase();

    // U-turn
    if (lowerInst.includes('uturn') || lowerInst.includes('u-turn')) return '↩️';

    // Turn left (all variations)
    if (lowerInst.includes('turn left') || lowerInst.includes('merge left')) return '⬅️';

    // Turn right (all variations)
    if (lowerInst.includes('turn right') || lowerInst.includes('merge right') || lowerInst.includes('merge')) return '➡️';

    // Continue/straight
    if (lowerInst.includes('continue') || lowerInst.includes('head') || lowerInst.includes('straight')) return '⬆️';

    // Arrive
    if (lowerInst.includes('arrive')) return '⬆️';

    // Exit/ramp
    if (lowerInst.includes('exit') || lowerInst.includes('ramp')) return '➡️';

    // Default
    return '⬆️';
}
