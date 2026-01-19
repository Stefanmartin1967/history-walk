// state.js
export const APP_VERSION = '3.1.1-mobile'; // Petit bump de version
export const MAX_CIRCUIT_POINTS = 15;

export const POI_CATEGORIES = [
    "A définir", "Autre", "Café", "Commerce", "Culture et tradition",
    "Curiosité", "Hôtel", "Mosquée", "Parking", "Puits",
    "Restaurant", "Site historique", "Site religieux", "Taxi"
].sort();

export const state = {
    isMobile: false,
    currentMapId: null,
    userData: {},
    myCircuits: [],
    geojsonLayer: null,
    loadedFeatures: [],
    currentFeatureId: null,
    currentCircuitIndex: null,
    isSelectionModeActive: false,
    currentCircuit: [],
    customFeatures: [],
    hiddenPoiIds: [],
    activeCircuitId: null,
    circuitIdToImportFor: null,
    orthodromicPolyline: null,
    realTrackPolyline: null,
    filterCompleted: false, // <--- NOUVEAU : État du filtre mobile
    activeFilters: {
        mosquees: false,
        vus: false,
        planifies: false,
        zone: null
    }
};