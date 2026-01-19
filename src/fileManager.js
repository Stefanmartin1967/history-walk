// fileManager.js
import { state } from './state.js';
import { getPoiId, addPoiFeature, displayGeoJSON } from './data.js';
import { loadCircuitById } from './circuit.js';
import { showToast, DOM } from './ui.js';
import { saveAppState, savePoiData, saveCircuit, clearStore } from './database.js';
import { processImportedGpx } from './gpx.js';

// --- IMPORTATION GÉNÉRIQUE (Pour ouvrir une carte ou un backup) ---

export function handleFileLoad(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const json = JSON.parse(e.target.result);
            
            // Cas 1 : C'est un fichier GeoJSON standard (Carte)
            if (json.type === 'FeatureCollection') {
                await displayGeoJSON(json, file.name.replace('.geojson', '').replace('.json', ''));
                showToast(`Carte "${file.name}" chargée.`, 'success');
            } 
            // Cas 2 : C'est un Backup complet (History Walk Backup)
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
    event.target.value = ''; // Reset pour permettre de recharger le même fichier
}

// --- SAUVEGARDE (EXPORT) ---

// --- SAUVEGARDE (EXPORT) ---

// forceFullMode = false (Défaut) => Sauvegarde Mobile (Rapide, sans photos)
// forceFullMode = true => Sauvegarde Master (PC, avec photos)
export async function saveUserData(forceFullMode = false) {
    if (!state.currentMapId) return showToast("Aucune carte chargée.", "error");

    const includePhotos = forceFullMode;

    const exportData = {
        backupVersion: state.appVersion || "3.0",
        date: new Date().toISOString(),
        mapId: state.currentMapId,
        
        // 1. Base GeoJSON
        baseGeoJSON: {
            type: "FeatureCollection",
            features: state.loadedFeatures.map(f => {
                // On clone le lieu (la géométrie)
                const featureClone = JSON.parse(JSON.stringify(f));
                const poiId = getPoiId(f);
                
                // Intégration des données utilisateur
                if (state.userData[poiId]) {
                    // --- CORRECTION ICI --- 
                    // On fait une COPIE PROFONDE (Deep Copy) des données utilisateur
                    // Avant, on passait une référence, et modifier featureClone modifiait le state !
                    featureClone.properties.userData = JSON.parse(JSON.stringify(state.userData[poiId]));
                }

                // FILTRE : Si mode Mobile (Lite), on vide les photos dans le GeoJSON
                // Maintenant qu'on travaille sur une copie, on peut supprimer sans risque pour la mémoire
                if (!includePhotos && featureClone.properties.userData && featureClone.properties.userData.photos) {
                    featureClone.properties.userData.photos = [];
                }
                
                return featureClone;
            })
        },
        
        // 2. UserData séparé
        // Ici c'était déjà correct (JSON.parse/stringify crée une copie), mais on garde la logique
        userData: JSON.parse(JSON.stringify(state.userData)), 
        myCircuits: state.myCircuits,
        hiddenPoiIds: state.hiddenPoiIds
    };

    // FILTRE : Si mode Mobile (Lite), on vide les photos dans userData
    // On travaille sur exportData (la copie), donc pas de risque pour le state
    if (!includePhotos) {
        for (const key in exportData.userData) {
            if (exportData.userData[key].photos) {
                exportData.userData[key].photos = [];
            }
        }
    }

    // Nommage du fichier
    const mode = includePhotos ? 'FULL_MASTER' : 'LITE_Mobile';
    
    // Format Date : YYYY-MM-DD_HH-MM-SS
    const now = new Date();
    const dateStr = now.getFullYear() + "-" + 
                   String(now.getMonth() + 1).padStart(2, '0') + "-" + 
                   String(now.getDate()).padStart(2, '0') + "_" + 
                   String(now.getHours()).padStart(2, '0') + "-" + 
                   String(now.getMinutes()).padStart(2, '0') + "-" + 
                   String(now.getSeconds()).padStart(2, '0');

    const fileName = `HistoryWalk_Backup_${state.currentMapId}_${mode}_${dateStr}.json`;
    
    downloadJSON(exportData, fileName);
}

