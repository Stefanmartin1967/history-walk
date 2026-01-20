// main.js - Version corrigée : Chargement DB avant Affichage Carte
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

import { displayGeoJSON, applyFilters, getPoiId, getPoiName } from './data.js';
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
        
        // 1. D'ABORD : On définit l'identité de la carte
        state.currentMapId = 'Djerba'; 
        await saveAppState('lastMapId', 'Djerba'); 

        // 2. ENSUITE : On va chercher les photos/données dans le coffre-fort
        try {
            const loadedData = await getAllPoiDataForMap('Djerba');
            if (loadedData) {
                state.userData = loadedData;
                console.log("Données utilisateur (Photos/Notes) chargées en mémoire.");
            }
        } catch (dbErr) {
            console.warn("Aucune donnée utilisateur antérieure ou erreur DB:", dbErr);
        }

        // 3. ENFIN : On affiche la carte (qui pourra voir les photos chargées juste avant)
        await displayGeoJSON(geojsonData, 'Djerba');

        setSaveButtonsState(true);
        if(DOM.btnRestoreData) DOM.btnRestoreData.disabled = false;

        if (!isMobileView()) {
            showToast('Carte de Djerba chargée par défaut.', 'success');
        } else {
            switchMobileView('circuits');
        }

    } catch (error) {
        console.error("Impossible de charger la carte par défaut:", error);
        showToast("Impossible de charger la carte.", 'error');
        setSaveButtonsState(false);
        if(DOM.btnRestoreData) DOM.btnRestoreData.disabled = true;
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

    // --- 1. DÉTECTION DU MODE ---
    if (isMobileView()) {
        console.log("Démarrage en mode MOBILE");
        initMobileMode();
    } else {
        console.log("Démarrage en mode DESKTOP");
        initDesktopMode();
    }

    // --- 2. GESTION DU REDIMENSIONNEMENT ---
    let initialModeIsMobile = isMobileView();
    window.addEventListener('resize', () => {
        const currentModeIsMobile = isMobileView();
        if (currentModeIsMobile !== initialModeIsMobile) {
            console.warn("Changement de mode détecté.");
        }
    });

    try {
        await initDB();
        
        const savedTheme = await getAppState('currentTheme');
        if (savedTheme) {
            document.documentElement.setAttribute('data-theme', savedTheme);
        }

        // Chargement des données (Carte ou Sauvegarde)
        const lastMapId = await getAppState('lastMapId');
        const lastGeoJSON = await getAppState('lastGeoJSON');
        
        if (lastMapId && lastGeoJSON) {
            setSaveButtonsState(true);
            if(DOM.btnRestoreData) DOM.btnRestoreData.disabled = false;
            
            // 1. On rétablit l'identité
            state.currentMapId = lastMapId;

            // 2. On charge les données utilisateur AVANT d'afficher
            try {
                const loadedData = await getAllPoiDataForMap(lastMapId);
                if (loadedData) {
                    state.userData = loadedData;
                    console.log(`Données utilisateur récupérées pour ${lastMapId}.`);
                }
           } catch (dbErr) {
                console.warn("Erreur chargement données utilisateur:", dbErr);
            }

            // 3. On affiche la carte D'ABORD (Priorité visuelle)
            await displayGeoJSON(lastGeoJSON, lastMapId);
            
            // 4. ENSUITE, on charge les circuits (Si ça échoue, la carte est quand même là)
            try {
                state.myCircuits = await getAllCircuitsForMap(lastMapId);
                console.log(`>>> Démarrage : ${state.myCircuits ? state.myCircuits.length : 0} circuits restaurés.`);
            } catch (err) {
                console.warn("Pas de circuits trouvés ou erreur mineure:", err);
                state.myCircuits = []; // Sécurité : on s'assure que ce n'est pas vide
            }
            
            if (isMobileView()) {
                switchMobileView('circuits');
            }
        } else {
            await loadDefaultMap();
        }

    } catch (error) {
        console.error("Échec de l'initialisation de l'application:", error);
        showToast("Erreur d'initialisation", "error");
    }
}

