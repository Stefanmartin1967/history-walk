// map.js
import { state } from './state.js';
import { addPoiToCircuit } from './circuit.js';

export let map;

// --- DÉFINITION DES ICÔNES ---
const ICON_BINOCULARS_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-binoculars-icon lucide-binoculars"><path d="M10 10h4"/><path d="M19 7V4a1 1 0 0 0-1-1h-2a1 1 0 0 0-1 1v3"/><path d="M20 21a2 2 0 0 0 2-2v-3.851c0-1.39-2-2.962-2-4.829V8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v11a2 2 0 0 0 2 2z"/><path d="M 22 16 L 2 16"/><path d="M4 21a2 2 0 0 1-2-2v-3.851c0-1.39 2-2.962 2-4.829V8a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v11a2 2 0 0 1-2 2z"/><path d="M9 7V4a1 1 0 0 0-1-1H6a1 1 0 0 0-1 1v3"/></svg>';
const ICON_AMPHORA_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-amphora-icon lucide-amphora"><path d="M10 2v5.632c0 .424-.272.795-.653.982A6 6 0 0 0 6 14c.006 4 3 7 5 8"/><path d="M10 5H8a2 2 0 0 0 0 4h.68"/><path d="M14 2v5.632c0 .424.272.795.652.982A6 6 0 0 1 18 14c0 4-3 7-5 8"/><path d="M14 5h2a2 2 0 0 1 0 4h-.68"/><path d="M18 22H6"/><path d="M9 2h6"/></svg>';

export const iconMap = {
    'Mosquée': 'landmark',
    'Site historique': 'castle',
    'Culture et tradition': ICON_AMPHORA_SVG,
    'Curiosité': ICON_BINOCULARS_SVG,
    'Hôtel': 'hotel',
    'Site religieux': 'church',
    'Restaurant': 'utensils-crossed',
    'Taxi': 'car-taxi-front'
};
// --- FIN DÉFINITION DES ICÔNES ---


export function initMap() {
    // Initialisation de la carte
    map = L.map('map', { 
        zoomSnap: 0.25, 
        zoomDelta: 0.25, 
        wheelPxPerZoomLevel: 180, 
        attributionControl: false 
    }).setView([33.8076, 10.8451], 11);

    // 1. Couche "Plan" (OpenStreetMap)
    const planLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { 
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
    });

    // 2. Couche "Satellite" (Esri World Imagery)
    const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
        maxZoom: 18 // Esri va souvent moins loin que OSM
    });

    // Ajout de la couche par défaut (Plan)
    planLayer.addTo(map);

    // Création du contrôleur de couches
    const baseMaps = {
        "Plan": planLayer,
        "Satellite": satelliteLayer
    };

    // Ajout du bouton en haut à droite pour changer de vue
    L.control.layers(baseMaps).addTo(map);

    // Ajout de l'attribution en bas à gauche
    L.control.attribution({ position: 'bottomleft' }).addTo(map);
}


export function createHistoryWalkIcon(category) {
    const defaultIcon = 'map-pin';
    const iconContent = iconMap[category] || defaultIcon;
    let iconHtml;

    if (iconContent.startsWith('<svg')) {
        iconHtml = iconContent;
    } else {
        iconHtml = `<i data-lucide="${iconContent}"></i>`;
    }
    
    return L.divIcon({ 
        html: `<div class="hw-icon-wrapper">${iconHtml}</div>`, 
        className: 'hw-icon', 
        iconSize: [32, 32], 
        iconAnchor: [16, 32],
        popupAnchor: [0, -32]
    });
}

// Fonction rajoutée suite au bug mobile (et nécessaire pour l'affichage liste)
export function getIconForFeature(feature) {
    const defaultIcon = 'map-pin';
    const category = feature.properties.Catégorie;
    const iconContent = iconMap[category] || defaultIcon;
    
    if (iconContent.startsWith('<svg')) {
        // Pour les icônes SVG personnalisées, on retourne le SVG
        return iconContent;
    } else {
        // Pour les icônes Lucide, on retourne la balise <i>
        return `<i data-lucide="${iconContent}"></i>`;
    }
}

export function handleMarkerClick(feature) {
    addPoiToCircuit(feature);
}

function calculateRealDistance(latLngs) {
    let totalDistance = 0;
    for (let i = 0; i < latLngs.length - 1; i++) {
        totalDistance += L.latLng(latLngs[i]).distanceTo(L.latLng(latLngs[i + 1]));
    }
    return totalDistance;
}

export function updatePolylines() {
    if (state.orthodromicPolyline) state.orthodromicPolyline.remove();
    if (state.realTrackPolyline) state.realTrackPolyline.remove();
    if (state.currentCircuit.length < 2) return;

    const activeCircuitData = state.myCircuits.find(c => c.id === state.activeCircuitId);

    if (activeCircuitData && activeCircuitData.realTrack) {
        state.realTrackPolyline = L.polyline(activeCircuitData.realTrack, { className: 'real-track-polyline' }).addTo(map);
    } else {
        const latLngs = state.currentCircuit.map(feature => {
            const [lon, lat] = feature.geometry.coordinates;
            return [lat, lon];
        });
        state.orthodromicPolyline = L.polyline(latLngs, { className: 'circuit-polyline' }).addTo(map);
    }
}

export function getRealDistance(circuitData) {
    if (!circuitData || !circuitData.realTrack) return 0;
    return calculateRealDistance(circuitData.realTrack);
}

export function getOrthodromicDistance(circuit) {
    if (circuit.length < 2) return 0;
    let totalDistance = 0;
    for (let i = 0; i < circuit.length - 1; i++) {
        const from = circuit[i].geometry.coordinates;
        const to = circuit[i + 1].geometry.coordinates;
        totalDistance += L.latLng(from[1], from[0]).distanceTo(L.latLng(to[1], to[0]));
    }
    return totalDistance;
}