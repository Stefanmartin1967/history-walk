// fileManager.js
import { state } from './state.js';
import { getPoiId, addPoiFeature, displayGeoJSON } from './data.js';
import { loadCircuitById } from './circuit.js';
import { showToast, DOM } from './ui.js';
import { saveAppState, savePoiData, saveCircuit, clearStore } from './database.js';

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

export async function saveUserData() {
    if (!state.currentMapId) return showToast("Aucune carte chargée.", "error");

    // 1. Demander le type de sauvegarde à l'utilisateur
    const includePhotos = confirm(
        "Voulez-vous inclure les PHOTOS dans la sauvegarde ?\n\n" +
        "• OK = COMPLET (Lourd, conserve les images)\n" +
        "• Annuler = TEXTE SEUL (Léger, idéal pour transfert rapide vers PC)"
    );

    const exportData = {
        backupVersion: state.appVersion || "3.0",
        date: new Date().toISOString(),
        mapId: state.currentMapId,
        
        // A. On sauvegarde l'état actuel complet des données (GeoJSON enrichi)
        baseGeoJSON: {
            type: "FeatureCollection",
            features: state.loadedFeatures.map(f => {
                // Clonage profond pour ne pas modifier l'original en mémoire
                const featureClone = JSON.parse(JSON.stringify(f));
                
                // Si on a des données utilisateur (notes, modifs), on s'assure qu'elles sont bien dans le clone
                const poiId = getPoiId(f);
                if (state.userData[poiId]) {
                    featureClone.properties.userData = state.userData[poiId];
                }

                // FILTRE PHOTOS : Si "Texte Seul", on vide le tableau photos dans le clone
                if (!includePhotos && featureClone.properties.userData && featureClone.properties.userData.photos) {
                    featureClone.properties.userData.photos = [];
                }
                
                return featureClone;
            })
        },
        
        // B. On garde quand même userData séparé pour la sécurité et la rétro-compatibilité
        userData: JSON.parse(JSON.stringify(state.userData)), 
        myCircuits: state.myCircuits,
        hiddenPoiIds: state.hiddenPoiIds
    };

    // Si mode "Texte Seul", on nettoie aussi l'objet userData séparé
    if (!includePhotos) {
        for (const key in exportData.userData) {
            if (exportData.userData[key].photos) {
                exportData.userData[key].photos = [];
            }
        }
    }

    const mode = includePhotos ? 'FULL' : 'LITE';
    const dateStr = new Date().toISOString().slice(0, 10);
    const fileName = `HistoryWalk_Backup_${mode}_${dateStr}.json`;
    
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

export function handleGpxFileImport(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // Import dynamique pour éviter les dépendances cycliques
    import('./gpx.js').then(module => {
        if (module.handleGpxImport) {
            module.handleGpxImport(file);
        } else {
            console.error("Module GPX non trouvé ou fonction manquante");
            showToast("Erreur module GPX", "error");
        }
    }).catch(err => {
        console.error("Erreur chargement module GPX", err);
    });
    event.target.value = '';
}

export function handlePhotoImport(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    
    // On essaie d'importer depuis desktopMode si la fonction existe
    import('./desktopMode.js').then(module => {
        if (module.handleDesktopPhotoImport) {
            module.handleDesktopPhotoImport(files);
        } else {
            showToast("Import photos non disponible ici", "warning");
        }
    }).catch(err => {
        console.error("Erreur chargement module Photos", err);
    });
    event.target.value = '';
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