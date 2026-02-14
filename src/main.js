// main.js
import { initDB, getAppState, saveAppState, getAllPoiDataForMap, getAllCircuitsForMap, deleteCircuitById } from './database.js';
import { APP_VERSION, state } from './state.js';
import { initMap, map, refreshMapMarkers } from './map.js';
import { eventBus } from './events.js';
import { createIcons, icons } from 'lucide';
import {
    initializeDomReferences,
    DOM,
    populateZonesMenu,
    populateCategoriesMenu,
    openDetailsPanel,
    closeDetailsPanel,
    populateAddPoiModalCategories,
    showLegendModal,
    openRestoreModal,
    updateSelectionModeButton,
    populateCircuitsMenu,
    closeAllDropdowns,
    updateExportButtonLabel
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

import {
    handleFileLoad,
    handleGpxFileImport,
    handlePhotoImport,
    saveUserData,
    handleRestoreFile,
    exportOfficialCircuitsJSON,
    exportDataForMobilePC,
    exportFullBackupPC
} from './fileManager.js';
import { setupSearch, setupSmartSearch } from './searchManager.js';
import { enableDesktopCreationMode, setupDesktopTools } from './desktopMode.js';
import { showConfirm } from './modal.js';
import { initAdminMode } from './admin.js';
import { generateSyncQR, startGenericScanner } from './sync.js';
import { setupTabs } from './ui-sidebar.js';

// --- FONCTION UTILITAIRE : Gestion des boutons de sauvegarde ---
function setSaveButtonsState(enabled) {
    const btnBackup = document.getElementById('btn-open-backup-modal');
    const btnRestore = document.getElementById('btn-restore-data');

    // Le bouton de sauvegarde s'active si une carte est chargée
    if (btnBackup) btnBackup.disabled = !enabled;

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

    updateExportButtonLabel(mapId);
}

async function loadOfficialCircuits() {
    // SÉCURITÉ : Chargement dynamique selon la carte active (ex: circuits/djerba.json)
    const mapId = state.currentMapId || 'djerba';
    const circuitsUrl = `./circuits/${mapId}.json`;

    try {
        const response = await fetch(circuitsUrl);
        if (response.ok) {
            const officials = await response.json();

            // CLEAN SLATE : On charge dans state.officialCircuits, PAS dans state.myCircuits
            // Cela évite de polluer les sauvegardes utilisateur avec des données statiques.
            state.officialCircuits = officials.map(off => ({
                ...off,
                isOfficial: true,
                // On s'assure d'avoir un ID unique s'il n'est pas fourni (bien que le générateur JSON le fasse déjà)
                id: off.id || `official_${off.name.replace(/\s+/g, '_')}`
            }));

            console.log(`[Main] ${state.officialCircuits.length} circuits officiels chargés.`);
            import('./events.js').then(({ eventBus }) => eventBus.emit('circuit:list-updated'));
        } else {
             console.log(`[Main] Pas de circuits officiels trouvés pour '${mapId}' (Fichier manquant ou 404).`);
             state.officialCircuits = [];
        }
    } catch (e) {
        console.warn(`[Main] Erreur lors du chargement des circuits officiels pour ${mapId} :`, e);
        state.officialCircuits = [];
    }
}

// --- INITIALISATION ---

async function loadDestinationsConfig() {
    const baseUrl = import.meta.env?.BASE_URL || './';
    const configUrl = baseUrl + 'destinations.json';

    // NOTE: state.destinations est déjà initialisé dans state.js avec une structure par défaut.
    // On ne fait que mettre à jour SI le chargement réussit.

    try {
        const response = await fetch(configUrl);
        if (response.ok) {
            const json = await response.json();
            // Mise à jour de l'état global
            state.destinations = json;
            console.log("[Config] destinations.json chargé avec succès.", state.destinations);
        } else {
            console.warn(`[Config] destinations.json introuvable (${response.status}). Utilisation de la configuration par défaut en mémoire.`);
        }
    } catch (e) {
        console.error("[Config] Erreur chargement destinations.json (Reseau/Parse). Conservation défaut.", e);
    }
}

async function loadDefaultMap() {
    // 0. Chargement de la config des destinations
    await loadDestinationsConfig();

    const baseUrl = import.meta.env?.BASE_URL || './';

    // Détermination de la carte active
    let activeMapId = 'djerba'; // Défaut
    let startView = null;

    if (state.destinations) {
        // Priorité : URL Param > Config active > Djerba
        const urlParams = new URLSearchParams(window.location.search);
        const urlMapId = urlParams.get('map');

        if (urlMapId && state.destinations.maps[urlMapId]) {
            activeMapId = urlMapId;
        } else if (state.destinations.activeMapId && state.destinations.maps[state.destinations.activeMapId]) {
            activeMapId = state.destinations.activeMapId;
        }

        // Récupération de la vue de départ si dispo
        if (state.destinations.maps[activeMapId] && state.destinations.maps[activeMapId].startView) {
            startView = state.destinations.maps[activeMapId].startView;
        }
    }

    // Nom du fichier GeoJSON (supposé correspondre à l'ID ou défini dans la config)
    let fileName = `${activeMapId}.geojson`;
    if (state.destinations && state.destinations.maps[activeMapId] && state.destinations.maps[activeMapId].file) {
        fileName = state.destinations.maps[activeMapId].file;
    }

    const defaultMapUrl = baseUrl + fileName;

    if (DOM.loaderOverlay) DOM.loaderOverlay.style.display = 'flex';

    try {
        const response = await fetch(defaultMapUrl);
        if (!response.ok) throw new Error(`Erreur réseau: ${response.statusText}`);

        const geojsonData = await response.json();

        // --- 1. IDENTITÉ DYNAMIQUE ---
        state.currentMapId = activeMapId;
        updateAppTitle(activeMapId);

        await saveAppState('lastMapId', activeMapId);

        // 2. Chargement Données Utilisateur & Circuits (UNIFIÉ)
        try {
            state.userData = await getAllPoiDataForMap(activeMapId) || {};
            state.myCircuits = await getAllCircuitsForMap(activeMapId) || [];
            state.officialCircuitsStatus = await getAppState(`official_circuits_status_${activeMapId}`) || {};
            await loadOfficialCircuits(); // Chargement séparé

            // --- NETTOYAGE AUTOMATIQUE DES FANTÔMES (Correction "Multiplication" & "0 POI") ---
            // On supprime de la DB tout circuit qui est marqué "isOfficial" (doublon obsolète)
            // ou qui est vide (bug de création).
            const validCircuits = [];
            for (const c of state.myCircuits) {
                let toDelete = false;

                if (c.isOfficial) {
                    console.warn(`[Cleanup] Suppression du circuit officiel fantôme (DB) : ${c.name} (${c.id})`);
                    toDelete = true;
                } else if (!c.poiIds || c.poiIds.length === 0) {
                     // On garde les brouillons temporaires non sauvegardés (ID temporaire ?)
                     // Non, ici on vient de la DB, donc c'est persistant.
                     console.warn(`[Cleanup] Suppression du circuit vide (0 POI) : ${c.name} (${c.id})`);
                     toDelete = true;
                }

                if (toDelete) {
                    await deleteCircuitById(c.id);
                } else {
                    validCircuits.push(c);
                }
            }
            state.myCircuits = validCircuits;

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
            await displayGeoJSON(geojsonData, activeMapId);

            // Initialisation de la vue (Centre/Zoom) selon la config destinations.json
            // Uniquement si on vient de charger une nouvelle carte (pas de restauration d'état précédente ici)
            // Note: displayGeoJSON ne change pas la vue si la carte est déjà init.
            // On force ici si startView est défini.
            if (startView) {
                // On importe map dynamiquement au cas où
                import('./map.js').then(({ map }) => {
                    if (map) {
                        map.setView(startView.center, startView.zoom);
                    }
                });
            }

            // Rafraîchir la liste des circuits maintenant que les features sont chargées (pour calcul Visité/Distance)
            import('./events.js').then(({ eventBus }) => eventBus.emit('circuit:list-updated'));
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
    // 0. Vérification Version (Cold Start Fix)
    const storedVersion = localStorage.getItem('hw_app_version');
    if (storedVersion !== APP_VERSION) {
        console.log(`[Version] Mise à jour détectée : ${storedVersion} -> ${APP_VERSION}`);
        localStorage.setItem('hw_app_version', APP_VERSION);
        // Si ce n'est pas la première installation (donc storedVersion existe), on recharge pour purger
        if (storedVersion) {
            console.log("[Version] Rechargement forcé pour appliquer le nouveau design.");
            // Petit délai pour laisser le temps au localStorage de s'écrire
            setTimeout(() => {
                window.location.reload(true);
            }, 100);
            return;
        }
    } else {
        // Au cas où storedVersion n'existe pas encore (premier lancement propre de cette version)
        if (!storedVersion) {
            localStorage.setItem('hw_app_version', APP_VERSION);
        }
    }

    // 0. Détection Mode Admin (God Mode)
    const urlParams = new URLSearchParams(window.location.search);
    console.log("[Main] Checking Admin Mode. Params:", window.location.search);
    if (urlParams.get('mode') === 'admin' || urlParams.get('admin') === 'true') {
        state.isAdmin = true;
        console.warn("🛡️ GOD MODE ACTIVATED (ADMIN) 🛡️");
        document.body.classList.add('admin-mode'); // Pour usage CSS éventuel
        if (DOM.appTitle) DOM.appTitle.textContent += " (Admin)";
    }

    // 1. Initialisation de base
    const versionEl = document.getElementById('app-version');
    if (versionEl) {
        versionEl.textContent = APP_VERSION;

        // GOD MODE TRIGGER (7 Clicks)
        let clickCount = 0;
        let clickTimeout;
        versionEl.addEventListener('click', () => {
            clickCount++;
            clearTimeout(clickTimeout);

            if (clickCount >= 7) {
                state.isAdmin = !state.isAdmin;
                showToast(`Mode GOD : ${state.isAdmin ? 'ACTIVÉ' : 'DÉSACTIVÉ'}`, state.isAdmin ? 'success' : 'info');
                import('./events.js').then(({ eventBus }) => eventBus.emit('admin:mode-toggled', state.isAdmin));
                clickCount = 0;
            } else {
                clickTimeout = setTimeout(() => { clickCount = 0; }, 2000);
            }
        });
        versionEl.style.cursor = 'pointer';
        versionEl.title = "Cliquez 7 fois pour le mode Admin";
    }

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

        // 0. Chargement de la configuration des destinations (CRITIQUE pour le centrage)
        // On le fait ICI pour qu'il soit disponible lors de la restauration d'état
        await loadDestinationsConfig();

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
                state.officialCircuitsStatus = await getAppState(`official_circuits_status_${lastMapId}`) || {};
                await loadOfficialCircuits(); // Chargement séparé
            } catch (e) { console.error("Erreur DB secondaire:", e); }

            // 3. Affichage de la carte
            if (isMobileView()) {
                state.loadedFeatures = lastGeoJSON.features || [];
                switchMobileView('circuits');
            } else {
                await displayGeoJSON(lastGeoJSON, lastMapId);

                // On ajuste la vue selon la configuration (MÊME pour Djerba !)
                import('./map.js').then(m => m.fitMapToContent());

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

        // Bouton "Créer un circuit" (Géré par desktopMode.js via btn-mode-selection)
        // L'ancien btn-select-mode n'existe plus dans le DOM

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
            populateCategoriesMenu();
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
    // --- STABILISATION DE L'AFFICHAGE ---
    // On ouvre la sidebar AVANT d'initialiser la carte.
    // Ainsi, le conteneur #map a déjà sa taille finale (réduite par la sidebar).
    // Quand Leaflet s'initialise, il prend directement les bonnes dimensions
    // et centre la carte correctement, sans "saut" ni rétrécissement.
    document.body.classList.add('sidebar-open');

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

    // Sauvegarde Données (Données uniquement) - Ancien "Mobile"
    const btnSaveMobile = document.getElementById('btn-save-mobile');
    if (btnSaveMobile) {
        // Mise à jour du texte si possible
        // if (btnSaveMobile.querySelector('span')) btnSaveMobile.querySelector('span').textContent = "Sauvegarde Données";

        btnSaveMobile.addEventListener('click', () => {
            if (window.innerWidth > 768) {
                // SUR PC : On veut le téléchargement direct
                exportDataForMobilePC();
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
                exportFullBackupPC();
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
        const btn = e.currentTarget;
        const isActive = btn.classList.toggle('active');
        state.activeFilters.vus = isActive;
        btn.title = isActive ? "Masquer les visités" : "Afficher les visités";
        applyFilters();
    });

    document.getElementById('btn-filter-planifies')?.addEventListener('click', (e) => {
        const btn = e.currentTarget;
        const isActive = btn.classList.toggle('active');
        state.activeFilters.planifies = isActive;
        btn.title = isActive ? "Masquer les planifiés" : "Afficher les planifiés";
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
        // Fermeture Tools Menu
        if (!e.target.closest('#btn-tools-menu') && !e.target.closest('#tools-menu-content')) {
            const tMenu = document.getElementById('tools-menu-content');
            if (tMenu) tMenu.classList.remove('active');
        }
        // Fermeture Admin Menu
        if (!e.target.closest('#btn-admin-menu') && !e.target.closest('#admin-menu-content')) {
            const aMenu = document.getElementById('admin-menu-content');
            if (aMenu) aMenu.classList.remove('active');
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

    // --- SYNC / SCANNER (Desktop) ---
    // SUPPRESSION DEMANDÉE : On retire les boutons Scanner et Sync Share du Desktop
    const btnSyncScan = document.getElementById('btn-sync-scan');
    if (btnSyncScan) btnSyncScan.style.display = 'none';

    const btnSyncShare = document.getElementById('btn-sync-share');
    if (btnSyncShare) btnSyncShare.style.display = 'none';
}

document.addEventListener('DOMContentLoaded', initializeApp);

import { registerSW } from 'virtual:pwa-register';

// SW Registration (Géré par Vite PWA)
const updateSW = registerSW({
    onNeedRefresh() {
        console.log("Nouvelle version disponible ! Mise à jour en cours...");
        // Force la mise à jour sans demander à l'utilisateur
        updateSW(true);
    },
    onOfflineReady() {
        console.log("Application prête pour le mode hors-ligne !");
    },
});
