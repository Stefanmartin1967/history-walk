// fileManager.js
import { DOM, showToast, closeDetailsPanel, openDetailsPanel } from './ui.js';
import { state } from './state.js';
import { 
    getAppState, saveAppState, saveCircuit, savePoiData, 
    getAllPoiDataForMap, getAllCircuitsForMap, deleteCircuitById 
} from './database.js';
import { clearCircuit, loadCircuitById } from './circuit.js';
import { displayGeoJSON } from './data.js';
import { isMobileView } from './mobile.js';
import { downloadFile, getExifLocation, calculateDistance, resizeImage } from './utils.js';
import { map } from './map.js';
import { createDraftMarker } from './desktopMode.js';

export async function handleFileLoad(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    DOM.loaderOverlay.style.display = 'flex';

    setTimeout(async () => {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const geojsonString = e.target.result;
                const mapId = file.name.replace(/\.geojson$|\.json$/i, '');
                const data = JSON.parse(geojsonString);
                await saveAppState('lastMapId', mapId);
                await saveAppState('lastGeoJSON', data);
                await clearCircuit(false);
                await displayGeoJSON(data, mapId);
                DOM.btnSaveData.disabled = false;
                DOM.btnRestoreData.disabled = false;
                if(isMobileView()) {
                    location.reload();
                }
            } catch (error) {
                console.error("Erreur GeoJSON:", error);
                showToast("Fichier GeoJSON invalide.", 'error');
                DOM.btnSaveData.disabled = true;
                DOM.btnRestoreData.disabled = true;
            } finally {
                DOM.loaderOverlay.style.display = 'none';
            }
        };
        reader.readAsText(file);
        event.target.value = '';
    }, 50);
}

export async function handleGpxFileImport(event) {
    const file = event.target.files[0];
    if (!file || !state.circuitIdToImportFor) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const gpxContent = e.target.result;
            if (!gpxContent.includes(`[HW-ID:${state.circuitIdToImportFor}]`)) {
                showToast("Erreur : L'ID de ce GPX ne correspond pas au circuit.", 'error');
                return;
            }
            const xmlDoc = new DOMParser().parseFromString(gpxContent, "text/xml");
            const trackpoints = Array.from(xmlDoc.querySelectorAll("trkpt"));
            if (trackpoints.length === 0) {
                showToast("Aucun point de tracé trouvé dans ce GPX.", 'warning');
                return;
            }
            const latLngs = trackpoints.map(pt => [parseFloat(pt.getAttribute('lat')), parseFloat(pt.getAttribute('lon'))]);
            const index = state.myCircuits.findIndex(c => c.id === state.circuitIdToImportFor);
            if (index > -1) {
                state.myCircuits[index].realTrack = latLngs;
                await saveCircuit(state.myCircuits[index]);
                showToast(`Tracé réel importé pour "${state.myCircuits[index].name}".`, 'success');
                if (state.activeCircuitId === state.circuitIdToImportFor) await loadCircuitById(state.activeCircuitId);
            }
        } catch (error) {
            console.error("Erreur lors de l'import GPX:", error);
            showToast("Erreur à la lecture du fichier GPX.", 'error');
        } finally {
            state.circuitIdToImportFor = null;
            event.target.value = '';
        }
    };
    reader.readAsText(file);
}

