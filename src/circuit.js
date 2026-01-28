// circuit.js
import { state, MAX_CIRCUIT_POINTS, setSelectionMode, addPoiToCurrentCircuit, resetCurrentCircuit } from './state.js';
import { DOM, openDetailsPanel, switchSidebarTab, showToast } from './ui.js';
import { getPoiId, getPoiName, applyFilters } from './data.js';
import { drawLineOnMap, clearMapLines, getRealDistance, getOrthodromicDistance, map } from './map.js';
import { saveAndExportCircuit } from './gpx.js';
import { getAppState, saveAppState, saveCircuit, batchSavePoiData } from './database.js';
// import { saveUserData } from './fileManager.js'; // <--- RETRAIT (C'était la cause du bug de fenêtre)
import { isMobileView, renderMobilePoiList } from './mobile.js';
import * as View from './circuit-view.js';

// --- FONCTION CORRIGÉE ---
export async function setCircuitVisitedState(circuitId, isVisited) {
    // On récupère le circuit dans la mémoire
    const circuit = state.myCircuits.find(c => c.id === circuitId);
    if (!circuit) return;

    // On crée un panier vide pour y mettre nos modifications
    const updates = [];
    
    // Pour chaque lieu contenu dans ce circuit...
    circuit.poiIds.forEach(poiId => {
        const feature = state.loadedFeatures.find(f => getPoiId(f) === poiId);
        if (feature) {
            // Si le lieu n'a pas encore de tiroir "userData", on lui en crée un
            if (!feature.properties.userData) feature.properties.userData = {};
            
            // ACTION 1 : Mise à jour visuelle (Mémoire vive)
            feature.properties.userData.vu = isVisited;
            
            // ACTION 2 : On prépare l'ordre de sauvegarde pour ce lieu précis
            updates.push({
                poiId: poiId,
                data: feature.properties.userData
            });
        }
    });

    // ACTION FINALE : Si on a des choses à sauvegarder...
    if (updates.length > 0) {
        try {
            // On demande à la Database d'enregistrer tout le panier d'un coup
            // state.currentMapId permet de savoir dans quelle carte on travaille (ex: djerba)
            await batchSavePoiData(state.currentMapId, updates);
            console.log(`[Circuit] ${updates.length} lieux sauvegardés en base de données.`);
        } catch (error) {
            console.error("Erreur de sauvegarde Database :", error);
            showToast("Souci de sauvegarde permanente", "error");
        }
    }

    // Mise à jour de l'affichage pour l'utilisateur
    if (isMobileView()) {
        renderMobilePoiList(state.loadedFeatures);
    } else {
        applyFilters(); // Sur PC, on rafraîchit les filtres pour griser/cacher les lieux vus
    }
    
    showToast(isVisited ? "Circuit marqué comme fait" : "Circuit marqué comme non fait", "success");
}

// ... LE RESTE DU FICHIER RESTE IDENTIQUE ...
export async function saveCircuitDraft() {
    if (!state.currentMapId) return;
    try {
        // Petit helper local pour lire une valeur sans crasher si l'élément manque
        const getVal = (id) => {
            const el = document.getElementById(id);
            return el ? el.value : '';
        };

        const circuitData = {
            poiIds: state.currentCircuit.map(getPoiId).filter(Boolean),
            // On vérifie aussi DOM.circuitDescription au cas où
            description: DOM.circuitDescription ? DOM.circuitDescription.value : '',
            transport: {
                allerTemps: getVal('transport-aller-temps'),
                allerCout: getVal('transport-aller-cout'),
                retourTemps: getVal('transport-retour-temps'),
                retourCout: getVal('transport-retour-cout')
            }
        };
        await saveAppState(`circuitDraft_${state.currentMapId}`, circuitData);
    } catch (error) {
        console.error("Erreur lors de la sauvegarde du brouillon:", error);
    }
}

