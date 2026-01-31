// main.js
import { initDB, getAppState, saveAppState, getAllPoiDataForMap, getAllCircuitsForMap } from './database.js';
import { APP_VERSION, state } from './state.js';
import { initMap, map, refreshMapMarkers } from './map.js';
import { eventBus } from './events.js';
import {
    initializeDomReferences,
    setupTabs,
    DOM,
    openCircuitsModal,
    closeCircuitsModal,
    populateZonesMenu,
    populateCategoriesMenu,
    closeDetailsPanel,
    populateAddPoiModalCategories,
    showLegendModal,
    openRestoreModal,
    updateSelectionModeButton,
    populateCircuitsMenu
} from './ui.js';
import { showToast } from './toast.js';

import {
    toggleSelectionMode,
    clearCircuit,
    setupCircuitEventListeners,
    loadCircuitById
} from './circuit.js';

import { performCircuitDeletion, toggleCircuitVisitedStatus } from './circuit-actions.js';

import { displayGeoJSON, applyFilters, getPoiId } from './data.js';
import { isMobileView, initMobileMode, switchMobileView, renderMobilePoiList } from './mobile.js';

import { handleFileLoad, handleGpxFileImport, handlePhotoImport, saveUserData, handleRestoreFile } from './fileManager.js';
import { setupSearch, setupSmartSearch } from './searchManager.js';
import { enableDesktopCreationMode, setupDesktopTools } from './desktopMode.js';
import { showConfirm } from './modal.js';

// --- FONCTION UTILITAIRE : Gestion des boutons de sauvegarde ---
function setSaveButtonsState(enabled) {
    const btnMobile = document.getElementById('btn-save-mobile');
    const btnFull = document.getElementById('btn-save-full');
    const btnRestore = document.getElementById('btn-restore-data');

    // Les boutons de sauvegarde s'activent si une carte est chargée
    if (btnMobile) btnMobile.disabled = !enabled;
    if (btnFull) btnFull.disabled = !enabled;

    // Le bouton Restaurer est TOUJOURS disponible sur PC
    if (btnRestore) btnRestore.disabled = false;
}

// --- INITIALISATION ---

async function loadDefaultMap() {
    // On récupère le nom du fichier (djerba.geojson)
    const fileName = 'djerba.geojson';
    const defaultMapUrl = import.meta.env.BASE_URL + fileName;

    if (DOM.loaderOverlay) DOM.loaderOverlay.style.display = 'flex';

    try {
        const response = await fetch(defaultMapUrl);
        if (!response.ok) throw new Error(`Erreur réseau: ${response.statusText}`);

        const geojsonData = await response.json();

        // --- 1. IDENTITÉ DYNAMIQUE ---
        // On enlève ".geojson" pour avoir "djerba"
        const mapId = fileName.split('.')[0];
        state.currentMapId = mapId;

        // Mise à jour du titre (ex: djerba -> Djerba)
        const formattedName = mapId.charAt(0).toUpperCase() + mapId.slice(1);
        document.title = `History Walk - ${formattedName}`;

        await saveAppState('lastMapId', mapId);

        // 2. Chargement Données Utilisateur
        try {
            const loadedData = await getAllPoiDataForMap('Djerba');
            if (loadedData) state.userData = loadedData;
        } catch (dbErr) {
            console.warn("Aucune donnée utilisateur antérieure ou erreur DB:", dbErr);
        }

        // 3. AFFICHAGE / CHARGEMENT (Branchement Mobile vs Desktop)
        if (isMobileView()) {
            // MODE MOBILE : On charge les données en mémoire SANS afficher la carte
            console.log("Mobile: Chargement données sans rendu carte.");
            state.loadedFeatures = geojsonData.features || [];
            // Sauvegarde pour persistance
            await saveAppState('lastGeoJSON', geojsonData);

            // On charge les circuits (si existants)
            try {
                state.myCircuits = await getAllCircuitsForMap('Djerba');
            } catch (e) { state.myCircuits = []; }

            setSaveButtonsState(true);
            switchMobileView('circuits'); // Force l'affichage immédiat

        } else {
            // MODE DESKTOP : On affiche la carte Leaflet
            await displayGeoJSON(geojsonData, 'Djerba');
            showToast('Carte de Djerba chargée par défaut.', 'success');
        }

        if (DOM.btnRestoreData) DOM.btnRestoreData.disabled = false;

    } catch (error) {
        console.error("Impossible de charger la carte par défaut:", error);
        showToast("Impossible de charger la carte.", 'error');
        setSaveButtonsState(false);
    } finally {
        if (DOM.loaderOverlay) DOM.loaderOverlay.style.display = 'none';
    }
}