function downloadJSON(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("Sauvegarde téléchargée !", "success");
}

// --- RESTAURATION ---

async function restoreBackup(json) {
    try {
        showToast("Restauration en cours...", "info");

        // 1. Restaurer la carte de base (Les lieux)
        if (json.baseGeoJSON) {
            await displayGeoJSON(json.baseGeoJSON, json.mapId || 'RestoredMap');
        }

        // 2. Restaurer les données utilisateur (Notes, Prix, etc.)
        if (json.userData) {
            state.userData = json.userData;
            // On sauvegarde tout dans la DB locale pour persistance
            for (const [id, data] of Object.entries(state.userData)) {
                await savePoiData(state.currentMapId, id, data);
            }
        }

        // 3. Restaurer les circuits
        if (json.myCircuits && Array.isArray(json.myCircuits)) {
            state.myCircuits = json.myCircuits;
            // On écrase les circuits existants dans la DB pour éviter les doublons
            await clearStore('circuits'); 
            for (const circuit of state.myCircuits) {
                await saveCircuit(circuit);
            }
        }
        
        // 4. Restaurer les suppressions (Corbeille)
        if (json.hiddenPoiIds) {
            state.hiddenPoiIds = json.hiddenPoiIds;
            await saveAppState(`hiddenPois_${state.currentMapId}`, state.hiddenPoiIds);
        }

        // 5. Rafraîchir l'affichage global
        
        // On réapplique les filtres pour masquer immédiatement les lieux supprimés
        const { applyFilters } = await import('./data.js'); 
        applyFilters();
        
        // Si on est sur mobile, on force le rafraîchissement de la vue "Circuits"
        const { isMobileView, switchMobileView } = await import('./mobile.js');
        if (isMobileView()) {
            switchMobileView('circuits');
        }

        showToast("Données restaurées avec succès !", "success");

    } catch (error) {
        console.error("Erreur restauration:", error);
        showToast("Erreur lors de la restauration.", "error");
    }
}

// --- GESTION DES IMPORTS SPÉCIFIQUES (GPX & PHOTOS) ---

export async function handleGpxFileImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Vérification que nous avons bien un circuit cible (HW-ID)
    if (state.circuitIdToImportFor) {
        try {
            // CORRECTION : Appel direct à la fonction importée à l'étape 1
            // et utilisation du bon nom de fonction 'processImportedGpx'
            await processImportedGpx(file, state.circuitIdToImportFor);
            showToast("Trace réelle importée avec succès.", "success");
        } catch (err) {
            console.error("Erreur import GPX:", err);
            showToast("Erreur lors de l'import du GPX.", "error");
        }
    } else {
        console.warn("Aucun circuit cible défini pour l'import GPX.");
    }
    
    event.target.value = '';
}

export function handlePhotoImport(event) {
    // 1. COPIE DE SÉCURITÉ : On transforme la FileList vivante en un vrai tableau statique
    // C'est ça qui manquait : Array.from(...) capture les fichiers avant qu'ils ne disparaissent
    const files = Array.from(event.target.files);

    if (!files || files.length === 0) return;

    // 2. Maintenant on peut vider l'input sans risque, car on a notre copie 'files'
    event.target.value = '';

    // 3. On appelle le module asynchrone en lui passant la COPIE
    import('./desktopMode.js').then(module => {
        if (module.handleDesktopPhotoImport) {
            console.log("Envoi des fichiers au module Desktop...", files.length);
            module.handleDesktopPhotoImport(files);
        } else {
            showToast("Import photos non disponible ici", "warning");
        }
    }).catch(err => {
        console.error("Erreur chargement module Photos", err);
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