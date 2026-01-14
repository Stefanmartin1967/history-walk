// data.js
import { state } from './state.js';
import { map, createHistoryWalkIcon, handleMarkerClick } from './map.js'; 
import { populateZonesMenu, DOM, openDetailsPanel } from './ui.js';
import { loadCircuitDraft } from './circuit.js';
import { getAllPoiDataForMap, getAllCircuitsForMap, savePoiData, getAppState } from './database.js';
import { logModification } from './logger.js';
import { isMobileView } from './mobile.js'; 

// --- FONCTIONS UTILITAIRES ---

export function getPoiId(feature) {
    if (!feature) return null;
    if (feature.id) return String(feature.id);
    if (feature.properties) {
        if (feature.properties.HW_ID) return String(feature.properties.HW_ID);
        if (feature.properties.id) return String(feature.properties.id);
        if (feature.properties.ID) return String(feature.properties.ID);
    }
    return null;
}

export function getPoiName(feature) {
    if (!feature || !feature.properties) return 'Sans nom';
    return feature.properties.userData?.custom_title || feature.properties['Nom du site FR'] || 'Sans nom';
}

export async function updatePoiData(poiId, field, value) {
    if (!poiId || !state.currentMapId) return;

    const feature = state.loadedFeatures.find(f => getPoiId(f) === poiId);
    if (!feature) return;

    if (!state.userData[poiId]) state.userData[poiId] = {};
    if (!feature.properties.userData) feature.properties.userData = {};

    const oldValue = state.userData[poiId][field];
    if (oldValue === value) return;

    state.userData[poiId][field] = value;
    feature.properties.userData[field] = value;
    
    try {
        await savePoiData(state.currentMapId, poiId, { [field]: value });
        await logModification(poiId, 'Modification', field, oldValue, value);
    } catch (error) {
        console.error(`Erreur de sauvegarde pour le POI ${poiId}:`, error);
        alert("Une erreur est survenue lors de la sauvegarde des données.");
    }
}

export function getDomainFromUrl(url) {
    if (!url || typeof url !== 'string') return null;
    try {
        const fullUrl = url.startsWith('http') ? url : `https://${url}`;
        const domain = new URL(fullUrl).hostname;
        return domain.replace(/^www\./, '');
    } catch (_) {
        return null;
    }
}

// --- FONCTION D'AFFICHAGE FILTRÉ ---

export function applyFilters() {
    if (state.geojsonLayer) state.geojsonLayer.clearLayers();
    if (!state.loadedFeatures || state.loadedFeatures.length === 0) return;

    const visibleFeatures = state.loadedFeatures.filter(feature => {
        const props = { ...feature.properties, ...feature.properties.userData };
        const poiId = getPoiId(feature);
        
        if (state.hiddenPoiIds && state.hiddenPoiIds.includes(poiId)) return false; 

        if (props.incontournable) return true;

        if (state.isSelectionModeActive && state.currentCircuit.some(poi => getPoiId(poi) === getPoiId(feature))) {
            return true;
        }

        if (state.activeFilters.zone && props.Zone !== state.activeFilters.zone) return false;
        if (state.activeFilters.mosquees && props.Catégorie !== 'Mosquée') return false;
        if (state.activeFilters.vus && props.vu) return false;

        const isPlanned = (props.planifieCounter || 0) > 0;
        if (state.activeFilters.planifies && isPlanned) return false;
        
        return true;
    });

    if (map && visibleFeatures.length > 0) {
        const newLayer = L.geoJSON(visibleFeatures, {
            pointToLayer: (feature, latlng) => {
                const marker = L.marker(latlng, { icon: createHistoryWalkIcon(feature.properties.Catégorie) });
                const featureId = state.loadedFeatures.indexOf(feature);
                
                marker.on('click', (e) => {
                    L.DomEvent.stop(e); 
                    if (state.isSelectionModeActive) {
                        handleMarkerClick(feature);
                    } else {
                        const circuitIndex = state.currentCircuit.findIndex(f => getPoiId(f) === getPoiId(feature));
                        openDetailsPanel(featureId, circuitIndex !== -1 ? circuitIndex : null);
                    }
                });
                return marker;
            }
        });
        
        if (state.geojsonLayer) {
            newLayer.eachLayer(layer => state.geojsonLayer.addLayer(layer));
        }
    }
    
    if (window.lucide) lucide.createIcons();

    if (map && state.activeFilters.zone && state.geojsonLayer && state.geojsonLayer.getLayers().length > 0) {
        const b = state.geojsonLayer.getBounds();
        if (b && b.isValid && b.isValid()) {
             map.flyToBounds(b.pad(0.1));
        }
    }
}

// --- CHARGEMENT INITIAL ---

export async function displayGeoJSON(data, mapId) {
    state.currentMapId = mapId;
    const titleEl = document.getElementById('app-title');
    if(titleEl) titleEl.textContent = `History Walk - ${mapId}`;

    try {
        const savedHiddenPois = await getAppState(`hiddenPois_${mapId}`);
        state.hiddenPoiIds = savedHiddenPois || []; 

        const validFeatures = data.features.filter(feature => getPoiId(feature));

        state.userData = await getAllPoiDataForMap(mapId);
        state.myCircuits = await getAllCircuitsForMap(mapId);

        validFeatures.forEach(feature => {
            const poiId = getPoiId(feature);
            feature.properties.userData = state.userData[poiId] || {};
        });

        state.loadedFeatures = validFeatures;

        if (map) {
            if (state.geojsonLayer) state.geojsonLayer.remove();
            state.geojsonLayer = L.featureGroup().addTo(map);
        }

        populateZonesMenu();
        applyFilters(); 
        
        await loadCircuitDraft();

        // --- CORRECTION CENTRAGE CARTE ---
        // On ne zoome que sur les lieux qui NE SONT PAS dans la corbeille
        if (map && !state.activeFilters.zone && state.loadedFeatures.length > 0) {
            const activeFeatures = state.loadedFeatures.filter(f => !state.hiddenPoiIds.includes(getPoiId(f)));
            
            if (activeFeatures.length > 0) {
                const fullBounds = L.geoJSON(activeFeatures).getBounds();
                if (fullBounds.isValid()) map.flyToBounds(fullBounds.pad(0.1));
            }
        }
    } catch (error) {
        console.error("Erreur lors de l'affichage du GeoJSON:", error);
        alert("Impossible de charger les données pour cette carte.");
    }
}

export function addPoiFeature(feature) {
    if (!feature) return;
    state.loadedFeatures.push(feature);
    const poiId = getPoiId(feature);
    if (state.userData && !state.userData[poiId]) {
        state.userData[poiId] = {};
    }
    if (map && state.geojsonLayer) {
        const tempLayer = L.geoJSON(feature); 
        const newMarker = tempLayer.getLayers()[0]; 
        if (typeof state.geojsonLayer.addLayer === 'function') {
            state.geojsonLayer.addLayer(newMarker);
        } else if (typeof state.geojsonLayer.addData === 'function') {
            state.geojsonLayer.addData(feature);
        }
    }
}