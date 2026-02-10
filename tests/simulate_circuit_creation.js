
// Mocking necessary parts of the system
const state = {
    currentCircuit: [],
    loadedFeatures: [
        { geometry: { coordinates: [10.8, 33.8] }, properties: { HW_ID: 1, name: 'POI 1' } },
        { geometry: { coordinates: [10.81, 33.81] }, properties: { HW_ID: 2, name: 'POI 2' } },
        { geometry: { coordinates: [10.82, 33.82] }, properties: { HW_ID: 3, name: 'POI 3' } }
    ],
    myCircuits: [],
    currentMapId: 'djerba',
    activeCircuitId: null
};

// Mocking DOM elements and functions
const DOM = {
    circuitDescription: { value: '' },
    circuitTitleText: { textContent: 'Nouveau Circuit' }
};

const getPoiId = (f) => f.properties.HW_ID;
const getPoiName = (f) => f.properties.name;

// Simplified version of getOrthodromicDistance for testing
function getOrthodromicDistance(circuit) {
    if (!circuit || circuit.length < 2) return 0;
    let totalDistance = 0;
    // Mock distance calculation (1 degree ~ 111km)
    for (let i = 0; i < circuit.length - 1; i++) {
        const from = circuit[i].geometry.coordinates;
        const to = circuit[i + 1].geometry.coordinates;
        const d = Math.sqrt(Math.pow(to[0] - from[0], 2) + Math.pow(to[1] - from[1], 2));
        totalDistance += d * 111000;
    }
    return totalDistance;
}


// Simulation Logic
function simulateCircuitCreation() {
    console.log("--- Simulation: Creating 'As the Crow Flies' Circuit ---");

    // 1. User selects POI 1
    state.currentCircuit.push(state.loadedFeatures[0]);
    console.log(`Step 1: Added POI 1. Circuit length: ${state.currentCircuit.length}`);
    console.log(`Distance: ${(getOrthodromicDistance(state.currentCircuit) / 1000).toFixed(2)} km`);

    // 2. User selects POI 2
    state.currentCircuit.push(state.loadedFeatures[1]);
    console.log(`Step 2: Added POI 2. Circuit length: ${state.currentCircuit.length}`);
    console.log(`Distance: ${(getOrthodromicDistance(state.currentCircuit) / 1000).toFixed(2)} km`);

    // 3. User selects POI 3
    state.currentCircuit.push(state.loadedFeatures[2]);
    console.log(`Step 3: Added POI 3. Circuit length: ${state.currentCircuit.length}`);
    console.log(`Distance: ${(getOrthodromicDistance(state.currentCircuit) / 1000).toFixed(2)} km`);

    // Verification
    if (state.currentCircuit.length === 3) {
        console.log("SUCCESS: Circuit created with 3 points.");
    } else {
        console.error("FAILURE: Circuit length incorrect.");
    }

    if (getOrthodromicDistance(state.currentCircuit) > 0) {
        console.log("SUCCESS: Distance is greater than 0.");
    } else {
        console.error("FAILURE: Distance calculation failed.");
    }

    // Check "Draft" state (Conceptual check)
    console.log("State check: activeCircuitId is", state.activeCircuitId, "(Should be null for draft)");
    console.log("State check: realTrack is null (Default)");
}

simulateCircuitCreation();
