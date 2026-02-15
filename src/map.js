// map.js
import { state } from './state.js';
import { addPoiToCircuit, isCircuitCompleted } from './circuit.js';
import { openDetailsPanel } from './ui.js';
import { getPoiId } from './data.js';
import { createIcons, icons } from 'lucide';
import { saveAppState } from './database.js';

export let map;
let svgRenderer;

// --- DÉFINITION DES ICÔNES ---
const ICON_BINOCULARS_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-binoculars-icon lucide-binoculars"><path d="M10 10h4"/><path d="M19 7V4a1 1 0 0 0-1-1h-2a1 1 0 0 0-1 1v3"/><path d="M20 21a2 2 0 0 0 2-2v-3.851c0-1.39-2-2.962-2-4.829V8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v11a2 2 0 0 0 2 2z"/><path d="M 22 16 L 2 16"/><path d="M4 21a2 2 0 0 1-2-2v-3.851c0-1.39 2-2.962 2-4.829V8a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v11a2 2 0 0 1-2 2z"/><path d="M9 7V4a1 1 0 0 0-1-1H6a1 1 0 0 0-1 1v3"/></svg>';
const ICON_AMPHORA_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-amphora-icon lucide-amphora"><path d="M10 2v5.632c0 .424-.272.795-.653.982A6 6 0 0 0 6 14c.006 4 3 7 5 8"/><path d="M10 5H8a2 2 0 0 0 0 4h.68"/><path d="M14 2v5.632c0 .424.272.795.652.982A6 6 0 0 1 18 14c0 4-3 7-5 8"/><path d="M14 5h2a2 2 0 0 1 0 4h-.68"/><path d="M18 22H6"/><path d="M9 2h6"/></svg>';

export const iconMap = {
    'A définir': 'circle-help',
    'Café': 'beer',
    'Commerce': 'shopping-cart',
    'Culture et tradition': ICON_AMPHORA_SVG,
    'Curiosité': ICON_BINOCULARS_SVG,
    'Hôtel': 'hotel',
    'Mosquée': 'landmark',
    'Pâtisserie': 'croissant',
    'Photo': 'camera',
    'Puits': 'droplets',
    'Restaurant': 'utensils-crossed',
    'Salon de thé': 'coffee',
    'Site historique': 'castle',
    'Site religieux': 'church',
    'Taxi': 'car-taxi-front'
};