async function initializeApp() {
    // 1. Initialisation de base
    const versionEl = document.getElementById('app-version');
    if (versionEl) versionEl.textContent = APP_VERSION;

    initializeDomReferences();
    setupCircuitEventListeners();
    setupEventBusListeners(); // <--- LISTENER EVENT BUS

    if (typeof createIcons === 'function') createIcons();

    if (typeof populateAddPoiModalCategories === 'function') {
        populateAddPoiModalCategories();
    }

    setupFileListeners();

    // 2. Mode Mobile ou Desktop
    if (isMobileView()) {
        initMobileMode();
    } else {
        initDesktopMode();
    }

    try {
        await initDB();

        const savedTheme = await getAppState('currentTheme');
        if (savedTheme) document.documentElement.setAttribute('data-theme', savedTheme);

        const lastMapId = await getAppState('lastMapId');
        const lastGeoJSON = await getAppState('lastGeoJSON');

        if (lastMapId && lastGeoJSON) {
            state.currentMapId = lastMapId;
            setSaveButtonsState(true);

            try {
                state.userData = await getAllPoiDataForMap(lastMapId) || {};
                state.myCircuits = await getAllCircuitsForMap(lastMapId) || [];
            } catch (e) { console.error("Erreur DB secondaire:", e); }

            // 3. Affichage de la carte
            if (isMobileView()) {
                state.loadedFeatures = lastGeoJSON.features || [];
                switchMobileView('circuits');
            } else {
                await displayGeoJSON(lastGeoJSON, lastMapId);

                // --- RESTAURATION SÉCURISÉE DU BROUILLON ---
                try {
                    const savedDraft = await getAppState('currentCircuit');
                    
                    if (savedDraft && savedDraft.length > 0) {
                        state.currentCircuit = savedDraft;
                        // On relance l'affichage du circuit avec nos NOUVELLES fonctions
                        setTimeout(() => {
                            if (typeof refreshCircuitDisplay === 'function') notifyCircuitChanged();;
                            if (typeof renderCircuitPanel === 'function') renderCircuitPanel();
                        }, 800);
                    }
                } catch (err) {
                    console.warn("Échec restauration brouillon:", err);
                }
            }

        } else {
            await loadDefaultMap();
        }

    } catch (error) {
        console.error("Échec init global:", error);
    }

    // --- 4. LA TOUR DE CONTRÔLE DES ÉVÉNEMENTS (C'est ICI que ça se place !) ---
    function setupGlobalEventListeners() {
        console.log("[Main] Branchement des boutons de la Tour de Contrôle...");

        // Bouton "Créer un circuit"
        const btnSelect = document.getElementById('btn-select-mode');
        if (btnSelect) {
            btnSelect.addEventListener('click', () => toggleSelectionMode());
        }

        // Bouton "Vider le circuit"
        const btnClear = document.getElementById('btn-clear-circuit');
        if (btnClear) {
            btnClear.addEventListener('click', () => clearCircuit(true));
        }

        // Bouton "Fermer le panneau"
        const btnClose = document.getElementById('close-circuit-panel-button');
        if (btnClose) {
            btnClose.addEventListener('click', async () => {
                if (state.currentCircuit.length > 0) {
                    if (await showConfirm("Fermeture", "Voulez-vous vraiment fermer et effacer le brouillon du circuit ?", "Fermer", "Annuler", true)) {
                        await clearCircuit(false);
                        toggleSelectionMode(false); // On force le mode OFF
                    }
                } else {
                    toggleSelectionMode(false);
                }
            });
        }
    }

    // On allume la tour de contrôle
    setupGlobalEventListeners();

    // 5. Relancer les icônes à la toute fin
    if (typeof createIcons === 'function') createIcons();

    // --- GESTION DE L'IMPORT URL (QR Code Universel) ---
    const urlParams = new URLSearchParams(window.location.search);
    const importIds = urlParams.get('import');
    const importName = urlParams.get('name');

    if (importIds) {
        console.log("Import circuit détecté via URL:", importIds);

        // Nettoyage de l'URL pour éviter le rechargement en boucle
        const newUrl = window.location.origin + window.location.pathname;
        window.history.replaceState({}, document.title, newUrl);

        // On attend un peu que tout soit chargé (Events, DB, Map/Mobile view)
        setTimeout(() => {
             import('./circuit.js').then(module => {
                 // On passe directement les IDs bruts, la fonction gère le fallback
                 module.loadCircuitFromIds(importIds, importName);
             });
        }, 500);
    }
}