export async function handlePhotoImport(event) {
    const files = Array.from(event.target.files);
    if (!files || files.length === 0) return;

    DOM.loaderOverlay.style.display = 'flex';

    try {
        // --- ETAPE 1 : ANALYSE GLOBALE (LE BARYCENTRE) ---
        let validCoords = [];
        const filesData = [];

        for (let file of files) {
            try {
                const coords = await getExifLocation(file);
                if (coords) {
                    validCoords.push(coords);
                    filesData.push({ file, coords });
                } else {
                    filesData.push({ file, coords: null });
                }
            } catch (e) {
                filesData.push({ file, coords: null });
            }
        }

        if (validCoords.length === 0) throw new Error("GPS_MISSING");

        const avgLat = validCoords.reduce((sum, c) => sum + c.lat, 0) / validCoords.length;
        const avgLng = validCoords.reduce((sum, c) => sum + c.lng, 0) / validCoords.length;

        const mapInstance = (typeof map !== 'undefined' ? map : window.map);
        if (mapInstance) mapInstance.flyTo([avgLat, avgLng], 18, { duration: 1.5 });

        // --- ETAPE 2 : RADAR ---
        let nearestPoi = null;
        let minDistance = 100;

        state.loadedFeatures.forEach(feature => {
            if (feature.geometry && feature.geometry.coordinates) {
                const [fLng, fLat] = feature.geometry.coordinates;
                const dist = calculateDistance(avgLat, avgLng, fLat, fLng);
                if (dist < minDistance) {
                    minDistance = dist;
                    nearestPoi = feature;
                }
            }
        });

        // --- ETAPE 3 : DÉCISION UTILISATEUR ---
        if (nearestPoi) {
            const poiName = nearestPoi.properties['Nom du site FR'] || 
                            nearestPoi.properties['name'] || 
                            "Lieu inconnu";

            const userChoice = confirm(
                `📍 Lieu existant détecté !\n` +
                `Cible : "${poiName}" (à environ ${Math.round(minDistance)}m du groupe de photos).\n\n` +
                `OK = AJOUTER les photos à ce lieu.\n` +
                `Annuler = Créer un NOUVEAU lieu.`
            );

            if (userChoice) {
                // >>> CAS A : AJOUT AU POI EXISTANT <<<
                let poiId = null;
                if (nearestPoi.properties && nearestPoi.properties.HW_ID) {
                    poiId = String(nearestPoi.properties.HW_ID);
                } else if (nearestPoi.id) {
                    poiId = String(nearestPoi.id);
                }
                if (!poiId) {
                    const [lng, lat] = nearestPoi.geometry.coordinates;
                    poiId = `auto_${Math.round(lat*100000)}_${Math.round(lng*100000)}`;
                    if (!nearestPoi.properties) nearestPoi.properties = {};
                    nearestPoi.properties.HW_ID = poiId;
                }

                if (!state.userData[poiId]) state.userData[poiId] = {};
                if (!state.userData[poiId].photos) state.userData[poiId].photos = [];

                let addedCount = 0;
                let rejectedCount = 0;
                const [poiLng, poiLat] = nearestPoi.geometry.coordinates;

                for (let item of filesData) {
                    const file = item.file;
                    const coords = item.coords;
                    let shouldAdd = true;

                    if (coords) {
                        const dist = calculateDistance(coords.lat, coords.lng, poiLat, poiLng);
                        if (dist > 130) {
                            shouldAdd = confirm(`⚠️ Photo "${file.name}" loin du lieu (${Math.round(dist)}m). Ajouter quand même ?`);
                        }
                    }

                    if (shouldAdd) {
                        try {
                            const resizedBase64 = await resizeImage(file);
                            state.userData[poiId].photos.push(resizedBase64);
                            addedCount++;
                        } catch (err) { console.error(err); }
                    } else {
                        rejectedCount++;
                    }
                }

                await savePoiData(state.currentMapId, poiId, state.userData[poiId]);
                
                DOM.loaderOverlay.style.display = 'none';
                let msg = `${addedCount} photo(s) ajoutée(s).`;
                if (rejectedCount > 0) msg += ` (${rejectedCount} ignorée(s)).`;
                showToast(msg, 'success');

                closeDetailsPanel();
                setTimeout(() => {
                    const index = state.loadedFeatures.indexOf(nearestPoi);
                    if (index > -1) openDetailsPanel(index);
                }, 100);

            } else {
                // >>> CAS B : NOUVEAU LIEU <<<
                DOM.loaderOverlay.style.display = 'none';
                createDraftMarker(avgLat, avgLng, mapInstance);
            }

        } else {
            // >>> CAS C : Aucun POI proche -> NOUVEAU LIEU DIRECT <<<
            DOM.loaderOverlay.style.display = 'none';
            createDraftMarker(avgLat, avgLng, mapInstance);
            showToast("Aucun lieu proche identifié. Création...", 'info');
        }

    } catch (error) {
        DOM.loaderOverlay.style.display = 'none';
        console.error("Erreur Import:", error);
        if (error.message === "GPS_MISSING") {
            alert("Impossible de localiser ces photos (GPS manquant sur l'ensemble du lot).");
        } else {
            alert("Erreur technique : " + error.message);
        }
    } finally {
        event.target.value = ''; 
    }
}

