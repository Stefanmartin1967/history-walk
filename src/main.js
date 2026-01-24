// main.js
import { initDB, getAppState, saveAppState, getAllPoiDataForMap, getAllCircuitsForMap } from './database.js';
import { APP_VERSION, state } from './state.js';
import { initMap, map } from './map.js';
import {
    initializeDomReferences,
    setupTabs,
    DOM,
    openCircuitsModal,
    closeCircuitsModal,
    handleCircuitsListClick,
    showToast,
    populateZonesMenu,
    closeDetailsPanel,
    populateAddPoiModalCategories
} from './ui.js';

import {
    toggleSelectionMode,
    setupCircuitPanelEventListeners
} from './circuit.js';

import { displayGeoJSON, applyFilters, getPoiId } from './data.js';
import { isMobileView, initMobileMode, switchMobileView } from './mobile.js';

import { handleFileLoad, handleGpxFileImport, handlePhotoImport, saveUserData, handleRestoreFile } from './fileManager.js';
import { setupSearch, setupSmartSearch } from './searchManager.js';
import { enableDesktopCreationMode } from './desktopMode.js';

// --- FONCTION UTILITAIRE : Gestion des boutons de sauvegarde ---
function setSaveButtonsState(enabled) {
    const btnMobile = document.getElementById('btn-save-mobile');
    const btnFull = document.getElementById('btn-save-full');
    
    if (btnMobile) btnMobile.disabled = !enabled;
    if (btnFull) btnFull.disabled = !enabled;
}

// --- INITIALISATION ---

async function loadDefaultMap() {
    const defaultMapUrl = import.meta.env.BASE_URL + 'djerba.geojson';
    if(DOM.loaderOverlay) DOM.loaderOverlay.style.display = 'flex';

    try {
        const response = await fetch(defaultMapUrl);
        if (!response.ok) throw new Error(`Erreur réseau: ${response.statusText}`);
        
        const geojsonData = await response.json();
        
        // 1. Identité Carte
        state.currentMapId = 'Djerba'; 
        await saveAppState('lastMapId', 'Djerba'); 

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

        if(DOM.btnRestoreData) DOM.btnRestoreData.disabled = false;

    } catch (error) {
        console.error("Impossible de charger la carte par défaut:", error);
        showToast("Impossible de charger la carte.", 'error');
        setSaveButtonsState(false);
    } finally {
        if(DOM.loaderOverlay) DOM.loaderOverlay.style.display = 'none';
    }
}

async function initializeApp() {
    const versionEl = document.getElementById('app-version');
    if(versionEl) versionEl.textContent = APP_VERSION;
    
    initializeDomReferences();
    
    if(typeof populateAddPoiModalCategories === 'function') {
        populateAddPoiModalCategories();
    }

    // --- 1. SETUP DES LISTENERS GLOBAUX (CRUCIAL POUR MOBILE) ---
    // On les branche AVANT de décider du mode, pour être sûr que les boutons fichiers marchent
    setupFileListeners();

    // --- 2. DÉTECTION DU MODE ---
    if (isMobileView()) {
        console.log("Démarrage en mode MOBILE");
        initMobileMode();
    } else {
        console.log("Démarrage en mode DESKTOP");
        initDesktopMode();
    }

    try {
        await initDB();
        
        const savedTheme = await getAppState('currentTheme');
        if (savedTheme) document.documentElement.setAttribute('data-theme', savedTheme);

        // Chargement des données (Carte ou Sauvegarde)
        const lastMapId = await getAppState('lastMapId');
        const lastGeoJSON = await getAppState('lastGeoJSON');
        
        if (lastMapId && lastGeoJSON) {
            setSaveButtonsState(true);
            if(DOM.btnRestoreData) DOM.btnRestoreData.disabled = false;
            
            state.currentMapId = lastMapId;

            // Charge UserData
            try {
                const loadedData = await getAllPoiDataForMap(lastMapId);
                if (loadedData) state.userData = loadedData;
           } catch (dbErr) { console.warn(dbErr); }

           // Charge Circuits
            try {
                state.myCircuits = await getAllCircuitsForMap(lastMapId);
            } catch (err) { state.myCircuits = []; }

            // BRANCHEMENT AFFICHAGE
            if (isMobileView()) {
                console.log("Mobile: Restauration état sans carte.");
                state.loadedFeatures = lastGeoJSON.features || [];
                switchMobileView('circuits');
            } else {
                await displayGeoJSON(lastGeoJSON, lastMapId);
            }
            
        } else {
            await loadDefaultMap();
        }

    } catch (error) {
        console.error("Échec init:", error);
        showToast("Erreur d'initialisation", "error");
    }
}

async function initDesktopMode() {
    initMap(); // Leaflet
    if (typeof map !== 'undefined') {
        enableDesktopCreationMode(); 
        setupSmartSearch();          
    }
    setupDesktopUIListeners(); // Listeners spécifiques UI Desktop
}

