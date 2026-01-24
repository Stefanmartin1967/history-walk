// fileManager.js
import { state } from './state.js';
import { getPoiId, displayGeoJSON } from './data.js';
import { showToast, DOM, closeDetailsPanel } from './ui.js';
import { saveAppState, savePoiData, saveCircuit, clearStore } from './database.js';
import { processImportedGpx } from './gpx.js';
// Import pour contrôler la vue mobile
import { isMobileView, switchMobileView } from './mobile.js';

// --- IMPORTATION GÉNÉRIQUE ---

export function handleFileLoad(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const json = JSON.parse(e.target.result);
            
            // Cas 1 : GeoJSON (Carte)
            if (json.type === 'FeatureCollection') {
                const mapName = file.name.replace('.geojson', '').replace('.json', '');
                
                if (isMobileView()) {
                    // Mobile: Chargement mémoire uniquement
                    state.loadedFeatures = json.features || [];
                    state.currentMapId = mapName;
                    await saveAppState('lastMapId', mapName);
                    await saveAppState('lastGeoJSON', json);
                    showToast(`Carte "${mapName}" chargée (Mode Mobile).`, 'success');
                    switchMobileView('circuits');
                } else {
                    // Desktop: Rendu Carte
                    await displayGeoJSON(json, mapName);
                    showToast(`Carte "${file.name}" chargée.`, 'success');
                }
            } 
            // Cas 2 : Backup
            else if (json.backupVersion && (json.baseGeoJSON || json.userData)) {
                await restoreBackup(json);
            }
            else {
                showToast("Format de fichier non reconnu.", "error");
            }
        } catch (error) {
            console.error("Erreur lecture fichier:", error);
            showToast("Erreur lors de la lecture du fichier.", "error");
        }
    };
    reader.readAsText(file);
    event.target.value = ''; 
}

// --- SAUVEGARDE (EXPORT) - INCHANGÉ ---
export async function saveUserData(forceFullMode = false) {
    if (!state.currentMapId) return showToast("Aucune carte chargée.", "error");

    const includePhotos = forceFullMode;

    const exportData = {
        backupVersion: state.appVersion || "3.0",
        date: new Date().toISOString(),
        mapId: state.currentMapId,
        baseGeoJSON: {
            type: "FeatureCollection",
            features: state.loadedFeatures.map(f => {
                const featureClone = JSON.parse(JSON.stringify(f));
                const poiId = getPoiId(f);
                if (state.userData[poiId]) {
                    featureClone.properties.userData = JSON.parse(JSON.stringify(state.userData[poiId]));
                }
                if (!includePhotos && featureClone.properties.userData && featureClone.properties.userData.photos) {
                    featureClone.properties.userData.photos = [];
                }
                return featureClone;
            })
        },
        userData: JSON.parse(JSON.stringify(state.userData)), 
        myCircuits: state.myCircuits,
        hiddenPoiIds: state.hiddenPoiIds
    };

    if (!includePhotos) {
        for (const key in exportData.userData) {
            if (exportData.userData[key].photos) {
                exportData.userData[key].photos = [];
            }
        }
    }

    const mode = includePhotos ? 'FULL_MASTER' : 'LITE_Mobile';
    const now = new Date();
    const localDate = new Date(now.getTime() - (now.getTimezoneOffset() * 60000));
    const dateStr = localDate.toISOString().replace(/T/, '_').replace(/\..+/, '').replace(/:/g, '-');
    const fileName = `HistoryWalk_Backup_${state.currentMapId}_${mode}_${dateStr}.json`;
    
    downloadJSON(exportData, fileName);
}

async function downloadJSON(data, filename) {
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    
    // 1. Création d'un objet File pour le partage
    const safeFileName = filename.replace('.json', '.txt');
    const file = new File([blob], safeFileName, { type: 'text/plain' });

    // 2. Vérification : Est-ce qu'on peut utiliser le menu Partager natif ?
    // (Fonctionne sur Android et iOS modernes)
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
            await navigator.share({
    files: [file],
    title: safeFileName, // <-- ON REMPLACE LE TEXTE EN DUR PAR LE VRAI NOM DU FICHIER
    text: `Backup du ${new Date().toLocaleDateString()}`
});
            // Si le partage a réussi, on s'arrête là (pas besoin de télécharger en double)
            return; 
        } catch (error) {
            // Si l'utilisateur annule le partage ou s'il y a une erreur,
            // on continue vers la méthode classique ci-dessous (fallback).
            if (error.name !== 'AbortError') {
                console.warn("Erreur partage, bascule vers téléchargement classique:", error);
            } else {
                return; // L'utilisateur a annulé volontairement
            }
        }
    }

    // 3. Méthode Classique (PC ou vieux téléphones)
    // C'est le code que tu avais avant, qui sert de roue de secours
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    // Petit message différent selon le contexte
    if (!navigator.canShare) {
        showToast("Sauvegarde téléchargée (Vérifiez vos téléchargements)", "success");
    }
}

