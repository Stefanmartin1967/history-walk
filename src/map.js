// map.js
import { state } from './state.js';
import { addPoiToCircuit } from './circuit.js';
import { openDetailsPanel } from './ui.js'; // <-- Ajouter l'import de l'UI
import { showToast } from './toast.js';
import { getPoiId } from './data.js';

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

// --- INITIALISATION CARTE ---

// --- INITIALISATION CARTE ---

// --- INITIALISATION CARTE ---

// --- INITIALISATION CARTE ---

export function initMap() {
    // Initialisation de la carte centrée sur Djerba
    map = L.map('map', {
        zoomSnap: 0.25,
        zoomDelta: 0.25,
        wheelPxPerZoomLevel: 180,
        attributionControl: false
    }).setView([33.8076, 10.8451], 11);

    // 1. Couche "Plan" (OpenStreetMap) - Très léger
    const planLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
    });

    // 2. Couche "Satellite Hybride" (Google Maps) - Le meilleur compromis
    // lyrs=y : C'est le code pour "Hybrid" (Photo + Noms + Routes)
    // C'est une seule image à charger, donc c'est le plus rapide pour le WiFi d'hôtel !
    const googleHybridLayer = L.tileLayer('http://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
        maxZoom: 20,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
        attribution: '&copy; Google Maps'
    });

    // Ajout de la couche par défaut (Plan)
    planLayer.addTo(map);

    // Création du contrôleur de couches
    const baseMaps = {
        "Plan": planLayer,
        "Satellite": googleHybridLayer
    };

    // --- POSITION DU MENU : HAUT GAUCHE ---
    // On le met à gauche (topleft) pour qu'il ne soit jamais caché par le panneau de droite
    L.control.layers(baseMaps, null, { position: 'topleft' }).addTo(map);

    // Ajout de l'attribution (Bas gauche)
    L.control.attribution({ position: 'bottomleft' }).addTo(map);
    initMapListeners();
}

/**
 * Initialise les écouteurs d'événements pour la carte
 * (La carte écoute les signaux envoyés par le reste de l'appli)
 */
