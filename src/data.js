// data.js
// --- 1. IMPORTS ---
import { state } from './state.js';
import { map, createHistoryWalkIcon, handleMarkerClick } from './map.js';
import { populateZonesMenu, DOM, openDetailsPanel, showToast } from './ui.js';
import { loadCircuitDraft } from './circuit.js';
import { 
    getAllPoiDataForMap, 
    getAllCircuitsForMap, 
    savePoiData, 
    getAppState, 
    saveAppState 
} from './database.js';
import { logModification } from './logger.js';
import { isMobileView, renderMobilePoiList } from './mobile.js';

// --- UTILITAIRES ---

export function getPoiId(feature) {
    if (!feature || !feature.properties) return null;
    // Priorité à l'ID HW stable, sinon l'ID GeoJSON
    return feature.properties.HW_ID || feature.id; 
}

export function getPoiName(feature) {
    if (!feature || !feature.properties) return "Lieu sans nom";
    const props = feature.properties;
    const userData = props.userData || {};
    // Ordre de priorité pour le nom
    return userData.custom_title || props['Nom du site FR'] || props['Nom du site AR'] || props.name || "Lieu inconnu";
}

export function getDomainFromUrl(url) {
    if (!url) return '';
    try {
        const hostname = new URL(url).hostname;
        return hostname.replace(/^www\./, '');
    } catch (e) {
        return url;
    }
}

// --- CŒUR DU SYSTÈME : Chargement de la Carte ---

export async function displayGeoJSON(geoJSON, mapId) {
    state.currentMapId = mapId;
    
    // 1. Récupération des données sauvegardées (Cachés, Notes, Ajouts manuels)
    state.hiddenPoiIds = (await getAppState(`hiddenPois_${mapId}`)) || [];
    const storedUserData = await getAppState('userData') || {}; 
    const storedCustomFeatures = (await getAppState(`customPois_${mapId}`)) || [];
    
    state.customFeatures = storedCustomFeatures || [];

    // 2. FUSION : Carte Officielle + Lieux Ajoutés (Post-its)
    // On part des données officielles
    let allFeatures = [...geoJSON.features];
    
    // On ajoute les lieux personnalisés s'il y en a
    if (state.customFeatures.length > 0) {
        console.log(`[Data] Ajout de ${state.customFeatures.length} lieux personnalisés.`);
        allFeatures = [...allFeatures, ...state.customFeatures];
    }

    // 3. Préparation des données (Injection des notes/statuts utilisateur)
    state.loadedFeatures = allFeatures.map((feature, index) => {
        // Sécurité : On s'assure que chaque feature a un ID stable
        if (!feature.properties.HW_ID) {
            feature.properties.HW_ID = feature.id || `gen_${index}_${Date.now()}`; 
        }
        
        const pId = getPoiId(feature);
        
        // On injecte les données utilisateur (Notes, Visité, etc.)
        state.userData[pId] = state.userData[pId] || storedUserData[pId] || {};
        feature.properties.userData = state.userData[pId];

        return feature;
    });

    // 4. Lancement de l'affichage
    applyFilters();
    populateZonesMenu();
}

// --- FILTRES & AFFICHAGE ---

