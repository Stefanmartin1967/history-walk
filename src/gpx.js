// gpx.js
import { state, APP_VERSION } from './state.js';
import { getPoiId, getPoiName, applyFilters } from './data.js';
import { generateCircuitName } from './circuit.js';
import { getAllPoiDataForMap, getAllCircuitsForMap, saveCircuit, batchSavePoiData, getAppState } from './database.js';
import { showToast } from './toast.js';
import { downloadFile } from './utils.js';
import { updatePolylines } from './map.js';

export function escapeXml(unsafe) {
    if (unsafe === null || unsafe === undefined) return '';
    // String(unsafe) garantit que .replace existe toujours
    return String(unsafe).replace(/[<>&'"]/g, c => ({
        '<': '&lt;',
        '>': '&gt;',
        '&': '&amp;',
        "'": '&apos;',
        '"': '&quot;'
    }[c]));
}
function generateAndDownloadGPX(circuit, id, name, description) {
    const waypointsXML = circuit.map(feature => {
        const poiName = escapeXml(getPoiName(feature));
        // Description de l'étiquette (Wikiloc)
        const desc = escapeXml(feature.properties.userData?.Description_courte || feature.properties.Desc_wpt || '');

        // Lien externe (Wikiloc)
        // On cherche 'Source' ou 'Lien'
        const sourceUrl = feature.properties.userData?.Source || feature.properties.Source || '';
        let linkXML = '';
        if (sourceUrl && sourceUrl.trim().startsWith('http')) {
             linkXML = `
      <link href="${escapeXml(sourceUrl.trim())}">
        <text>Lien vers le site</text>
      </link>`;
        }

        return `
    <wpt lat="${feature.geometry.coordinates[1]}" lon="${feature.geometry.coordinates[0]}">
      <name>${poiName}</name>
      <desc>${desc}</desc>${linkXML}
    </wpt>`;
    }).join('');

    const trackpointsXML = circuit.map(feature =>
        `<trkpt lat="${feature.geometry.coordinates[1]}" lon="${feature.geometry.coordinates[0]}"></trkpt>`
    ).join('\n      ');

    // MÉTADONNÉES ÉTENDUES (Destination + Lien)
    const mapName = state.currentMapId ? (state.currentMapId.charAt(0).toUpperCase() + state.currentMapId.slice(1)) : 'Inconnue';

    // On met le HW-ID dans les keywords pour qu'il soit discret mais présent
    const metadataXML = `
    <metadata>
        <name>${escapeXml(name)}</name>
        <desc>Circuit généré par History Walk.</desc>
        <link href="https://stefanmartin1967.github.io/history-walk/">
            <text>History Walk</text>
        </link>
        <keywords>${escapeXml(mapName)}, [HW-ID:${id}]</keywords>
    </metadata>`;

    const gpxContent = `<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="History Walk ${APP_VERSION}" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">${metadataXML}${waypointsXML}<trk><name>${escapeXml(name)}</name><desc><![CDATA[${description}]]></desc><trkseg>${trackpointsXML}</trkseg></trk></gpx>`;

    downloadFile(`${name}.gpx`, gpxContent, 'application/gpx+xml');
}

