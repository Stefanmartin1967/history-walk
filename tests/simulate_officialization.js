
// Mocking necessary parts of the system
const state = {
    currentCircuit: [
        { geometry: { coordinates: [10.8, 33.8] }, properties: { HW_ID: 1, name: 'POI 1' } },
        { geometry: { coordinates: [10.81, 33.81] }, properties: { HW_ID: 2, name: 'POI 2' } }
    ],
    myCircuits: [],
    currentMapId: 'djerba',
    activeCircuitId: null // Represents a "Draft"
};

const getPoiId = (f) => f.properties.HW_ID;

// Mock gpx download
function downloadFile(filename, content) {
    console.log(`[DOWNLOAD] Filename: ${filename}`);
    console.log(`[CONTENT PREVIEW] ${content.substring(0, 300)}...`);
    // Verify Metadata
    if (content.includes("<link href=\"https://stefanmartin1967.github.io/history-walk/\">")) {
        console.log("SUCCESS: Metadata link detected.");
    }
    const idMatch = content.match(/\[HW-ID:(HW-\d+)\]/);
    if (idMatch) {
         console.log(`SUCCESS: HW-ID embedded: ${idMatch[1]}`);
         return idMatch[1];
    } else {
         console.error("FAILURE: HW-ID missing from metadata.");
         return null;
    }
}

// Simplified saveAndExportCircuit logic
async function simulateOfficialization() {
    console.log("--- Simulation: Officialization (Export) ---");

    // 1. Generate ID (Officialization Step 1)
    const newId = `HW-${Date.now()}`;
    const circuitName = "My New Official Circuit";
    const description = "A beautiful walk.";

    // 2. Save to "My Circuits" (Step 2)
    const newCircuit = {
        id: newId,
        mapId: state.currentMapId,
        name: circuitName,
        poiIds: state.currentCircuit.map(getPoiId),
        realTrack: null
    };
    state.myCircuits.push(newCircuit);
    state.activeCircuitId = newId;

    console.log(`Step 1: Circuit saved locally as '${circuitName}' with ID ${newId}.`);

    // 3. Generate GPX (Step 3)
    const metadataXML = `
    <metadata>
        <name>${circuitName}</name>
        <desc>Circuit généré par History Walk.</desc>
        <link href="https://stefanmartin1967.github.io/history-walk/">
            <text>History Walk [HW-ID:${newId}]</text>
        </link>
    </metadata>`;

    const gpxContent = `<?xml version="1.0" encoding="UTF-8"?><gpx ...>${metadataXML}<trk>...</trk></gpx>`;

    // 4. Download (Step 4)
    console.log("Step 2: Triggering GPX Download...");
    const exportedId = downloadFile(`${circuitName}.gpx`, gpxContent);

    // Verification
    if (exportedId === newId) {
        console.log("SUCCESS: Exported GPX contains the correct Circuit ID.");
        console.log("   > This file can now be uploaded to 'public/circuits/' to become truly Official.");
    } else {
        console.error("FAILURE: ID Mismatch on export.");
    }
}

simulateOfficialization();