export function applyFilters() {
    // 1. Initialisation sécurisée du layer
    if (!state.geojsonLayer) {
        state.geojsonLayer = L.layerGroup().addTo(map);
    } else {
        state.geojsonLayer.clearLayers();
    }

    if (!state.loadedFeatures || state.loadedFeatures.length === 0) return;

    // 2. Filtrage logique
    const visibleFeatures = state.loadedFeatures.filter(feature => {
        const props = { ...feature.properties, ...feature.properties.userData };
        const poiId = getPoiId(feature);
        
        // A. Lieux cachés manuellement par l'utilisateur
        if (state.hiddenPoiIds && state.hiddenPoiIds.includes(poiId)) return false; 
        
        // B. Les incontournables passent toujours (Sauf si cachés ci-dessus)
        if (props.incontournable) return true;

        // C. Mode Sélection de circuit
        if (state.isSelectionModeActive && state.currentCircuit) {
            return state.currentCircuit.some(poi => getPoiId(poi) === getPoiId(feature));
        }

        // D. Filtres standards
        if (state.activeFilters.zone && props.Zone !== state.activeFilters.zone) return false;
        if (state.activeFilters.mosquees && props.Catégorie !== 'Mosquée') return false;
        if (state.activeFilters.vus && props.vu) return false;

        const isPlanned = (props.planifieCounter || 0) > 0;
        if (state.activeFilters.planifies && isPlanned) return false;
        
        return true;
    });

    // 3. Création et Ajout des marqueurs sur la carte
    if (map && visibleFeatures.length > 0) {
        
        // Utilisation de L.geoJSON pour parser correctement les coordonnées
        const tempLayer = L.geoJSON(visibleFeatures, {
            pointToLayer: (feature, latlng) => {
                const category = feature.properties.Catégorie || 'default'; 
                const icon = createHistoryWalkIcon(category);
                
                const marker = L.marker(latlng, { icon: icon });
                
                // Gestion du Clic optimisée
                marker.on('click', (e) => {
                    L.DomEvent.stop(e); 
                    
                    if (state.isSelectionModeActive) {
                        handleMarkerClick(feature);
                    } else {
                        // On retrouve l'index dans la liste globale pour l'UI
                        const globalIndex = state.loadedFeatures.indexOf(feature);
                        
                        // Calcul si le point fait partie du circuit en cours
                        let circuitIndex = -1;
                        if (state.currentCircuit) {
                            const currentId = getPoiId(feature);
                            circuitIndex = state.currentCircuit.findIndex(f => getPoiId(f) === currentId);
                        }
                        
                        // Ouverture du panneau
                        openDetailsPanel(globalIndex, circuitIndex !== -1 ? circuitIndex : null);
                    }
                });
                return marker;
            }
        });
        
        // Ajout final au groupe de calques
        tempLayer.eachLayer(layer => {
            state.geojsonLayer.addLayer(layer);
        });
    }
    
    // 4. Gestion finale (Icônes et Zoom)
    if (window.lucide) lucide.createIcons();

    // Zoom automatique si on filtre par Zone
    if (map && state.activeFilters.zone && state.geojsonLayer.getLayers().length > 0) {
        const b = state.geojsonLayer.getBounds();
        if (b.isValid()) {
             map.flyToBounds(b.pad(0.1));
        }
    }
}

// --- MODIFICATION DES DONNÉES ---

export async function updatePoiData(poiId, key, value) {
    // Initialisation si vide
    if (!state.userData[poiId]) state.userData[poiId] = {};
    
    // Mise à jour locale
    state.userData[poiId][key] = value;

    // Mise à jour visuelle immédiate (sans recharger toute la carte)
    const feature = state.loadedFeatures.find(f => getPoiId(f) === poiId);
    if (feature) {
        feature.properties.userData = state.userData[poiId];
    }

    // Sauvegarde en Base de Données
    await savePoiData(state.currentMapId, poiId, state.userData[poiId]);
}

// --- AJOUT D'UN LIEU (Fonction Post-it) ---

export async function addPoiFeature(feature) {
    console.log("[Data] Ajout d'un nouveau lieu (Post-it)...");

    // 1. Ajout à la liste en mémoire vive (pour affichage immédiat)
    state.loadedFeatures.push(feature);
    
    if (!state.customFeatures) state.customFeatures = [];
    state.customFeatures.push(feature);

    // 2. Sauvegarde SÉPARÉE des ajouts (ne touche pas au GeoJSON officiel)
    await saveAppState(`customPois_${state.currentMapId}`, state.customFeatures);

    // 3. Rafraîchissement de la carte pour afficher le nouveau point
    applyFilters();
    
    // Notification utilisateur
    showToast("Lieu ajouté avec succès", "success");
}