export function initMapListeners() {
    console.log("📍 La carte est maintenant à l'écoute des changements de circuit...");

    window.addEventListener('circuit:updated', (e) => {
        const { points, activeId } = e.detail;

        // 1. On nettoie tout
        clearMapLines();

        if (points.length < 2) return;

        // 2. On récupère les infos fraîches depuis le state
        const activeCircuit = state.myCircuits.find(c => c.id === activeId);
        
        // 3. Choix du tracé (Réel prioritaire sur Vol d'oiseau)
        if (activeCircuit?.realTrack) {
            drawLineOnMap(activeCircuit.realTrack, true);
        } else {
            const coords = points.map(f => [
                f.geometry.coordinates[1], 
                f.geometry.coordinates[0]
            ]);
            drawLineOnMap(coords, false);
        }
    });
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

// Utile pour l'affichage dans la liste mobile
// --- LE NOUVEL AIGUILLEUR DE CLIC ---
// --- FONCTION POUR LES ICONES (Celle qui avait disparu !) ---
export function getIconForFeature(feature) {
    const defaultIcon = 'map-pin';
    const category = feature.properties.Catégorie;
    // On suppose que iconMap est défini plus haut dans votre fichier
    const iconContent = iconMap[category] || defaultIcon;

    if (iconContent.startsWith('<svg')) {
        return iconContent;
    } else {
        return `<i data-lucide="${iconContent}"></i>`;
    }
}

// --- LE NOUVEL AIGUILLEUR DE CLIC ---
export function handleMarkerClick(feature) {
    // L'AIGUILLAGE STRICT
    if (state.isSelectionModeActive) {
        // --- MODE SELECTION (ON) ---
        const poiId = getPoiId(feature);
        const isInCircuit = state.currentCircuit.some(f => getPoiId(f) === poiId);

        if (isInCircuit) {
             const globalIndex = state.loadedFeatures.findIndex(f => f.properties.HW_ID === feature.properties.HW_ID);
             const circuitIndex = state.currentCircuit.findIndex(f => getPoiId(f) === poiId);
             openDetailsPanel(globalIndex, circuitIndex);
             return;
        }

        if (state.currentCircuit.length >= 15) {
            showToast("Circuit plein (15 points max) !", "warning");
            return;
        }
        addPoiToCircuit(feature);
        showToast("Ajouté au circuit", "success");

    } else {
        // --- MODE CONSULTATION (OFF) ---
        const globalIndex = state.loadedFeatures.findIndex(f => f.properties.HW_ID === feature.properties.HW_ID);
        openDetailsPanel(globalIndex, null);
    }
}

// --- LE NOUVEAU PEINTRE ---
let currentDrawnLine = null; 

export function clearMapLines() {
    // 1. Nettoyage de la variable locale
    if (currentDrawnLine) {
        currentDrawnLine.remove();
        currentDrawnLine = null;
    }

    // 2. Nettoyage des références dans le State (Utilisées par circuit.js)
    // On boucle sur les deux types de polylines possibles
    if (state.orthodromicPolyline) {
        state.orthodromicPolyline.remove();
        state.orthodromicPolyline = null;
    }
    
    if (state.realTrackPolyline) {
        state.realTrackPolyline.remove();
        state.realTrackPolyline = null;
    }
}

export function drawLineOnMap(coordinates, isRealTrack = false) {
    // On nettoie AVANT de dessiner
    clearMapLines();

    const color = isRealTrack ? '#ff0000' : '#0000ff'; // Rouge pour réel, Bleu pour théorique
    const dashArray = isRealTrack ? null : '5, 10';   // Plein pour réel, Pointillé pour théorique

    const polyline = L.polyline(coordinates, {
        color: color,
        weight: 3,
        dashArray: dashArray,
        interactive: false
    }).addTo(map);

    // On stocke la référence aux deux endroits pour être sûr
    currentDrawnLine = polyline;
    
    if (isRealTrack) {
        state.realTrackPolyline = polyline;
    } else {
        state.orthodromicPolyline = polyline;
    }
}

// --- GESTION DES DISTANCES ET TRACÉS ---

function calculateRealDistance(latLngs) {
    let totalDistance = 0;
    for (let i = 0; i < latLngs.length - 1; i++) {
        totalDistance += L.latLng(latLngs[i]).distanceTo(L.latLng(latLngs[i + 1]));
    }
    return totalDistance;
}

export function updatePolylines() {
    // Nettoyage des anciennes lignes
    if (state.orthodromicPolyline) state.orthodromicPolyline.remove();
    if (state.realTrackPolyline) state.realTrackPolyline.remove();

    // Pas de tracé si moins de 2 points
    if (!state.currentCircuit || state.currentCircuit.length < 2) return;

    // Sécurité : on s'assure que myCircuits est un tableau
    const allCircuits = state.myCircuits || [];
    const activeCircuitData = allCircuits.find(c => c.id === state.activeCircuitId);

    // Cas 1 : Circuit enregistré avec un tracé réel (GPX/Routeur)
    if (activeCircuitData && activeCircuitData.realTrack) {
        state.realTrackPolyline = L.polyline(activeCircuitData.realTrack, {
            className: 'real-track-polyline' // Style CSS spécifique
        }).addTo(map);
    }
    // Cas 2 : Circuit en cours de création (Ligne droite "Vol d'oiseau")
    else {
        const latLngs = state.currentCircuit.map(feature => {
            const [lon, lat] = feature.geometry.coordinates;
            return [lat, lon];
        });
        state.orthodromicPolyline = L.polyline(latLngs, {
            className: 'circuit-polyline' // Style CSS spécifique
        }).addTo(map);
    }
}

export function getRealDistance(circuitData) {
    if (!circuitData || !circuitData.realTrack) return 0;
    return calculateRealDistance(circuitData.realTrack);
}

export function getOrthodromicDistance(circuit) {
    if (!circuit || circuit.length < 2) return 0;
    let totalDistance = 0;
    for (let i = 0; i < circuit.length - 1; i++) {
        const from = circuit[i].geometry.coordinates;
        const to = circuit[i + 1].geometry.coordinates;
        // Attention : GeoJSON est [Lon, Lat], Leaflet calcule avec [Lat, Lon] interne
        totalDistance += L.latLng(from[1], from[0]).distanceTo(L.latLng(to[1], to[0]));
    }
    return totalDistance;
}

// --- LE PEINTRE DE POINTS (Reçoit les données déjà filtrées) ---
export function refreshMapMarkers(visibleFeatures) {
    if (!map) return;

    // 1. Initialisation ou Nettoyage de la couche
   // 1. Initialisation ou Nettoyage de la couche
    if (!state.geojsonLayer) {
        // CHANGEMENT ICI : featureGroup au lieu de layerGroup pour avoir accès à getBounds()
        state.geojsonLayer = L.featureGroup().addTo(map); 
    } else {
        state.geojsonLayer.clearLayers();
    }

    if (visibleFeatures.length === 0) return;

    // 2. Dessin des points
    const tempLayer = L.geoJSON(visibleFeatures, {
        pointToLayer: (feature, latlng) => {
            const category = feature.properties.Catégorie || 'default'; 
            const icon = createHistoryWalkIcon(category);

            // ---> LOGIQUE DES MARQUEURS ET STATUTS <---
            const props = feature.properties.userData || {};

            // 1. VIP (Incontournable) -> Étoile Dorée
            if (props.incontournable === true) {
                icon.options.className += ' marker-vip'; 
            }

            // 2. Visité -> Bordure Verte
            if (props.vu === true) {
                icon.options.className += ' marker-visited';
            }

            // 3. Planifié -> Bordure Orange
            if ((props.planifieCounter || 0) > 0) {
                icon.options.className += ' marker-planned';
            }
            // ----------------------------------------------

            const marker = L.marker(latlng, { icon: icon });
            
            // Le clic utilise notre aiguilleur propre !
            marker.on('click', (e) => {
                L.DomEvent.stop(e); 
                handleMarkerClick(feature); 
            });
            return marker;
        }
    });
    
    // 3. Ajout à la carte
    tempLayer.eachLayer(layer => state.geojsonLayer.addLayer(layer));

    // 4. Zoom automatique si on a filtré par zone
    if (state.activeFilters.zone && state.geojsonLayer.getLayers().length > 0) {
        const bounds = state.geojsonLayer.getBounds();
        if (bounds.isValid()) map.flyToBounds(bounds.pad(0.1));
    }

    // 5. La baguette magique pour dessiner les icônes dynamiques !
    if (window.lucide) lucide.createIcons();
}