export async function loadCircuitDraft() {
    if (!state.currentMapId || state.loadedFeatures.length === 0) return;
    try {
        const savedData = await getAppState(`circuitDraft_${state.currentMapId}`);
        if (savedData && Array.isArray(savedData.poiIds) && savedData.poiIds.length > 0) {
            state.currentCircuit = savedData.poiIds.map(id => state.loadedFeatures.find(feature => getPoiId(feature) === id)).filter(Boolean);
            
            const circuitName = generateCircuitName();
            if(DOM.circuitTitleText) DOM.circuitTitleText.textContent = circuitName;
            
            if(DOM.circuitDescription) DOM.circuitDescription.value = savedData.description || '';
            
            const tAllerTemps = document.getElementById('transport-aller-temps');
            if(tAllerTemps && savedData.transport) {
                tAllerTemps.value = savedData.transport.allerTemps || '';
                document.getElementById('transport-aller-cout').value = savedData.transport.allerCout || '';
                document.getElementById('transport-retour-temps').value = savedData.transport.retourTemps || '';
                document.getElementById('transport-retour-cout').value = savedData.transport.retourCout || '';
            }

            if (state.currentCircuit.length > 0) {
                if (!state.isSelectionModeActive) {
                    toggleSelectionMode();
                } else {
                    renderCircuitPanel();
                }
            }
        }
    } catch (e) {
        console.error("Erreur lors du chargement du brouillon sauvegardé:", e);
        await saveAppState(`circuitDraft_${state.currentMapId}`, null);
    }
}

// --- LE BOUTON QUI APPELLE LE MAJORDOME ET GÈRE L'AFFICHAGE ---
export function toggleSelectionMode(forceValue) {
    // 1. Le Majordome gère la donnée (L'État)
    // On garde votre logique de "forceValue" qui était très bien
    if (typeof forceValue === 'boolean') {
        setSelectionMode(forceValue);
    } else {
        setSelectionMode(!state.isSelectionModeActive);
    }
    
    // 2. Mise à jour du bouton
    if(DOM.btnModeSelection) {
        DOM.btnModeSelection.classList.toggle('active', state.isSelectionModeActive);
    }

    // 3. Gestion de l'Interface (Panneaux et Lignes)
    if (state.isSelectionModeActive) {
        if (DOM.rightSidebar) DOM.rightSidebar.style.display = 'flex';
        switchSidebarTab('circuit');
        renderCircuitPanel();
        showToast("Mode sélection activé : Cliquez sur la carte pour ajouter des points", "info");
    } else {
        if (DOM.rightSidebar) DOM.rightSidebar.style.display = 'none';
        if (state.orthodromicPolyline) state.orthodromicPolyline.remove();
        if (state.realTrackPolyline) state.realTrackPolyline.remove();
        showToast("Mode sélection désactivé", "info");
    }
    
    applyFilters();
}

// --- FONCTION POUR AJOUTER UN POINT (La version robuste) ---
export function addPoiToCircuit(feature) {
    // 1. Sécurité : Éviter d'ajouter deux fois le même point d'affilée
    if (state.currentCircuit.length > 0 && getPoiId(feature) === getPoiId(state.currentCircuit[state.currentCircuit.length - 1])) {
        return; 
    }
    
    // 2. Sécurité : Limite de points
    if (state.currentCircuit.length >= MAX_CIRCUIT_POINTS) {
        showToast(`Maximum de ${MAX_CIRCUIT_POINTS} points atteint.`, 'warning');
        return;
    }

    // 3. UI : Ouvrir le panneau et basculer sur l'onglet Circuit
    if (DOM.rightSidebar) DOM.rightSidebar.style.display = 'flex';
    switchSidebarTab('circuit');

    // 4. L'ACTION PROPRE : On appelle le Majordome au lieu du .push()
    addPoiToCurrentCircuit(feature);

    // 5. LA SAUVEGARDE : On enregistre les DONNÉES du brouillon dans IndexedDB (Le vrai tiroir)
    saveAppState('currentCircuit', state.currentCircuit);

    // 6. MISE À JOUR VISUELLE
    renderCircuitPanel(); 
    if (typeof updatePolylines === 'function') updatePolylines();
}

