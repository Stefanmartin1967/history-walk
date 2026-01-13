// data.js
import { state } from './state.js';
import { map, createHistoryWalkIcon, handleMarkerClick } from './map.js'; 
import { populateZonesMenu, DOM, openDetailsPanel } from './ui.js';
import { loadCircuitDraft } from './circuit.js';
import { getAllPoiDataForMap, getAllCircuitsForMap, savePoiData, getAppState } from './database.js';
import { logModification } from './logger.js';

// --- FONCTIONS UTILITAIRES ---

export function getPoiId(feature) {
    if (!feature) return null;
    // 1. Cherche l'ID au niveau racine (format GeoJSON standard)
    if (feature.id) return String(feature.id);
    // 2. Cherche dans les propriétés (votre format HW_ID)
    if (feature.properties) {
        if (feature.properties.HW_ID) return String(feature.properties.HW_ID);
        if (feature.properties.id) return String(feature.properties.id);
        if (feature.properties.ID) return String(feature.properties.ID);
    }
    // 3. Si rien n'est trouvé
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

// --- FONCTION D'AFFICHAGE FILTRÉ (CORRIGÉE) ---

export function applyFilters() {
    if (!state.geojsonLayer) return;
    state.geojsonLayer.clearLayers();
    if (!state.loadedFeatures || state.loadedFeatures.length === 0) return;

    const visibleFeatures = state.loadedFeatures.filter(feature => {
        const props = { ...feature.properties, ...feature.properties.userData };

        // --- DEBUT MODIFICATION ANTI-REGRESSION (POUBELLE) ---
        const poiId = getPoiId(feature);
        
        // On vérifie si l'ID est dans la liste noire
        if (state.hiddenPoiIds && state.hiddenPoiIds.includes(poiId)) {
            return false; 
        }
        // --- FIN MODIFICATION ---

        if (props.incontournable) {
            return true;
        }

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

    if (visibleFeatures.length > 0) {
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
        newLayer.eachLayer(layer => state.geojsonLayer.addLayer(layer));
    }
    
    // Mise à jour des icônes Lucide si nécessaire
    if (window.lucide) lucide.createIcons();

    // Zoom automatique si une zone est sélectionnée
    if (state.activeFilters.zone && state.geojsonLayer.getLayers().length > 0) {
        const b = state.geojsonLayer.getBounds();
        if (b && b.isValid && b.isValid()) {
             map.flyToBounds(b.pad(0.1));
        }
    }
}

// --- CHARGEMENT INITIAL ---

export async function displayGeoJSON(data, mapId) {
    state.currentMapId = mapId;
    document.getElementById('app-title').textContent = `History Walk - ${mapId}`;

    try {
        // --- ÉTAPE 1 : RÉCUPÉRER LES POINTS MASQUÉS DANS LA DB ---
        // On va chercher la liste dans appState avant de traiter les points
        const savedHiddenPois = await getAppState(`hiddenPois_${mapId}`);
        state.hiddenPoiIds = savedHiddenPois || []; 
        // --------------------------------------------------------

        const originalCount = data.features.length;
        const validFeatures = data.features.filter(feature => {
            const id = getPoiId(feature);
            if (!id) {
                console.warn("Lieu ignoré (HW_ID manquant):", feature.properties['Nom du site FR'] || 'Sans nom');
            }
            return id;
        });

        // ... (le reste de votre code reste identique jusqu'à applyFilters) ...

        state.userData = await getAllPoiDataForMap(mapId);
        state.myCircuits = await getAllCircuitsForMap(mapId);

        validFeatures.forEach(feature => {
            const poiId = getPoiId(feature);
            feature.properties.userData = state.userData[poiId] || {};
        });

        state.loadedFeatures = validFeatures;

        if (state.geojsonLayer) state.geojsonLayer.remove();
        state.geojsonLayer = L.featureGroup().addTo(map);

        populateZonesMenu();

        // --- ÉTAPE 2 : LE FILTRE MAGIQUE ---
        // applyFilters() va maintenant utiliser la liste state.hiddenPoiIds 
        // que nous venons de charger plus haut.
        applyFilters(); 
        
        await loadCircuitDraft();

        if (!state.activeFilters.zone && state.loadedFeatures.length > 0) {
            const fullBounds = L.geoJSON(state.loadedFeatures).getBounds();
            if (fullBounds.isValid()) map.flyToBounds(fullBounds.pad(0.1));
        }
    } catch (error) {
        console.error("Erreur lors de l'affichage du GeoJSON:", error);
        alert("Impossible de charger les données pour cette carte.");
    }
}

// --- AJOUT DYNAMIQUE DE POI ---

export function addPoiFeature(feature) {
    if (!feature) return;

    // 1. Mise à jour de la mémoire
    state.loadedFeatures.push(feature);

    const poiId = getPoiId(feature);
    if (state.userData && !state.userData[poiId]) {
        state.userData[poiId] = {};
    }

    // 2. Mise à jour VISUELLE
    if (state.geojsonLayer) {
        const tempLayer = L.geoJSON(feature); 
        const newMarker = tempLayer.getLayers()[0]; 

        if (typeof state.geojsonLayer.addLayer === 'function') {
            state.geojsonLayer.addLayer(newMarker);
        } else if (typeof state.geojsonLayer.addData === 'function') {
            state.geojsonLayer.addData(feature);
        }
    }
}