function setupEventBusListeners() {
    console.log("[Main] Écoute des événements de données...");

    eventBus.on('data:filtered', (visibleFeatures) => {
        if (isMobileView()) {
            console.log(`[Main] Mise à jour Mobile : ${visibleFeatures.length} lieux.`);
            renderMobilePoiList(visibleFeatures);
        } else {
            console.log(`[Main] Mise à jour Desktop : ${visibleFeatures.length} lieux.`);
            refreshMapMarkers(visibleFeatures);
            populateZonesMenu();
        }
    });

    // --- Circuit Events (Controller Logic) ---
    eventBus.on('circuit:request-load', async (id) => {
        await loadCircuitById(id);
    });

    eventBus.on('circuit:request-delete', async (id) => {
        const result = await performCircuitDeletion(id);
        if (result.success) {
            showToast(result.message, 'success');
            eventBus.emit('circuit:list-updated');
        } else {
            showToast(result.message, 'error');
        }
    });

    eventBus.on('circuit:request-import', (id) => {
        state.circuitIdToImportFor = id;
        if(DOM.gpxImporter) DOM.gpxImporter.click();
    });

    eventBus.on('circuit:request-toggle-visited', async ({ id, isChecked }) => {
        const result = await toggleCircuitVisitedStatus(id, isChecked);
        if (result.success) {
             eventBus.emit('circuit:list-updated');
        }
    });

    eventBus.on('circuit:list-updated', () => {
        populateCircuitsMenu();
    });
}

async function initDesktopMode() {
    initMap(); // Leaflet
    if (typeof map !== 'undefined') {
        enableDesktopCreationMode();
        setupDesktopTools();
        setupSmartSearch();
    }
    setupDesktopUIListeners(); // Listeners spécifiques UI Desktop
    updateSelectionModeButton(state.isSelectionModeActive);
}

// --- NOUVEAU : Listeners pour Fichiers (Actifs Mobile & Desktop) ---
function setupFileListeners() {
    // Restauration (Backup)
    if (DOM.restoreLoader) {
        // Nettoyage préalable pour éviter les doublons si appel multiple
        DOM.restoreLoader.removeEventListener('change', handleRestoreFile);
        DOM.restoreLoader.addEventListener('change', handleRestoreFile);
    }

    // Bouton Menu Restauration (Corbeille)
    if (DOM.btnRestoreData) {
        DOM.btnRestoreData.addEventListener('click', () => {
            if (!DOM.btnRestoreData.disabled) openRestoreModal();
        });
    }

    // Import GeoJSON (Carte)
    if (DOM.geojsonLoader) {
        DOM.geojsonLoader.removeEventListener('change', handleFileLoad);
        DOM.geojsonLoader.addEventListener('change', handleFileLoad);
    }
    if (DOM.btnOpenGeojson) DOM.btnOpenGeojson.addEventListener('click', () => DOM.geojsonLoader.click());

    // Sauvegarde Mobile (Données uniquement)
    const btnSaveMobile = document.getElementById('btn-save-mobile');
    if (btnSaveMobile) {
        btnSaveMobile.addEventListener('click', () => {
            if (window.innerWidth > 768) {
                // SUR PC : On veut le téléchargement direct
                import('./fileManager.js').then(m => m.exportDataForMobilePC());
            } else {
                // SUR MOBILE : On garde le système de partage .txt
                saveUserData(false);
            }
        });
    }

    // Sauvegarde Full (Données + Photos)
    const btnSaveFull = document.getElementById('btn-save-full');
    if (btnSaveFull) {
        btnSaveFull.addEventListener('click', () => {
            if (window.innerWidth > 768) {
                // SUR PC : Fenêtre "Enregistrer sous" classique
                import('./fileManager.js').then(m => m.exportFullBackupPC());
            } else {
                saveUserData(true);
            }
        });
    }

    // Import Photos (Desktop specific input but safe to leave here or check ID)
    const photoLoader = document.getElementById('photo-gps-loader');
    if (photoLoader) photoLoader.addEventListener('change', handlePhotoImport);

    // Import GPX
    if (DOM.gpxImporter) DOM.gpxImporter.addEventListener('change', handleGpxFileImport);
}