// circuit.js (extrait)
// circuit.js
export function renderCircuitPanel() {
    const points = state.currentCircuit;

    View.renderCircuitList(points, {
        onAction: (action, index) => handleCircuitAction(action, index),
        onDetails: (feature, index) => {
            const featureId = state.loadedFeatures.indexOf(feature);
            openDetailsPanel(featureId, index);
        }
    });

    // On met à jour les boutons
    View.updateControlButtons({
        cannotLoop: points.length === 0 || points.length >= MAX_CIRCUIT_POINTS,
        isEmpty: points.length === 0,
        isActive: !!state.activeCircuitId // On passe l'info si un circuit est chargé
    });

    updateCircuitMetadata();
    refreshCircuitDisplay(); // Cette fonction va maintenant choisir la bonne ligne !
}

export function updateCircuitMetadata(updateTitle = true) {
    // 1. LOGIQUE DE CALCUL (On récupère ce qui était dans ton ancienne fonction)
    let totalDistance = 0;
    let isRealTrack = false;

    const activeCircuitData = state.myCircuits.find(c => c.id === state.activeCircuitId);
    
    if (activeCircuitData && activeCircuitData.realTrack) {
        totalDistance = getRealDistance(activeCircuitData);
        isRealTrack = true;
    } else {
        totalDistance = getOrthodromicDistance(state.currentCircuit);
    }

    const title = generateCircuitName();

    // 2. ENVOI À LA VUE (On ne touche plus au DOM ici)
    View.updateStatsUI({
        countText: `${state.currentCircuit.length}/${MAX_CIRCUIT_POINTS}`,
        distanceText: (totalDistance / 1000).toFixed(1) + ' km',
        title: title,
        iconType: isRealTrack ? 'footprints' : 'bird',
        iconTitle: isRealTrack ? 'Distance du tracé réel' : "Distance à vol d'oiseau"
    });
}

function handleCircuitAction(action, index) {
    if (action === 'up' && index > 0) {
        [state.currentCircuit[index], state.currentCircuit[index - 1]] = [state.currentCircuit[index - 1], state.currentCircuit[index]];
    } else if (action === 'down' && index < state.currentCircuit.length - 1) {
        [state.currentCircuit[index], state.currentCircuit[index + 1]] = [state.currentCircuit[index + 1], state.currentCircuit[index]];
    } else if (action === 'remove') {
        const removedFeature = state.currentCircuit[index];
        state.currentCircuit.splice(index, 1);
        
        if (state.currentFeatureId !== null && getPoiId(state.loadedFeatures[state.currentFeatureId]) === getPoiId(removedFeature)) {
            state.currentFeatureId = null;
            state.currentCircuitIndex = null;
            
            if (document.querySelector('#details-panel.active')) {
                if (state.currentCircuit.length > 0) {
                    const firstFeatureId = state.loadedFeatures.indexOf(state.currentCircuit[0]);
                    openDetailsPanel(firstFeatureId, 0);
                } else {
                    switchSidebarTab('circuit');
                }
            }
        }
    }
    saveCircuitDraft();
    renderCircuitPanel();
}

export function generateCircuitName() {
    if (state.currentCircuit.length === 0) return "Nouveau Circuit";
    if (state.currentCircuit.length === 1) return `Départ de ${getPoiName(state.currentCircuit[0])}`;
    
    const startPoi = getPoiName(state.currentCircuit[0]);
    const endPoi = getPoiName(state.currentCircuit[state.currentCircuit.length - 1]);
    
    let middlePoi = "";
    if (state.currentCircuit.length > 2) {
        const middleIndex = Math.floor((state.currentCircuit.length - 1) / 2);
        middlePoi = getPoiName(state.currentCircuit[middleIndex]);
    }

    if (getPoiId(state.currentCircuit[0]) === getPoiId(state.currentCircuit[state.currentCircuit.length - 1])) {
        if (middlePoi && startPoi !== middlePoi) {
            return `Boucle autour de ${startPoi} via ${middlePoi}`;
        }
        return `Boucle autour de ${startPoi}`;
    } 
    else {
        if (middlePoi) {
             return `Circuit de ${startPoi} à ${endPoi} via ${middlePoi}`;
        }
        return `Circuit de ${startPoi} à ${endPoi}`;
    }
}