export async function saveUserData() {
    if (!state.currentMapId) {
        showToast("Veuillez d'abord charger une carte.", 'warning');
        return;
    }
    
    const featuresToSave = isMobileView() ? { type: "FeatureCollection", features: state.loadedFeatures } : await getAppState('lastGeoJSON');
    const userData = await getAllPoiDataForMap(state.currentMapId);
    const circuits = await getAllCircuitsForMap(state.currentMapId);
    const hiddenPois = await getAppState(`hiddenPois_${state.currentMapId}`);

    const backupData = {
        mapId: state.currentMapId,
        baseGeoJSON: featuresToSave,
        userData: userData,
        circuits: circuits,
        hiddenPoiIds: hiddenPois || []
    };

    const jsonString = JSON.stringify(backupData, null, 2);
    const date = new Date();
    const dateString = date.toISOString().slice(0, 10);
    const timeString = date.toTimeString().slice(0,8).replace(/:/g, '-');
    const filename = `HistoryWalk_Backup_${state.currentMapId}_${dateString}_${timeString}.json`;
    
    try {
        const file = new File([jsonString], filename, { type: 'application/json' });

        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({
                files: [file],
                title: 'Sauvegarde History Walk',
                text: `Sauvegarde des données du ${dateString}`
            });
            showToast("Données envoyées avec succès !", 'success');
            return;
        }
    } catch (error) {
        if (error.name === 'AbortError') return;
        console.warn("Le partage natif a échoué, bascule vers le téléchargement classique.", error);
    }

    downloadFile(filename, jsonString, 'application/json');
    showToast("Sauvegarde téléchargée (Méthode classique)", 'success');
}

export async function handleRestoreFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    DOM.loaderOverlay.style.display = 'flex';

    setTimeout(async () => {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const backupData = JSON.parse(e.target.result);

                if (!state.currentMapId) {
                    throw new Error("Veuillez charger la carte de destination correspondante avant de restaurer.");
                }

                if (backupData.mapId.toLowerCase() !== state.currentMapId.toLowerCase()) {
                    throw new Error(`Ce fichier est pour la carte "${backupData.mapId}", mais la carte actuelle est "${state.currentMapId}".`);
                }

                if (!confirm(`Voulez-vous vraiment restaurer les données pour la carte "${backupData.mapId}" ?`)) {
                    DOM.loaderOverlay.style.display = 'none';
                    event.target.value = '';
                    return;
                }
                
                if (backupData.baseGeoJSON) {
                    await saveAppState('lastGeoJSON', backupData.baseGeoJSON);
                }

                if (backupData.hiddenPoiIds) {
                    await saveAppState(`hiddenPois_${state.currentMapId}`, backupData.hiddenPoiIds);
                }

                for (const [poiId, data] of Object.entries(backupData.userData)) {
                    await savePoiData(state.currentMapId, poiId, data);
                }

                const currentCircuits = await getAllCircuitsForMap(state.currentMapId);
                for(const circuit of currentCircuits) {
                    await deleteCircuitById(circuit.id);
                }
                for (const circuit of backupData.circuits) {
                    circuit.mapId = state.currentMapId;
                    await saveCircuit(circuit);
                }
                
                showToast("Restauration terminée. L'application va se recharger.", 'success');
                setTimeout(() => location.reload(), 1500);

                } catch (error) {
                console.error("Erreur de restauration:", error);
                showToast(error.message, 'error');
            } finally {
                DOM.loaderOverlay.style.display = 'none';
                event.target.value = '';
            }
        };
        reader.readAsText(file);
    }, 50);
}