// --- INITIALISATION CARTE SIMPLIFIÉE ---
export function initMap(initialCenter = [33.77478, 10.94353], initialZoom = 12.7) {
    if (map) {
        map.setView(initialCenter, initialZoom);
        return;
    }

    map = L.map('map', {
        zoomSnap: 0.1,
        zoomDelta: 0.1,
        wheelPxPerZoomLevel: 180,
        attributionControl: false,
        preferCanvas: true,
        zoomControl: false // Positionné manuellement
    }).setView(initialCenter, initialZoom);

    L.control.zoom({ position: 'topleft' }).addTo(map);

    const planLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
    });

    const googleHybridLayer = L.tileLayer('http://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
        maxZoom: 20,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
        attribution: '&copy; Google Maps'
    });

    planLayer.addTo(map);

    svgRenderer = L.svg({ padding: 0.5 });
    svgRenderer.addTo(map);

    const baseMaps = { "Plan": planLayer, "Satellite": googleHybridLayer };
    L.control.layers(baseMaps, null, { position: 'topleft' }).addTo(map);
    L.control.attribution({ position: 'bottomleft' }).addTo(map);

    // --- BOUTON RESET VUE ---
    const resetControl = L.Control.extend({
        options: { position: 'topleft' },
        onAdd: function() {
            const btn = L.DomUtil.create('button', 'leaflet-bar leaflet-control leaflet-control-custom');
            btn.type = 'button';
            btn.title = "Réinitialiser la vue";
            btn.style.backgroundColor = 'var(--bg)';
            btn.style.width = '44px';
            btn.style.height = '44px';
            btn.style.border = '1px solid var(--line)';
            btn.style.borderRadius = '12px';
            btn.style.cursor = 'pointer';
            btn.style.display = 'flex';
            btn.style.alignItems = 'center';
            btn.style.justifyContent = 'center';
            btn.style.padding = '0';

            btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-rotate-ccw"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 12"/><path d="M3 3v9h9"/></svg>`;

            // Style de survol géré via CSS ou inline si nécessaire
            btn.onmouseover = () => { btn.style.backgroundColor = 'var(--bg-2)'; };
            btn.onmouseout = () => { btn.style.backgroundColor = 'var(--bg)'; };

            btn.onclick = (e) => {
                L.DomEvent.stopPropagation(e);
                map.setView(initialCenter, initialZoom);
            };
            return btn;
        }
    });
    map.addControl(new resetControl());

    initMapListeners();
}

export function initMapListeners() {
    // Dessin automatique des circuits (Sans Zoom Automatique)
    window.addEventListener('circuit:updated', (e) => {
        const { points, activeId } = e.detail;
        clearMapLines();
        if (points.length < 2) return;

        let activeCircuit = state.myCircuits.find(c => c.id === activeId);
        if (!activeCircuit && state.officialCircuits) {
            activeCircuit = state.officialCircuits.find(c => c.id === activeId);
        }

        const isCompleted = isCircuitCompleted(activeCircuit);
        
        if (activeCircuit?.realTrack) {
            drawLineOnMap(activeCircuit.realTrack, true, isCompleted);
        } else {
            const coords = points.map(f => [f.geometry.coordinates[1], f.geometry.coordinates[0]]);
            drawLineOnMap(coords, false, isCompleted);
        }
    });
}

// --- UTILITAIRES ---
export function getIconHtml(category) {
    const defaultIcon = 'map-pin';
    const iconContent = iconMap[category] || defaultIcon;
    return iconContent.startsWith('<svg') ? iconContent : `<i data-lucide="${iconContent}"></i>`;
}

export function createHistoryWalkIcon(category) {
    return L.divIcon({
        html: `<div class="hw-icon-wrapper">${getIconHtml(category)}</div>`,
        className: 'hw-icon',
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        popupAnchor: [0, -32]
    });
}

export function getIconForFeature(feature) {
    return getIconHtml(feature.properties.Catégorie);
}

export function handleMarkerClick(feature) {
    clearMarkerHighlights();
    if (state.isSelectionModeActive) {
        addPoiToCircuit(feature);
    } else {
        const globalIndex = state.loadedFeatures.findIndex(f => f.properties.HW_ID === feature.properties.HW_ID);
        openDetailsPanel(globalIndex, null);
    }
}

// --- RENDU GRAPHIQUE ---
let currentDrawnLine = null; 

export function clearMarkerHighlights() {
    if (state.geojsonLayer) {
        state.geojsonLayer.eachLayer(layer => {
            if (layer.getElement()) layer.getElement().classList.remove('marker-highlight');
        });
    }
}

export function clearMapLines() {
    if (currentDrawnLine) { currentDrawnLine.remove(); currentDrawnLine = null; }
    if (state.orthodromicPolyline) { state.orthodromicPolyline.remove(); state.orthodromicPolyline = null; }
    if (state.realTrackPolyline) { state.realTrackPolyline.remove(); state.realTrackPolyline = null; }
}

export function drawLineOnMap(coordinates, isRealTrack = false, isCompleted = false) {
    clearMapLines();
    let className = isRealTrack ? (isCompleted ? 'real-track-polyline-done' : 'real-track-polyline') : 'circuit-polyline';

    const polyline = L.polyline(coordinates, {
        className: className,
        interactive: false,
        renderer: svgRenderer
    }).addTo(map);

    currentDrawnLine = polyline;
    if (isRealTrack) state.realTrackPolyline = polyline; else state.orthodromicPolyline = polyline;
}

export function updatePolylines() {
    if (state.orthodromicPolyline) state.orthodromicPolyline.remove();
    if (state.realTrackPolyline) state.realTrackPolyline.remove();
    if (!state.currentCircuit || state.currentCircuit.length < 2) return;

    let activeCircuitData = state.myCircuits.find(c => c.id === state.activeCircuitId);
    if (!activeCircuitData && state.officialCircuits) {
        activeCircuitData = state.officialCircuits.find(c => c.id === state.activeCircuitId);
    }

    const isCompleted = isCircuitCompleted(activeCircuitData);

    if (activeCircuitData && activeCircuitData.realTrack) {
        const className = isCompleted ? 'real-track-polyline-done' : 'real-track-polyline';
        state.realTrackPolyline = L.polyline(activeCircuitData.realTrack, { className: className, renderer: svgRenderer }).addTo(map);
    } else {
        const latLngs = state.currentCircuit.map(f => [f.geometry.coordinates[1], f.geometry.coordinates[0]]);
        state.orthodromicPolyline = L.polyline(latLngs, { className: 'circuit-polyline', renderer: svgRenderer }).addTo(map);
    }
}

export function getRealDistance(circuitData) {
    if (!circuitData || !circuitData.realTrack) return 0;
    let totalDistance = 0;
    for (let i = 0; i < circuitData.realTrack.length - 1; i++) {
        totalDistance += L.latLng(circuitData.realTrack[i]).distanceTo(L.latLng(circuitData.realTrack[i + 1]));
    }
    return totalDistance;
}

export function getOrthodromicDistance(circuit) {
    if (!circuit || circuit.length < 2) return 0;
    let totalDistance = 0;
    for (let i = 0; i < circuit.length - 1; i++) {
        const from = circuit[i].geometry.coordinates;
        const to = circuit[i + 1].geometry.coordinates;
        totalDistance += L.latLng(from[1], from[0]).distanceTo(L.latLng(to[1], to[0]));
    }
    return totalDistance;
}

export function refreshMapMarkers(visibleFeatures) {
    if (!map) return;
    if (!state.geojsonLayer) state.geojsonLayer = L.featureGroup().addTo(map); else state.geojsonLayer.clearLayers();
    if (visibleFeatures.length === 0) return;

    const tempLayer = L.geoJSON(visibleFeatures, {
        pointToLayer: (feature, latlng) => {
            const icon = createHistoryWalkIcon(feature.properties.Catégorie || 'default');
            const props = feature.properties.userData || {};
            if (props.incontournable) icon.options.className += ' marker-vip';
            if (props.vu) icon.options.className += ' marker-visited';
            if ((props.planifieCounter || 0) > 0) icon.options.className += ' marker-planned';

            const marker = L.marker(latlng, { icon: icon });
            marker.on('click', (e) => { L.DomEvent.stop(e); handleMarkerClick(feature); });
            return marker;
        }
    });
    tempLayer.eachLayer(layer => state.geojsonLayer.addLayer(layer));
    createIcons({ icons });
}

// --- API PUBLIQUE MINIMALISTE ---
// La seule fonction conservée est celle nécessaire pour le layout UI
let resizeTimeout;
export function invalidateMapSize() {
    if (!map) return;
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => { map.invalidateSize(); }, 100);
}

// Fonctions supprimées : fitMapToContent, focusOnCircuit -> Plus de zoom auto !
