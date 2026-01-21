// fileManager.js
import { state } from './state.js';
import { getPoiId, displayGeoJSON } from './data.js';
import { showToast, DOM, closeDetailsPanel } from './ui.js';
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
                    // COPIE PROFONDE (Deep Copy) des données utilisateur
                    // Crucial pour ne pas modifier le state actuel lors du filtrage ci-dessous
                    featureClone.properties.userData = JSON.parse(JSON.stringify(state.userData[poiId]));
                }

                // FILTRE : Si mode Mobile (Lite), on vide les photos dans le GeoJSON exporté
                if (!includePhotos && featureClone.properties.userData && featureClone.properties.userData.photos) {
                    featureClone.properties.userData.photos = [];
                }
                
                return featureClone;
            })
        },
        
        // 2. UserData séparé
        userData: JSON.parse(JSON.stringify(state.userData)), 
        myCircuits: state.myCircuits,
        hiddenPoiIds: state.hiddenPoiIds
    };

    // FILTRE : Si mode Mobile (Lite), on vide les photos dans userData exporté
    if (!includePhotos) {
        for (const key in exportData.userData) {
            if (exportData.userData[key].photos) {
                exportData.userData[key].photos = [];
            }
        }
    }

    // Nommage du fichier
    const mode = includePhotos ? 'FULL_MASTER' : 'LITE_Mobile';
    
    // Format Date propre : YYYY-MM-DD_HH-MM-SS
    const now = new Date();
    // Ajustement timezone local pour le nom de fichier
    const localDate = new Date(now.getTime() - (now.getTimezoneOffset() * 60000));
    const dateStr = localDate.toISOString()
        .replace(/T/, '_')
        .replace(/\..+/, '')
        .replace(/:/g, '-');

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
            
            // --- SECURITÉ : Nettoyage de l'état actif ---
            state.activeCircuitId = null; 
            state.currentCircuit = []; // On vide le brouillon pour éviter les conflits d'ID
            // ----------------------------------------------

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

        // 5. Rafraîchir l'affichage global et nettoyer l'UI
        
        // Fermeture du panneau de détail s'il est ouvert (évite d'afficher des données périmées)
        if (closeDetailsPanel) closeDetailsPanel();

        // On réapplique les filtres (gestion des couleurs/masquage)
        // Utilisation d'import dynamique pour éviter les dépendances circulaires
        const { applyFilters } = await import('./data.js'); 
        if (applyFilters) applyFilters();
        
        // Gestion Mobile
        const { isMobileView, switchMobileView } = await import('./mobile.js');
        if (isMobileView && isMobileView()) {
            // Force le retour à la liste des circuits pour rafraîchir la vue
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

    // Vérification que nous avons bien un circuit cible
    if (state.circuitIdToImportFor) {
        try {
            await processImportedGpx(file, state.circuitIdToImportFor);
            showToast("Trace réelle importée avec succès.", "success");
        } catch (err) {
            console.error("Erreur import GPX:", err);
            showToast("Erreur lors de l'import du GPX.", "error");
        }
    } else {
        console.warn("Aucun circuit cible défini pour l'import GPX.");
        showToast("Veuillez sélectionner un circuit avant d'importer un GPX.", "warning");
    }
    
    event.target.value = '';
}

export function handlePhotoImport(event) {
    // COPIE DE SÉCURITÉ : On transforme la FileList en tableau statique
    const files = Array.from(event.target.files);

    if (!files || files.length === 0) return;

    // On peut vider l'input maintenant
    event.target.value = '';

    // Import dynamique du module Desktop
    import('./desktopMode.js').then(module => {
        if (module.handleDesktopPhotoImport) {
            console.log("Envoi des fichiers au module Desktop...", files.length);
            module.handleDesktopPhotoImport(files);
        } else {
            showToast("Import photos non disponible ici", "warning");
        }
    }).catch(err => {
        console.error("Erreur chargement module Photos", err);
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