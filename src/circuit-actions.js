// circuit-actions.js
import { state } from './state.js';
import { deleteCircuitById } from './database.js';
import { clearCircuit, setCircuitVisitedState } from './circuit.js';
import { recalculatePlannedCountersForMap } from './gpx.js';
import { applyFilters } from './data.js';
import { isMobileView } from './mobile.js';

/**
 * Logique métier pour supprimer un circuit
 * Gère la base de données, l'état mémoire et les calculs GPX
 */
export async function performCircuitDeletion(id) {
    try {
        // 1. Suppression physique dans la base de données
        await deleteCircuitById(id);
        
        // 2. Mise à jour de la mémoire (state)
        state.myCircuits = state.myCircuits.filter(c => c.id !== id);
        
        // 3. Si c'était le circuit actif, on nettoie l'affichage
        if (state.activeCircuitId === id) {
            await clearCircuit(false);
        }
        
        // 4. Recalcul technique des compteurs
        await recalculatePlannedCountersForMap(state.currentMapId);
        
        // 5. Mise à jour des filtres si on est sur ordinateur
        if (!isMobileView()) {
            applyFilters();
        }
        
        return { success: true };
    } catch (error) {
        console.error("Erreur technique lors de la suppression:", error);
        return { success: false, error };
    }
}

export async function toggleCircuitVisitedStatus(circuitId, isChecked) {
    try {
        await setCircuitVisitedState(circuitId, isChecked);
        return { success: true };
    } catch (error) {
        console.error("Erreur lors du changement de statut visité:", error);
        return { success: false };
    }
}

import { getPoiId } from './data.js'; // Assurez-vous d'ajouter getPoiId aux imports en haut

/**
 * Prépare les données des zones : filtre les POI et compte les occurrences par zone
 */
export function getZonesData() {
    if (!state.loadedFeatures || state.loadedFeatures.length === 0) return null;

    // 1. Filtrage (La logique "Métier")
    const preFilteredFeatures = state.loadedFeatures.filter(feature => {
        const poiId = getPoiId(feature);

        // Filtre Liste Noire
        if (state.hiddenPoiIds && state.hiddenPoiIds.includes(poiId)) return false;

        const props = { ...feature.properties, ...feature.properties.userData };
        
        // Filtres d'état (Restaurants, Vus, Planifiés)
        if (state.activeFilters.restaurants && props.Catégorie !== 'Restaurant') return false;
        if (state.activeFilters.vus && props.vu && !props.incontournable) return false;
        
        const isPlanned = (props.planifieCounter || 0) > 0;
        if (state.activeFilters.planifies && isPlanned && !props.incontournable) return false;
        
        return true;
    });

    // 2. Comptage par zone
    const zoneCounts = preFilteredFeatures.reduce((acc, feature) => {
        const zone = feature.properties.Zone;
        if (zone) acc[zone] = (acc[zone] || 0) + 1;
        return acc;
    }, {});

    return {
        totalVisible: preFilteredFeatures.length,
        zoneCounts: zoneCounts,
        sortedZones: Object.keys(zoneCounts).sort()
    };
}