// --- FONCTION POUR VIDER LE BROUILLON (Version Majordome + UI) ---
export async function clearCircuit(withConfirmation = true) {
    const doClear = async () => {
        // 1. Le Majordome vide la liste des points en mémoire
        resetCurrentCircuit();

        // 2. On réinitialise les infos du circuit
        state.activeCircuitId = null;
        state.currentCircuitIndex = null;
        
        // 3. Nettoyage de l'interface (Champs texte et formulaires)
        if(DOM.circuitDescription) DOM.circuitDescription.value = '';
        const tAller = document.getElementById('transport-aller-temps');
        if(tAller) {
            tAller.value = '';
            document.getElementById('transport-aller-cout').value = '';
            document.getElementById('transport-retour-temps').value = '';
            document.getElementById('transport-retour-cout').value = '';
        }

        // 4. LA LIGNE MAGIQUE : On sauvegarde ce "vide" dans le disque dur !
        await saveAppState('currentCircuit', []);

        // 5. Mise à jour de l'affichage (Panneau et Carte)
        renderCircuitPanel();
        refreshCircuitDisplay(); // Le nouveau Peintre efface les lignes !

        if (document.querySelector('#circuit-panel.active') && DOM.circuitTitleText) {
            DOM.circuitTitleText.textContent = 'Nouveau Circuit';
        }
    };

    // 6. La confirmation avant d'effacer (Votre logique d'origine)
    if (withConfirmation && state.currentCircuit.length > 0) {
        if (confirm("Voulez-vous vraiment vider le brouillon du circuit ?")) await doClear();
    } else if (!withConfirmation) {
        await doClear();
    }
}

export function navigatePoiDetails(direction) {
    if (state.currentCircuitIndex === null) return;
    
    const newIndex = state.currentCircuitIndex + direction;
    
    if (newIndex >= 0 && newIndex < state.currentCircuit.length) {
        const newFeature = state.currentCircuit[newIndex];
        const newFeatureId = state.loadedFeatures.indexOf(newFeature);
        openDetailsPanel(newFeatureId, newIndex);
    }
}

export function updateCircuitForm(data) {
    if (DOM.circuitTitleText) DOM.circuitTitleText.textContent = data.name || 'Circuit chargé';
    if (DOM.circuitDescription) DOM.circuitDescription.value = data.description || '';
    
    // Remplissage des transports
    const fields = {
        'transport-aller-temps': data.transport?.allerTemps,
        'transport-aller-cout': data.transport?.allerCout,
        'transport-retour-temps': data.transport?.retourTemps,
        'transport-retour-cout': data.transport?.retourCout
    };

    for (const [id, value] of Object.entries(fields)) {
        const el = document.getElementById(id);
        if (el) el.value = value || '';
    }
}

// --- LE CHEF D'ORCHESTRE (Traducteur pour la carte) ---
export function refreshCircuitDisplay() {
    // 1. On commence par TOUT effacer sur la carte pour éviter les superpositions
    clearMapLines();

    // 2. S'il n'y a pas assez de points, on s'arrête là
    if (state.currentCircuit.length < 2) return;

    // 3. On cherche si le circuit actuel possède une trace réelle (GPX importé)
    const activeCircuit = state.myCircuits.find(c => c.id === state.activeCircuitId);

    if (activeCircuit && activeCircuit.realTrack) {
        // CAS A : On a un tracé réel -> On demande au peintre de dessiner la ligne rouge
        // Note : On suppose que ta fonction drawLineOnMap(coords, isReal) gère la couleur
        drawLineOnMap(activeCircuit.realTrack, true); 
    } else {
        // CAS B : Pas de tracé réel -> On calcule les coordonnées pour la ligne bleue
        const coordinates = state.currentCircuit.map(feature => [
            feature.geometry.coordinates[1], 
            feature.geometry.coordinates[0]
        ]);
        drawLineOnMap(coordinates, false); 
    }
}