async function initDesktopMode() {
    initMap(); // Leaflet

    if (typeof map !== 'undefined') {
        enableDesktopCreationMode(); 
        setupSmartSearch();          
    }

    setupEventListeners();

    // Gestion spécifique Desktop pour l'import photos
    const btnImportPhotos = document.getElementById('btn-import-photos');
    const photoLoader = document.getElementById('photo-gps-loader');

    if (btnImportPhotos && photoLoader) {
        btnImportPhotos.addEventListener('click', () => photoLoader.click());
        photoLoader.addEventListener('change', handlePhotoImport);
    }
}

function setupEventListeners() {
    if(DOM.btnOpenGeojson) DOM.btnOpenGeojson.addEventListener('click', () => DOM.geojsonLoader.click());
    if(DOM.btnModeSelection) DOM.btnModeSelection.addEventListener('click', toggleSelectionMode);
    if(DOM.btnMyCircuits) DOM.btnMyCircuits.addEventListener('click', openCircuitsModal);
    
    document.getElementById('btn-filter-mosquees')?.addEventListener('click', (e) => {
        const isActive = e.currentTarget.classList.toggle('active');
        state.activeFilters.mosquees = isActive;
        applyFilters();
        populateZonesMenu();
    });
    
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

    const btnSaveMobile = document.getElementById('btn-save-mobile');
    if (btnSaveMobile) btnSaveMobile.addEventListener('click', () => saveUserData(false));

    const btnSaveFull = document.getElementById('btn-save-full');
    if (btnSaveFull) btnSaveFull.addEventListener('click', () => saveUserData(true));

    if(DOM.btnRestoreData) DOM.btnRestoreData.addEventListener('click', () => {
        if (!DOM.btnRestoreData.disabled) DOM.restoreLoader.click();
    });
    if(DOM.restoreLoader) DOM.restoreLoader.addEventListener('change', handleRestoreFile);

    if(DOM.geojsonLoader) DOM.geojsonLoader.addEventListener('change', handleFileLoad);
    
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

    if(DOM.gpxImporter) DOM.gpxImporter.addEventListener('change', handleGpxFileImport);
}

document.addEventListener('DOMContentLoaded', initializeApp);

window.requestSoftDelete = async function(idOrIndex) {
    let feature;
    if (typeof idOrIndex === 'number' && state.loadedFeatures[idOrIndex]) {
        feature = state.loadedFeatures[idOrIndex];
    } else {
        feature = state.loadedFeatures[state.currentFeatureId];
    }

    if (!feature) return;

    let poiId;
    try {
        poiId = getPoiId(feature);
    } catch (e) {
        poiId = feature.properties.HW_ID || feature.id;
    }

    const poiName = feature.properties['Nom du site FR'] || feature.properties['Nom du site AR'] || "ce lieu";
    
    const msg = isMobileView() 
        ? `ATTENTION !\n\nVoulez-vous vraiment placer "${poiName}" dans la corbeille ?\n\nCe lieu ne sera plus visible dans les listes et la recherche.`
        : `ATTENTION !\n\nVoulez-vous vraiment signaler "${poiName}" pour suppression ?\n\nCe lieu disparaîtra immédiatement de votre carte.`;

    if (confirm(msg)) {
        if (!state.hiddenPoiIds) state.hiddenPoiIds = [];
        if (!state.hiddenPoiIds.includes(poiId)) {
            state.hiddenPoiIds.push(poiId);
        }
        await saveAppState(`hiddenPois_${state.currentMapId}`, state.hiddenPoiIds);
        if (typeof closeDetailsPanel === 'function') closeDetailsPanel(true);
        if (typeof applyFilters === 'function') applyFilters();
        else location.reload();
    }
};

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(function(registrations) {
        for(let registration of registrations) {
            registration.unregister();
        }
    });
}