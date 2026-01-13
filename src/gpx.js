// gpx.js
import { state, APP_VERSION } from './state.js';
import { getPoiId, getPoiName, applyFilters } from './data.js';
import { generateCircuitName } from './circuit.js';
import { getAllPoiDataForMap, getAllCircuitsForMap, saveCircuit, batchSavePoiData, getAppState } from './database.js';
import { showToast } from './ui.js';
import { downloadFile } from './utils.js';

export function escapeXml(unsafe) {
    if (unsafe === null || unsafe === undefined) return '';
    return unsafe.toString().replace(/[<>&'"]/g, c => ({
        '<': '&lt;',
        '>': '&gt;',
        '&': '&amp;',
        "'": '&apos;',
        '"': '&quot;'
    }[c]));
}

function generateAndDownloadGPX(circuit, id, name, description) {
    const waypointsXML = circuit.map(feature =>
        `<wpt lat="${feature.geometry.coordinates[1]}" lon="${feature.geometry.coordinates[0]}"><name>${escapeXml(getPoiName(feature))}</name><desc>${escapeXml(feature.properties.userData?.Description_courte || feature.properties.Desc_wpt || '')}</desc></wpt>`
    ).join('');
    const trackpointsXML = circuit.map(feature =>
        `<trkpt lat="${feature.geometry.coordinates[1]}" lon="${feature.geometry.coordinates[0]}"></trkpt>`
    ).join('\n      ');
    const gpxContent = `<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="History Walk ${APP_VERSION}" xmlns="http://www.topografix.com/GPX/1/1"><metadata><name>${escapeXml(name)}</name><desc>Circuit généré par History Walk.</desc></metadata>${waypointsXML}<trk><name>${escapeXml(name)}</name><desc><![CDATA[${description ? `${description}\n` : ''}[HW-ID:${id}]]]></desc><trkseg>${trackpointsXML}</trkseg></trk></gpx>`;
    downloadFile(`${name}.gpx`, gpxContent, 'application/gpx+xml');
}

export async function recalculatePlannedCountersForMap(mapId) {
    if (!mapId) return;
    try {
        const poiDataForMap = await getAllPoiDataForMap(mapId);
        const circuitsForMap = await getAllCircuitsForMap(mapId);
        
        const counters = {};
        state.loadedFeatures.forEach(f => {
            counters[getPoiId(f)] = 0;
        });

        circuitsForMap.forEach(circuit => {
            [...new Set(circuit.poiIds)].forEach(poiId => {
                if (counters.hasOwnProperty(poiId)) {
                    counters[poiId]++;
                }
            });
        });

        const updatesToBatch = [];
        for (const [poiId, count] of Object.entries(counters)) {
            const currentCount = (poiDataForMap[poiId] && poiDataForMap[poiId].planifieCounter) || 0;
            if (currentCount !== count) {
                updatesToBatch.push({ poiId: poiId, data: { planifieCounter: count } });
            }
        }

        if (updatesToBatch.length > 0) {
            await batchSavePoiData(mapId, updatesToBatch);
        }
        
        state.userData = await getAllPoiDataForMap(mapId);
        state.loadedFeatures.forEach(feature => {
            const poiId = getPoiId(feature);
            if (state.userData[poiId]) {
                feature.properties.userData = { ...feature.properties.userData, ...state.userData[poiId] };
            }
        });
    } catch (error) {
        console.error("Erreur lors du recalcul des compteurs:", error);
    }
}

export async function saveAndExportCircuit() {
    if (state.currentCircuit.length === 0) return;
    
    const circuitName = generateCircuitName();
    
    const draft = await getAppState(`circuitDraft_${state.currentMapId}`);
    let description = (draft && draft.description) ? draft.description : '';
    const transportData = (draft && draft.transport) ? draft.transport : {};
    
    // --- MODIFICATION V2 : AJOUT SIGNATURE AUTOMATIQUE ---
    const signature = "\n\n(Créé par History Walk)";
    if (!description.includes("History Walk")) {
        description += signature;
    }
    // ----------------------------------------------------

    const poiIds = state.currentCircuit.map(getPoiId);
    
    let circuitToSave;

    if (state.activeCircuitId) {
        const index = state.myCircuits.findIndex(c => c.id === state.activeCircuitId);
        if (index > -1) {
            state.myCircuits[index].name = circuitName;
            state.myCircuits[index].description = description;
            state.myCircuits[index].poiIds = poiIds;
            state.myCircuits[index].transport = transportData;
            circuitToSave = state.myCircuits[index];
        }
    }
    
    if (!circuitToSave) {
        const newId = `HW-${Date.now()}`;
        circuitToSave = {
            id: newId,
            mapId: state.currentMapId,
            name: circuitName,
            description: description,
            poiIds: poiIds,
            realTrack: null,
            transport: transportData
        };
        state.myCircuits.push(circuitToSave);
        state.activeCircuitId = newId;
    }

    try {
        await saveCircuit(circuitToSave);
        await recalculatePlannedCountersForMap(state.currentMapId);
        applyFilters();
        generateAndDownloadGPX(state.currentCircuit, circuitToSave.id, circuitToSave.name, circuitToSave.description);
        showToast(`Circuit "${circuitToSave.name}" sauvegardé et exporté !`, 'success');
    } catch (error) {
        console.error("Erreur lors de la sauvegarde du circuit :", error);
        showToast("Erreur lors de la sauvegarde du circuit.", 'error');
    }
}