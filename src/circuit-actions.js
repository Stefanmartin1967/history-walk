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