// --- RESTAURATION (Modifiée pour Mobile) ---

async function restoreBackup(json) {
    try {
        showToast("Restauration en cours...", "info");

        // 1. Restaurer la carte de base
        const mapId = json.mapId || 'RestoredMap';
        state.currentMapId = mapId;
        await saveAppState('lastMapId', mapId);

        if (json.baseGeoJSON) {
            if (isMobileView()) {
                // Mobile: On stocke juste en mémoire
                state.loadedFeatures = json.baseGeoJSON.features || [];
                // IMPORTANT: Sauvegarder le geojson pour le prochain reload
                await saveAppState('lastGeoJSON', json.baseGeoJSON);
            } else {
                // Desktop: On affiche
                await displayGeoJSON(json.baseGeoJSON, mapId);
            }
        }

        // 2. Restaurer les données utilisateur
        if (json.userData) {
            state.userData = json.userData;
            for (const [id, data] of Object.entries(state.userData)) {
                await savePoiData(state.currentMapId, id, data);
            }

            state.loadedFeatures.forEach(feature => {
        const id = getPoiId(feature);
        if (state.userData[id]) {
            feature.properties.userData = state.userData[id];
        }
    });

        }

        // 3. Restaurer les circuits
        if (json.myCircuits && Array.isArray(json.myCircuits)) {
            state.myCircuits = json.myCircuits;
            state.activeCircuitId = null; 
            state.currentCircuit = [];
            
            await clearStore('circuits'); 
            for (const circuit of state.myCircuits) {
                await saveCircuit(circuit);
            }
        }
        
        // 4. Restaurer les suppressions
        if (json.hiddenPoiIds) {
            state.hiddenPoiIds = json.hiddenPoiIds;
            await saveAppState(`hiddenPois_${state.currentMapId}`, state.hiddenPoiIds);
        }

        // 5. Rafraîchissement UI
        if (closeDetailsPanel) closeDetailsPanel();

        if (isMobileView()) {
            // FORCE LE RAFRAÎCHISSEMENT MOBILE
            console.log("Restauration Mobile Terminée -> Refresh UI");
            switchMobileView('circuits');
            showToast("Données restaurées !", "success");
        } else {
            // Desktop Refresh
            const { applyFilters } = await import('./data.js'); 
            if (applyFilters) applyFilters();
            showToast("Données restaurées avec succès !", "success");
        }

    } catch (error) {
        console.error("Erreur restauration:", error);
        showToast("Erreur lors de la restauration.", "error");
    }
}

// --- IMPORTS SPÉCIFIQUES ---

export async function handleGpxFileImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (state.circuitIdToImportFor) {
        try {
            await processImportedGpx(file, state.circuitIdToImportFor);
            showToast("Trace réelle importée avec succès.", "success");
        } catch (err) {
            console.error("Erreur import GPX:", err);
            showToast("Erreur lors de l'import du GPX.", "error");
        }
    } else {
        showToast("Veuillez sélectionner un circuit avant d'importer un GPX.", "warning");
    }
    event.target.value = '';
}

export function handlePhotoImport(event) {
    const files = Array.from(event.target.files);
    if (!files || files.length === 0) return;
    event.target.value = '';

    import('./desktopMode.js').then(module => {
        if (module.handleDesktopPhotoImport) {
            module.handleDesktopPhotoImport(files);
        } else {
            showToast("Import photos non disponible ici", "warning");
        }
    }).catch(err => {
        showToast("Erreur chargement module Photos", "error");
    });
}

export function handleRestoreFile(event) {
    const file = event.target.files[0];
    if(!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const json = JSON.parse(e.target.result);
            restoreBackup(json);
        } catch(err) {
            console.error(err);
            showToast("Fichier de sauvegarde invalide", "error");
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}