// --- Listeners spécifiques Desktop (Carte, Tabs, Filtres visuels) ---
function setupDesktopUIListeners() {
    // Note: btnModeSelection est géré par setupDesktopTools pour le Wizard
    // if (DOM.btnMyCircuits) DOM.btnMyCircuits.addEventListener('click', openCircuitsModal); // REMPLACÉ PAR MENU DÉROULANT (ui.js)

    // Filtres : Gestion du bouton Catégories
    document.getElementById('btn-categories')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const cMenu = document.getElementById('categoriesMenu');
        if (cMenu) cMenu.style.display = cMenu.style.display === 'none' ? 'block' : 'none';
    });

    // Initialisation du menu
    populateCategoriesMenu();

    // Légende
    document.getElementById('btn-legend')?.addEventListener('click', () => {
        showLegendModal();
    });

    document.getElementById('btn-filter-vus')?.addEventListener('click', (e) => {
        const isActive = e.currentTarget.classList.toggle('active');
        state.activeFilters.vus = isActive;
        applyFilters();
    });

    document.getElementById('btn-filter-planifies')?.addEventListener('click', (e) => {
        const isActive = e.currentTarget.classList.toggle('active');
        state.activeFilters.planifies = isActive;
        applyFilters();
    });

    document.getElementById('btn-filter-zones')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const zMenu = document.getElementById('zonesMenu');
        if (zMenu) zMenu.style.display = zMenu.style.display === 'none' ? 'block' : 'none';
    });

    document.addEventListener('click', (e) => {
        // Fermeture Zones
        if (!e.target.closest('#btn-filter-zones') && !e.target.closest('#zonesMenu')) {
            const zonesMenu = document.getElementById('zonesMenu');
            if (zonesMenu) zonesMenu.style.display = 'none';
        }
        // Fermeture Catégories
        if (!e.target.closest('#btn-categories') && !e.target.closest('#categoriesMenu')) {
            const cMenu = document.getElementById('categoriesMenu');
            if (cMenu) cMenu.style.display = 'none';
        }
    });

    // Theme Selector
    const themeSelector = document.getElementById('btn-theme-selector');
    if (themeSelector) {
        themeSelector.addEventListener('click', () => {
            const themes = ['maritime', 'desert', 'oasis', 'night'];
            const currentTheme = document.documentElement.getAttribute('data-theme') || 'maritime';
            const currentIndex = themes.indexOf(currentTheme);
            const nextIndex = (currentIndex + 1) % themes.length;
            const nextTheme = themes[nextIndex];
            document.documentElement.setAttribute('data-theme', nextTheme);
            saveAppState('currentTheme', nextTheme);
        });
    }

    // Search Desktop
    if (DOM.searchInput) DOM.searchInput.addEventListener('input', setupSearch);
    document.addEventListener('click', (e) => {
        if (DOM.searchResults && !e.target.closest('.search-container')) {
            DOM.searchResults.style.display = 'none';
        }
    });

    setupTabs();

    // LISTENER REMOVED - handled by ui-circuit-list.js

    // Import Photos bouton Desktop
    const btnImportPhotos = document.getElementById('btn-import-photos');
    const photoLoader = document.getElementById('photo-gps-loader');
    if (btnImportPhotos && photoLoader) {
        btnImportPhotos.addEventListener('click', () => photoLoader.click());
    }
}

document.addEventListener('DOMContentLoaded', initializeApp);

// Fonction globale suppression (inchangée)
window.requestSoftDelete = async function (idOrIndex) {
    let feature;
    if (typeof idOrIndex === 'number' && state.loadedFeatures[idOrIndex]) {
        feature = state.loadedFeatures[idOrIndex];
    } else {
        feature = state.loadedFeatures[state.currentFeatureId];
    }
    if (!feature) return;

    let poiId;
    try { poiId = getPoiId(feature); } catch (e) { poiId = feature.properties.HW_ID || feature.id; }
    const poiName = feature.properties['Nom du site FR'] || feature.properties['Nom du site AR'] || "ce lieu";

    const msg = isMobileView()
        ? `ATTENTION !\n\nVoulez-vous vraiment placer "${poiName}" dans la corbeille ?`
        : `ATTENTION !\n\nVoulez-vous vraiment signaler "${poiName}" pour suppression ?`;

    if (await showConfirm("Suppression", msg, "Supprimer", "Garder", true)) {
        if (!state.hiddenPoiIds) state.hiddenPoiIds = [];
        if (!state.hiddenPoiIds.includes(poiId)) {
            state.hiddenPoiIds.push(poiId);
        }
        await saveAppState(`hiddenPois_${state.currentMapId}`, state.hiddenPoiIds);
        if (typeof closeDetailsPanel === 'function') closeDetailsPanel(true);

        // Refresh selon mode
        if (isMobileView()) {
            switchMobileView('circuits'); // Refresh liste
        } else {
            if (typeof applyFilters === 'function') applyFilters();
        }
    }
};

import { registerSW } from 'virtual:pwa-register';

// SW Registration (Géré par Vite PWA)
const updateSW = registerSW({
    onNeedRefresh() {
        console.log("Nouvelle version disponible !");
    },
    onOfflineReady() {
        console.log("Application prête pour le mode hors-ligne !");
    },
});
