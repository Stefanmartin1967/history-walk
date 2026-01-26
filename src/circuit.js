// circuit.js
import { state, MAX_CIRCUIT_POINTS, setSelectionMode, addPoiToCurrentCircuit, resetCurrentCircuit } from './state.js';
import { DOM, openDetailsPanel, switchSidebarTab, showToast } from './ui.js';
import { getPoiId, getPoiName, applyFilters } from './data.js';
import { drawLineOnMap, clearMapLines, getRealDistance, getOrthodromicDistance, map } from './map.js';
import { saveAndExportCircuit } from './gpx.js';
import { getAppState, saveAppState, saveCircuit, batchSavePoiData } from './database.js';
// import { saveUserData } from './fileManager.js'; // <--- RETRAIT (C'était la cause du bug de fenêtre)
import { isMobileView, renderMobilePoiList } from './mobile.js';

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

export function renderCircuitPanel() {
    if(!DOM.circuitStepsList) return;

    DOM.circuitStepsList.innerHTML = '';
    const btnLoop = document.getElementById('btn-loop-circuit');
    if(btnLoop) btnLoop.disabled = state.currentCircuit.length === 0 || state.currentCircuit.length >= MAX_CIRCUIT_POINTS;
    
    const btnExport = document.getElementById('btn-export-gpx');
    if(btnExport) btnExport.disabled = state.currentCircuit.length === 0;
    
    const btnImport = document.getElementById('btn-import-gpx');
    if(btnImport) btnImport.disabled = !state.activeCircuitId;

    if (state.currentCircuit.length === 0) {
        DOM.circuitStepsList.innerHTML = `<p class="empty-list-info">Cliquez sur les lieux sur la carte pour les ajouter à votre circuit.</p>`;
    } else {
        state.currentCircuit.forEach((feature, index) => {
            const poiName = getPoiName(feature);
            const stepDiv = document.createElement('div');
            stepDiv.className = 'step';
            stepDiv.innerHTML = `<div class="num">${index + 1}</div><div class="step-main" title="${poiName}">${poiName}</div><div class="step-actions"><button class="stepbtn" data-action="up" title="Monter" ${index === 0 ? 'disabled' : ''}><i data-lucide="chevron-up"></i></button><button class="stepbtn" data-action="down" title="Descendre" ${index === state.currentCircuit.length - 1 ? 'disabled' : ''}><i data-lucide="chevron-down"></i></button><button class="stepbtn" data-action="remove" title="Retirer"><i data-lucide="trash-2"></i></button></div>`;
            stepDiv.querySelector('.step-actions').addEventListener('click', (e) => {
                const button = e.target.closest('button');
                if (button) handleCircuitAction(button.dataset.action, index);
            });
            stepDiv.querySelector('.step-main').addEventListener('click', () => {
                const featureId = state.loadedFeatures.indexOf(feature);
                openDetailsPanel(featureId, index);
            });
            DOM.circuitStepsList.appendChild(stepDiv);
        });
    }
    updateCircuitMetadata();
    
    refreshCircuitDisplay();
    
    if(window.lucide) lucide.createIcons();
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

export function updateCircuitMetadata(updateTitle = true) {
    if(!DOM.circuitPoiCount) return;

    DOM.circuitPoiCount.textContent = `${state.currentCircuit.length}/${MAX_CIRCUIT_POINTS}`;
    const distanceIcon = document.getElementById('distance-icon');
    let totalDistance = 0;
    
    const activeCircuitData = state.myCircuits.find(c => c.id === state.activeCircuitId);
    if (activeCircuitData && activeCircuitData.realTrack) {
        totalDistance = getRealDistance(activeCircuitData);
        if(distanceIcon) {
            distanceIcon.setAttribute('data-lucide', 'footprints');
            distanceIcon.title = 'Distance du tracé réel';
        }
    } else {
        totalDistance = getOrthodromicDistance(state.currentCircuit);
        if(distanceIcon) {
            distanceIcon.setAttribute('data-lucide', 'bird');
            distanceIcon.title = 'Distance à vol d\'oiseau';
        }
    }
    
    if(DOM.circuitDistance) DOM.circuitDistance.textContent = (totalDistance / 1000).toFixed(1) + ' km';
    if(window.lucide) lucide.createIcons();
    
    if (updateTitle && DOM.circuitTitleText) {
        const fullTitle = generateCircuitName();
        DOM.circuitTitleText.textContent = fullTitle;
        DOM.circuitTitleText.title = fullTitle;
    }
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

export async function loadCircuitById(id) {
    const circuitToLoad = state.myCircuits.find(c => c.id === id);
    if (!circuitToLoad) return;
    
    await clearCircuit(false);
    
    state.activeCircuitId = id;
    
    if(DOM.circuitTitleText) DOM.circuitTitleText.textContent = circuitToLoad.name || 'Circuit chargé';
    if(DOM.circuitDescription) DOM.circuitDescription.value = circuitToLoad.description || '';
    
    if (circuitToLoad.transport) {
        const tAller = document.getElementById('transport-aller-temps');
        if(tAller) {
            tAller.value = circuitToLoad.transport.allerTemps || '';
            document.getElementById('transport-aller-cout').value = circuitToLoad.transport.allerCout || '';
            document.getElementById('transport-retour-temps').value = circuitToLoad.transport.retourTemps || '';
            document.getElementById('transport-retour-cout').value = circuitToLoad.transport.retourCout || '';
        }
    }
    
    state.currentCircuit = circuitToLoad.poiIds.map(poiId => state.loadedFeatures.find(f => getPoiId(f) === poiId)).filter(Boolean);

    if (isMobileView()) {
        renderMobilePoiList(state.currentCircuit);
    } else {
        if (!state.isSelectionModeActive) {
            toggleSelectionMode();
        } else {
            renderCircuitPanel();
        }
        applyFilters();

        if (map && state.currentCircuit.length > 0) {
            const group = L.featureGroup(state.currentCircuit.map(f => {
                const coords = f.geometry.coordinates;
                return L.marker([coords[1], coords[0]]);
            }));
            map.flyToBounds(group.getBounds().pad(0.1)); 
        }
    }
    showToast(`Circuit "${circuitToLoad.name}" chargé.`, "success");
}

// --- LE CHEF D'ORCHESTRE (Traducteur pour la carte) ---
export function refreshCircuitDisplay() {
    // 1. S'il n'y a pas assez de points pour faire une ligne, on demande au peintre d'effacer.
    if (state.currentCircuit.length < 2) {
        clearMapLines();
        return;
    }

    // 2. On traduit les POIs en coordonnées GPS [Latitude, Longitude] pour le Peintre
    const coordinates = state.currentCircuit.map(feature => {
        return [feature.geometry.coordinates[1], feature.geometry.coordinates[0]];
    });

    // 3. On donne l'ordre au Peintre
    drawLineOnMap(coordinates, false); 
}