// circuit.js

export async function loadCircuitById(id) {
    const circuitToLoad = state.myCircuits.find(c => c.id === id);
    if (!circuitToLoad) return;
    
    // 1. Nettoyage de l'ancien état (sans confirmation)
    await clearCircuit(false);
    
    // 2. Mise à jour de l'état
    state.activeCircuitId = id;
    state.currentCircuit = circuitToLoad.poiIds
        .map(poiId => state.loadedFeatures.find(f => getPoiId(f) === poiId))
        .filter(Boolean);

    // 3. Délégation à la VUE (On sort le HTML d'ici !)
    View.updateCircuitForm(circuitToLoad);

    // 4. Gestion de l'affichage selon le mode (Mobile ou PC)
    if (isMobileView()) {
        renderMobilePoiList(state.currentCircuit);
    } else {
        // Active le mode sélection si besoin et rafraîchit le panneau
        if (!state.isSelectionModeActive) {
            toggleSelectionMode(true);
        } else {
            renderCircuitPanel(); 
        }
        applyFilters();

        // 5. Centrage Intelligent de la carte
        if (map && (state.currentCircuit.length > 0 || circuitToLoad.realTrack)) {
            // On priorise la trace réelle pour le centrage si elle existe
            const pointsToFit = (circuitToLoad.realTrack && circuitToLoad.realTrack.length > 0) 
                ? circuitToLoad.realTrack 
                : state.currentCircuit.map(f => [f.geometry.coordinates[1], f.geometry.coordinates[0]]);
            
            // On crée un groupe temporaire pour calculer les limites (bounds)
            const bounds = L.latLngBounds(pointsToFit);
            map.flyToBounds(bounds, { padding: [20, 20] });
        }
    }

    showToast(`Circuit "${circuitToLoad.name}" chargé.`, "success");
    
    // On force un dernier rafraîchissement des lignes pour être sûr
    refreshCircuitDisplay();
}

// --- À AJOUTER À LA FIN DE circuit.js ---

export function setupCircuitEventListeners() {
    console.log("⚡ Démarrage des écouteurs du Circuit...");

    // 1. Bouton EXPORTER GPX
    // On vérifie DOM.btnExportGpx (généré automatiquement par ton ui.js)
    if (DOM.btnExportGpx) {
        // On clone le bouton pour supprimer les vieux bugs d'écouteurs
        const newBtn = DOM.btnExportGpx.cloneNode(true);
        DOM.btnExportGpx.parentNode.replaceChild(newBtn, DOM.btnExportGpx);
        DOM.btnExportGpx = newBtn; 
        
        DOM.btnExportGpx.addEventListener('click', () => {
            console.log("Clic sur Exporter GPX");
            saveAndExportCircuit();
        });
    }

    // 2. Bouton IMPORTER GPX
    if (DOM.btnImportGpx) {
        DOM.btnImportGpx.addEventListener('click', () => {
            console.log("Clic sur Importer GPX");
            if (state.activeCircuitId) {
                state.circuitIdToImportFor = state.activeCircuitId;
                if(DOM.gpxImporter) DOM.gpxImporter.click();
            } else {
                // Création d'un nouveau circuit via import
                if(DOM.gpxImporter) DOM.gpxImporter.click();
            }
        });
    }

    // 3. Bouton BOUCLER
    if (DOM.btnLoopCircuit) {
        DOM.btnLoopCircuit.addEventListener('click', () => {
            console.log("Clic sur Boucler");
            if (state.currentCircuit.length > 0 && state.currentCircuit.length < MAX_CIRCUIT_POINTS) {
                // Ajoute le 1er point à la fin pour fermer la boucle
                addPoiToCircuit(state.currentCircuit[0]); 
            } else {
                showToast("Impossible de boucler (Circuit vide ou plein)", "warning");
            }
        });
    }
    
    // 4. Description (Input texte)
    if(DOM.circuitDescription) {
        DOM.circuitDescription.addEventListener('input', saveCircuitDraft);
    }
}