// state.js
export const APP_VERSION = '3.0.0-mobile'; // Version: Mobile Adaptation
export const MAX_CIRCUIT_POINTS = 15;

export const state = {
    isMobile: false, // Sera défini au démarrage
    currentMapId: null,
    userData: {},
    myCircuits: [],
    geojsonLayer: null,
    loadedFeatures: [],
    currentFeatureId: null,
    currentCircuitIndex: null,
    isSelectionModeActive: false,
    currentCircuit: [],
    // Liste des IDs masqués/supprimés localement
    hiddenPoiIds: [],
    activeCircuitId: null,
    circuitIdToImportFor: null,
    orthodromicPolyline: null,
    realTrackPolyline: null,
    activeFilters: {
        mosquees: false,
        vus: false,
        planifies: false,
        zone: null
    }
};