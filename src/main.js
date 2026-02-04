// main.js
import { initDB, getAppState, saveAppState, getAllPoiDataForMap, getAllCircuitsForMap } from './database.js';
import { APP_VERSION, state } from './state.js';
import { initMap, map, refreshMapMarkers } from './map.js';
import { eventBus } from './events.js';
import { createIcons, icons } from 'lucide';
import {
    initializeDomReferences,
    setupTabs,
    DOM,
    openCircuitsModal,
    closeCircuitsModal,
    populateZonesMenu,
    populateCategoriesMenu,
    openDetailsPanel,
    closeDetailsPanel,
    populateAddPoiModalCategories,
    showLegendModal,
    openRestoreModal,
    updateSelectionModeButton,
    populateCircuitsMenu,
    closeAllDropdowns
} from './ui.js';
import { showToast } from './toast.js';

import {
    toggleSelectionMode,
    clearCircuit,
    setupCircuitEventListeners,
    loadCircuitById,
    loadCircuitDraft
} from './circuit.js';

import { performCircuitDeletion, toggleCircuitVisitedStatus } from './circuit-actions.js';

import { displayGeoJSON, applyFilters, getPoiId } from './data.js';
import { isMobileView, initMobileMode, switchMobileView, renderMobilePoiList } from './mobile.js';

import { handleFileLoad, handleGpxFileImport, handlePhotoImport, saveUserData, handleRestoreFile, exportOfficialCircuitsJSON } from './fileManager.js';
import { setupSearch, setupSmartSearch } from './searchManager.js';
import { enableDesktopCreationMode, setupDesktopTools } from './desktopMode.js';
import { showConfirm } from './modal.js';
import { initAdminMode } from './admin.js';

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

// --- PROTECTION CONTRE LA PERTE DE DONNÉES (WORKFLOW) ---
function setupUnsavedChangesWarning() {
    window.addEventListener('beforeunload', (e) => {
        // On vérifie si state.hasUnexportedChanges existe et est vrai
        if (state.hasUnexportedChanges) {
            // Le message standard n'est plus affiché par les navigateurs modernes,
            // mais setting returnValue déclenche la modale native.
            e.preventDefault();
            e.returnValue = '';
        }
    });
}

function updateAppTitle(mapId) {
    if (!mapId) return;
    const mapName = mapId.charAt(0).toUpperCase() + mapId.slice(1);
    const title = `History Walk - ${mapName}`;
    document.title = title;
    const appTitle = document.getElementById('app-title');
    if (appTitle) appTitle.textContent = title;
}