// --- NOUVEAU : Listeners pour Fichiers (Actifs Mobile & Desktop) ---
function setupFileListeners() {
    // Restauration (Backup)
    if(DOM.restoreLoader) {
        // Nettoyage préalable pour éviter les doublons si appel multiple
        DOM.restoreLoader.removeEventListener('change', handleRestoreFile);
        DOM.restoreLoader.addEventListener('change', handleRestoreFile);
    }
    
    // Bouton Menu Restauration
    if(DOM.btnRestoreData) {
        DOM.btnRestoreData.addEventListener('click', () => {
            if (!DOM.btnRestoreData.disabled) DOM.restoreLoader.click();
        });
    }

    // Import GeoJSON (Carte)
    if(DOM.geojsonLoader) {
        DOM.geojsonLoader.removeEventListener('change', handleFileLoad);
        DOM.geojsonLoader.addEventListener('change', handleFileLoad);
    }
    if(DOM.btnOpenGeojson) DOM.btnOpenGeojson.addEventListener('click', () => DOM.geojsonLoader.click());

    // Sauvegarde Mobile
    const btnSaveMobile = document.getElementById('btn-save-mobile');
    if (btnSaveMobile) btnSaveMobile.addEventListener('click', () => saveUserData(false));

    // Sauvegarde Full
    const btnSaveFull = document.getElementById('btn-save-full');
    if (btnSaveFull) btnSaveFull.addEventListener('click', () => saveUserData(true));

    // Import Photos (Desktop specific input but safe to leave here or check ID)
    const photoLoader = document.getElementById('photo-gps-loader');
    if (photoLoader) photoLoader.addEventListener('change', handlePhotoImport);
    
    // Import GPX
    if(DOM.gpxImporter) DOM.gpxImporter.addEventListener('change', handleGpxFileImport);
}

// --- Listeners spécifiques Desktop (Carte, Tabs, Filtres visuels) ---
function setupDesktopUIListeners() {
    if(DOM.btnModeSelection) DOM.btnModeSelection.addEventListener('click', toggleSelectionMode);
    if(DOM.btnMyCircuits) DOM.btnMyCircuits.addEventListener('click', openCircuitsModal);
    
    // Filtres
    document.getElementById('btn-filter-mosquees')?.addEventListener('click', (e) => {
        const isActive = e.currentTarget.classList.toggle('active');
        state.activeFilters.mosquees = isActive;
        applyFilters();
        populateZonesMenu();
    });
    // ... (Autres filtres identiques à avant) ...
    document.getElementById('btn-filter-vus')?.addEventListener('click', (e) => {
        const isActive = e.currentTarget.classList.toggle('active');
        state.activeFilters.vus = isActive;
        applyFilters();
        populateZonesMenu();
    });
    document.getElementById('btn-filter-planifies')?.addEventListener('click', (e) => {
        const isActive = e.currentTarget.classList.toggle('active');
        state.activeFilters.planifies = isActive;
        applyFilters();
        populateZonesMenu();
    });

    document.getElementById('btn-filter-zones')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const zMenu = document.getElementById('zonesMenu');
        if(zMenu) zMenu.style.display = zMenu.style.display === 'none' ? 'block' : 'none';
    });
    
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.zones-container')) {
            const zonesMenu = document.getElementById('zonesMenu');
            if (zonesMenu) zonesMenu.style.display = 'none';
        }
    });

    // Theme Selector
    const themeSelector = document.getElementById('btn-theme-selector');
    if(themeSelector) {
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
    if(DOM.searchInput) DOM.searchInput.addEventListener('input', setupSearch);
    document.addEventListener('click', (e) => {
        if (DOM.searchResults && !e.target.closest('.search-container')) {
            DOM.searchResults.style.display = 'none';
        }
    });
    
    setupTabs();
    setupCircuitPanelEventListeners();
    
    if(DOM.closeCircuitsModal) DOM.closeCircuitsModal.addEventListener('click', closeCircuitsModal);
    if(DOM.circuitsModal) DOM.circuitsModal.addEventListener('click', (e) => {
        if (e.target === DOM.circuitsModal) closeCircuitsModal();
    });
    if(DOM.circuitsListContainer) DOM.circuitsListContainer.addEventListener('click', handleCircuitsListClick);

    // Import Photos bouton Desktop
    const btnImportPhotos = document.getElementById('btn-import-photos');
    const photoLoader = document.getElementById('photo-gps-loader');
    if (btnImportPhotos && photoLoader) {
        btnImportPhotos.addEventListener('click', () => photoLoader.click());
    }
}

document.addEventListener('DOMContentLoaded', initializeApp);

// Fonction globale suppression (inchangée)
window.requestSoftDelete = async function(idOrIndex) {
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

    if (confirm(msg)) {
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