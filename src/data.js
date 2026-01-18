// data.js
// --- 1. IMPORTS CORRIGÉS (Union de votre liste et des besoins du fix) ---
import { state } from './state.js';
import { map, createHistoryWalkIcon, handleMarkerClick } from './map.js';
import { populateZonesMenu, DOM, openDetailsPanel, showToast } from './ui.js'; // showToast ajouté car souvent utilisé
import { loadCircuitDraft } from './circuit.js';
import { 
    getAllPoiDataForMap, 
    getAllCircuitsForMap, 
    savePoiData, 
    getAppState, 
    saveAppState // <--- INDISPENSABLE pour la sauvegarde des "Post-its"
} from './database.js';
import { logModification } from './logger.js';
import { isMobileView, renderMobilePoiList } from './mobile.js'; // renderMobilePoiList nécessaire pour l'affichage

// Variable locale pour gérer le nettoyage des marqueurs
let currentMarkers = [];
// --- UTILITAIRES ---

export function getPoiId(feature) {
    if (!feature || !feature.properties) return null;
    return feature.properties.HW_ID || feature.id; 
}

export function getPoiName(feature) {
    if (!feature || !feature.properties) return "Lieu sans nom";
    const props = feature.properties;
    const userData = props.userData || {};
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
    
    // 1. Récupération des données annexes (Suppressions & UserData)
    state.hiddenPoiIds = (await getAppState(`hiddenPois_${mapId}`)) || [];
    const storedUserData = await getAppState('userData') || {}; 

    // 2. LE CORRECTIF : Récupération des "Post-its" (Lieux ajoutés manuellement)
    const storedCustomFeatures = (await getAppState(`customPois_${mapId}`)) || [];
    state.customFeatures = storedCustomFeatures || [];

    // 3. FUSION : Carte Officielle + Lieux Ajoutés
    // On crée une liste unique qui contient tout
    let allFeatures = [...geoJSON.features];
    
    if (state.customFeatures.length > 0) {
        console.log(`Ajout de ${state.customFeatures.length} lieux personnalisés à la carte.`);
        allFeatures = [...allFeatures, ...state.customFeatures];
    }

    // 4. Préparation des données (Injection userData)
    state.loadedFeatures = allFeatures.map((feature, index) => {
        // On s'assure que chaque feature a un ID stable
        if (!feature.properties.HW_ID) {
            feature.properties.HW_ID = feature.id || `gen_${index}`; 
        }
        
        const pId = getPoiId(feature);
        
        // On injecte les données utilisateur (Notes, Visité, etc.)
        state.userData[pId] = state.userData[pId] || storedUserData[pId] || {};
        feature.properties.userData = state.userData[pId];

        return feature;
    });

    // 5. Affichage
    applyFilters();
    populateZonesMenu();
}

// --- FILTRES & AFFICHAGE ---

// IMPORTANT : Gardez votre fonction applyFilters existante ici.
// Je ne la réécris pas pour ne pas casser votre gestion des clusters ou des layers.
// Assurez-vous simplement qu'elle utilise 'createHistoryWalkIcon' et 'handleMarkerClick'.

export function applyFilters() {
    // 1. Initialisation sécurisée du layer (CORRECTIF MAJEUR)
    if (!state.geojsonLayer) {
        // On crée le groupe de calques et ON L'AJOUTE À LA CARTE
        state.geojsonLayer = L.layerGroup().addTo(map);
    } else {
        // S'il existe déjà, on le vide pour éviter les doublons
        state.geojsonLayer.clearLayers();
    }

    if (!state.loadedFeatures || state.loadedFeatures.length === 0) return;

    // 2. Filtrage (Votre logique d'origine, inchangée)
    const visibleFeatures = state.loadedFeatures.filter(feature => {
        const props = { ...feature.properties, ...feature.properties.userData };
        const poiId = getPoiId(feature);
        
        if (state.hiddenPoiIds && state.hiddenPoiIds.includes(poiId)) return false; 
        if (props.incontournable) return true;

        if (state.isSelectionModeActive && state.currentCircuit && state.currentCircuit.some(poi => getPoiId(poi) === getPoiId(feature))) {
            return true;
        }

        if (state.activeFilters.zone && props.Zone !== state.activeFilters.zone) return false;
        if (state.activeFilters.mosquees && props.Catégorie !== 'Mosquée') return false;
        if (state.activeFilters.vus && props.vu) return false;

        const isPlanned = (props.planifieCounter || 0) > 0;
        if (state.activeFilters.planifies && isPlanned) return false;
        
        return true;
    });

    // 3. Création et Ajout des marqueurs (CORRIGÉ)
    if (map && visibleFeatures.length > 0) {
        // On crée un calque temporaire pour générer les marqueurs
        const tempLayer = L.geoJSON(visibleFeatures, {
            pointToLayer: (feature, latlng) => {
                // Sécurité pour la catégorie
                const category = feature.properties.Catégorie || 'default'; 
                const marker = L.marker(latlng, { icon: createHistoryWalkIcon(category) });
                
                const featureId = state.loadedFeatures.indexOf(feature);
                
                marker.on('click', (e) => {
                    L.DomEvent.stop(e); 
                    if (state.isSelectionModeActive) {
                        handleMarkerClick(feature);
                    } else {
                        const circuitIndex = state.currentCircuit ? state.currentCircuit.findIndex(f => getPoiId(f) === getPoiId(feature)) : -1;
                        openDetailsPanel(featureId, circuitIndex !== -1 ? circuitIndex : null);
                    }
                });
                return marker;
            }
        });
        
        // On transfère les marqueurs du calque temporaire vers le calque principal de la carte
        tempLayer.eachLayer(layer => {
            state.geojsonLayer.addLayer(layer);
        });
    }
    
    // 4. Gestion des icônes Lucide et du Zoom
    if (window.lucide) lucide.createIcons();

    if (map && state.activeFilters.zone && state.geojsonLayer && state.geojsonLayer.getLayers().length > 0) {
        const b = state.geojsonLayer.getBounds();
        if (b && b.isValid && b.isValid()) {
             map.flyToBounds(b.pad(0.1));
        }
    }
}

// --- MODIFICATION DES DONNÉES ---

export async function updatePoiData(poiId, key, value) {
    if (!state.userData[poiId]) state.userData[poiId] = {};
    state.userData[poiId][key] = value;

    // Mise à jour visuelle immédiate
    const feature = state.loadedFeatures.find(f => getPoiId(f) === poiId);
    if (feature) {
        feature.properties.userData = state.userData[poiId];
    }

    // Sauvegarde en DB
    await savePoiData(state.currentMapId, poiId, state.userData[poiId]);
}

// --- AJOUT D'UN LIEU (La correction "Post-it") ---

export async function addPoiFeature(feature) {
    // 1. Ajout à la liste en mémoire vive (pour affichage immédiat)
    state.loadedFeatures.push(feature);
    
    // Sécurité : on s'assure que le tableau existe
    if (!state.customFeatures) state.customFeatures = [];
    state.customFeatures.push(feature);

    // 2. Sauvegarde UNIQUEMENT de la liste des ajouts ("Les Post-its")
    // C'est ici que la correction opère : on n'écrase plus la grosse carte.
    await saveAppState(`customPois_${state.currentMapId}`, state.customFeatures);

    // 3. Rafraîchissement
    applyFilters(); 
}