async function mergeOfficialCircuits() {
    // SÉCURITÉ : On ne charge les circuits officiels (Djerba) que si on est sur la carte Djerba
    // TODO: À l'avenir, structurer circuits.json pour supporter plusieurs cartes
    if (state.currentMapId !== 'djerba') {
        console.log(`[Main] Carte '${state.currentMapId}' active : Ignore les circuits officiels (Djerba).`);
        return;
    }

    try {
        const response = await fetch('./circuits/circuits.json');
        if (response.ok) {
            const officials = await response.json();

            if (!state.myCircuits) state.myCircuits = [];

            officials.forEach(off => {
                // Fusion intelligente : on n'ajoute que ceux qui n'existent pas déjà (basé sur le nom)
                const exists = state.myCircuits.some(c => c.name === off.name);
                if (!exists) {
                     const localCopy = { ...off, id: `imported_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, isOfficial: false };
                     state.myCircuits.push(localCopy);
                }
            });

            console.log(`[Main] Circuits officiels fusionnés dans les circuits locaux.`);
            import('./events.js').then(({ eventBus }) => eventBus.emit('circuit:list-updated'));
        }
    } catch (e) {
        console.warn("[Main] Impossible de charger les circuits officiels :", e);
    }
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
        updateAppTitle(mapId);

        await saveAppState('lastMapId', mapId);

        // 2. Chargement Données Utilisateur & Circuits (UNIFIÉ)
        try {
            state.userData = await getAllPoiDataForMap(mapId) || {};
            state.myCircuits = await getAllCircuitsForMap(mapId) || [];
            await mergeOfficialCircuits(); // Fusion immédiate
        } catch (dbErr) {
            console.warn("Aucune donnée utilisateur antérieure ou erreur DB:", dbErr);
            state.myCircuits = [];
        }

        // 3. AFFICHAGE / CHARGEMENT (Branchement Mobile vs Desktop)
        if (isMobileView()) {
            // MODE MOBILE : On charge les données en mémoire SANS afficher la carte
            console.log("Mobile: Chargement données sans rendu carte.");
            state.loadedFeatures = geojsonData.features || [];
            // Sauvegarde pour persistance
            await saveAppState('lastGeoJSON', geojsonData);

            setSaveButtonsState(true);
            switchMobileView('circuits'); // Force l'affichage immédiat

        } else {
            // MODE DESKTOP : On affiche la carte Leaflet
            await displayGeoJSON(geojsonData, mapId);
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
    // 0. Détection Mode Admin (God Mode)
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('mode') === 'admin' || urlParams.get('admin') === 'true') {
        state.isAdmin = true;
        console.warn("🛡️ GOD MODE ACTIVATED (ADMIN) 🛡️");
        document.body.classList.add('admin-mode'); // Pour usage CSS éventuel
        if (DOM.appTitle) DOM.appTitle.textContent += " (Admin)";
    }

    // 1. Initialisation de base
    const versionEl = document.getElementById('app-version');
    if (versionEl) versionEl.textContent = APP_VERSION;

    initAdminMode(); // Initialisation des écouteurs Admin (God Mode)
    initializeDomReferences();
    setupCircuitEventListeners();
    setupEventBusListeners(); // <--- LISTENER EVENT BUS

    createIcons({ icons });

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
            updateAppTitle(lastMapId);
            setSaveButtonsState(true);

            try {
                state.userData = await getAllPoiDataForMap(lastMapId) || {};
                state.myCircuits = await getAllCircuitsForMap(lastMapId) || [];
                await mergeOfficialCircuits(); // Fusion immédiate
            } catch (e) { console.error("Erreur DB secondaire:", e); }

            // 3. Affichage de la carte
            if (isMobileView()) {
                state.loadedFeatures = lastGeoJSON.features || [];
                switchMobileView('circuits');
            } else {
                await displayGeoJSON(lastGeoJSON, lastMapId);

                // Si on recharge une carte autre que Djerba, on ajuste la vue
                if (lastMapId !== 'djerba') {
                     import('./map.js').then(m => m.fitMapToContent());
                }

                // --- RESTAURATION SÉCURISÉE DU BROUILLON ---
                try {
                    await loadCircuitDraft();
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

    // Theme Selector (Always active)
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

    // On allume la tour de contrôle
    setupGlobalEventListeners();
    setupUnsavedChangesWarning(); // <--- AJOUT DE LA PROTECTION

    // 5. Relancer les icônes à la toute fin
    createIcons({ icons });

    // --- GESTION DE L'IMPORT URL (QR Code Universel) ---
    // Note: urlParams est déjà déclaré au début de initializeApp
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
    // La sidebar est visible par défaut sur Desktop (Explorer)
    document.body.classList.add('sidebar-open');

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

    // Sauvegarde Données (Données uniquement) - Ancien "Mobile"
    const btnSaveMobile = document.getElementById('btn-save-mobile');
    if (btnSaveMobile) {
        // Mise à jour du texte si possible
        // if (btnSaveMobile.querySelector('span')) btnSaveMobile.querySelector('span').textContent = "Sauvegarde Données";

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

    // NOUVEAU : Sauvegarde Circuits (JSON Officiel)
    const btnSaveCircuits = document.getElementById('btn-save-circuits');
    if (btnSaveCircuits) {
        btnSaveCircuits.addEventListener('click', () => {
            exportOfficialCircuitsJSON();
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
        if (cMenu) {
            const isVisible = cMenu.style.display === 'block';
            closeAllDropdowns();
            if (!isVisible) cMenu.style.display = 'block';
        }
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
        if (zMenu) {
            const isVisible = zMenu.style.display === 'block';
            closeAllDropdowns();
            if (!isVisible) zMenu.style.display = 'block';
        }
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