export async function recalculatePlannedCountersForMap(mapId) {
    if (!mapId) return;
    try {
        const poiDataForMap = await getAllPoiDataForMap(mapId);
        const circuitsForMap = await getAllCircuitsForMap(mapId);
        
        const counters = {};
        
        // Etape 1 : On initialise tout à 0 (même les supprimés s'ils sont chargés)
        state.loadedFeatures.forEach(f => {
            counters[getPoiId(f)] = 0;
        });

        circuitsForMap.forEach(circuit => {
            [...new Set(circuit.poiIds)].forEach(poiId => {
                // Etape 2 : On vérifie l'existence et l'état du POI
                if (counters.hasOwnProperty(poiId)) {
                    const feature = state.loadedFeatures.find(f => getPoiId(f) === poiId);
                    // CORRECTION : On ne compte QUE si le POI n'est pas marqué supprimé
                    const isDeleted = feature && feature.properties.userData && feature.properties.userData.deleted;
                    
                    if (!isDeleted) {
                        counters[poiId]++;
                    }
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
        
        // ... Mise à jour de l'état local ...
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
        state.hasUnexportedChanges = true; // FLAG CHANGEMENT
        await recalculatePlannedCountersForMap(state.currentMapId);
        applyFilters();
        generateAndDownloadGPX(state.currentCircuit, circuitToSave.id, circuitToSave.name, circuitToSave.description);
        showToast(`Circuit "${circuitToSave.name}" sauvegardé et exporté !`, 'success');
    } catch (error) {
        console.error("Erreur lors de la sauvegarde du circuit :", error);
        showToast("Erreur lors de la sauvegarde du circuit.", 'error');
    }
}

export async function processImportedGpx(file, circuitId) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = async (e) => {
            try {
                const text = e.target.result;
                const parser = new DOMParser();
                const xmlDoc = parser.parseFromString(text, "text/xml");
                
                // 1. EXTRACTION HW-ID (SÉCURITÉ)
                // Recherche dans <desc> (Legacy)
                const descNodes = xmlDoc.getElementsByTagName("desc");
                let foundHwId = null;
                for (let i = 0; i < descNodes.length; i++) {
                    const match = descNodes[i].textContent.match(/\[HW-ID:(.*?)\]/);
                    if (match) {
                        foundHwId = match[1];
                        break;
                    }
                }

                // Recherche dans <keywords> (Nouveau format)
                if (!foundHwId) {
                    const keywordNodes = xmlDoc.getElementsByTagName("keywords");
                    for (let i = 0; i < keywordNodes.length; i++) {
                        const match = keywordNodes[i].textContent.match(/\[HW-ID:(.*?)\]/);
                        if (match) {
                            foundHwId = match[1];
                            break;
                        }
                    }
                }

                // 2. EXTRACTION TRACE
                const trkpts = xmlDoc.getElementsByTagName("trkpt");
                const coordinates = [];
                for (let i = 0; i < trkpts.length; i++) {
                    const lat = parseFloat(trkpts[i].getAttribute("lat"));
                    const lon = parseFloat(trkpts[i].getAttribute("lon"));
                    coordinates.push([lat, lon]);
                }

                if (coordinates.length === 0) {
                    throw new Error("Aucun point trouvé dans le fichier GPX.");
                }

                // 3. LOGIQUE DE VÉRIFICATION
                let canImport = false;
                const { showConfirm, showAlert } = await import('./modal.js');

                if (foundHwId) {
                    // CAS A : Un ID est présent dans le fichier
                    if (foundHwId === circuitId) {
                        canImport = true;
                    } else {
                        await showAlert(
                            "Erreur d'identification",
                            `L'ID du fichier (${foundHwId}) ne correspond pas au circuit actuel.\n\nImport annulé pour protéger vos données.`
                        );
                        reject(new Error("ID Mismatch"));
                        return;
                    }
                } else {
                    // CAS B : Pas d'ID -> Analyse heuristique des étapes (Waypoints)
                    const wpts = xmlDoc.getElementsByTagName("wpt");
                    let matchCount = 0;

                    const targetCircuit = state.myCircuits.find(c => c.id === circuitId);

                    if (targetCircuit && wpts.length > 0) {
                        const circuitFeatures = targetCircuit.poiIds
                            .map(pid => state.loadedFeatures.find(f => getPoiId(f) === pid))
                            .filter(Boolean);

                        if (circuitFeatures.length > 0) {
                            for (let i = 0; i < wpts.length; i++) {
                                const lat = parseFloat(wpts[i].getAttribute("lat"));
                                const lon = parseFloat(wpts[i].getAttribute("lon"));

                                // Vérifie la proximité (~50m)
                                const isMatch = circuitFeatures.some(f => {
                                    const fLat = f.geometry.coordinates[1];
                                    const fLon = f.geometry.coordinates[0];
                                    const d = Math.sqrt(Math.pow(lat - fLat, 2) + Math.pow(lon - fLon, 2));
                                    return d < 0.0005;
                                });
                                if (isMatch) matchCount++;
                            }
                        }
                    }

                    if (matchCount > 0) {
                        canImport = await showConfirm(
                            "Vérification",
                            `Ce fichier n'a pas d'ID certifié, mais ${matchCount} étapes correspondent au circuit.\n\nVoulez-vous importer cette trace ?`,
                            "Importer", "Annuler"
                        );
                    } else {
                        canImport = await showConfirm(
                            "Attention",
                            "Ce fichier ne contient ni ID certifié, ni étapes communes avec ce circuit.\n\nÊtes-vous SÛR de vouloir l'utiliser ?",
                            "Importer (Risqué)", "Annuler", true
                        );
                    }
                }

                if (!canImport) {
                    reject(new Error("Import annulé par l'utilisateur."));
                    return;
                }

                // 4. SAUVEGARDE
                const circuitIndex = state.myCircuits.findIndex(c => c.id === circuitId);
                
                if (circuitIndex !== -1) {
                    state.myCircuits[circuitIndex].realTrack = coordinates;
                    await saveCircuit(state.myCircuits[circuitIndex]);
                    
                    if (state.activeCircuitId === circuitId) {
                        updatePolylines(); 
                    }
                    resolve();
                } else {
                    throw new Error("Circuit cible introuvable.");
                }
            } catch (err) {
                reject(err);
            }
        };
        
        reader.onerror = () => reject(new Error("Erreur de lecture du fichier."));
        reader.readAsText(file);
    });
}
