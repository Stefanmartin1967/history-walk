// main.js
import { initDB, getAppState, saveAppState } from './database.js';
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
// AJOUT DE switchMobileView DANS LES IMPORTS
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
    const defaultMapUrl = 'Djerba.geojson';
    if(DOM.loaderOverlay) DOM.loaderOverlay.style.display = 'flex';

    try {
        const response = await fetch(defaultMapUrl);
        if (!response.ok) {
            throw new Error(`Le réseau a répondu avec une erreur: ${response.statusText}`);
        }
        const geojsonData = await response.json();

        await displayGeoJSON(geojsonData, 'Djerba');

        // Activation des nouveaux boutons
        setSaveButtonsState(true);
        if(DOM.btnRestoreData) DOM.btnRestoreData.disabled = false;

        if (!isMobileView()) {
            showToast('Carte de Djerba chargée par défaut.', 'success');
        } else {
            // --- FIX MOBILE : Rafraîchir la vue Circuits après chargement ---
            switchMobileView('circuits');
        }

    } catch (error) {
        console.error("Impossible de charger la carte par défaut:", error);
        showToast("Impossible de charger la carte. Veuillez la sélectionner manuellement.", 'error');
        
        // Désactivation des nouveaux boutons en cas d'erreur
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

    try {
        await initDB();
        
        const savedTheme = await getAppState('currentTheme');
        if (savedTheme) {
            document.documentElement.setAttribute('data-theme', savedTheme);
        }

        if (isMobileView()) {
            initMobileMode();
            
            const lastMapId = await getAppState('lastMapId');
            const lastGeoJSON = await getAppState('lastGeoJSON');
            
            if (lastMapId && lastGeoJSON) {
                // Activation des nouveaux boutons
                setSaveButtonsState(true);
                if(DOM.btnRestoreData) DOM.btnRestoreData.disabled = false;
                await displayGeoJSON(lastGeoJSON, lastMapId);
                
                // --- FIX MOBILE : Rafraîchir la vue Circuits après chargement ---
                switchMobileView('circuits');
            } else {
                await loadDefaultMap(); // loadDefaultMap gère aussi le switchMobileView maintenant
            }
        } else {
            initDesktopMode();
        }

    } catch (error) {
        console.error("Échec de l'initialisation de l'application:", error);
    }
}

async function initDesktopMode() {
    initMap();

    if (typeof map !== 'undefined') {
        enableDesktopCreationMode(); 
        setupSmartSearch();          
    }

    setupEventListeners();

    const lastMapId = await getAppState('lastMapId');
    const lastGeoJSON = await getAppState('lastGeoJSON');
    const btnImportPhotos = document.getElementById('btn-import-photos');
    const photoLoader = document.getElementById('photo-gps-loader');

    if (btnImportPhotos && photoLoader) {
        btnImportPhotos.addEventListener('click', () => photoLoader.click());
        photoLoader.addEventListener('change', handlePhotoImport);
    }

    if (lastMapId && lastGeoJSON) {
        // Activation des nouveaux boutons
        setSaveButtonsState(true);
        DOM.btnRestoreData.disabled = false;
        await displayGeoJSON(lastGeoJSON, lastMapId);
    } else {
        await loadDefaultMap();
    }
}

function setupEventListeners() {
    DOM.btnOpenGeojson.addEventListener('click', () => DOM.geojsonLoader.click());
    DOM.btnModeSelection.addEventListener('click', toggleSelectionMode);
    DOM.btnMyCircuits.addEventListener('click', openCircuitsModal);
    
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

    document.getElementById('btn-theme-selector').addEventListener('click', () => {
        const themes = ['maritime', 'desert', 'oasis', 'night'];
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'maritime';
        const currentIndex = themes.indexOf(currentTheme);
        const nextIndex = (currentIndex + 1) % themes.length;
        const nextTheme = themes[nextIndex];
        document.documentElement.setAttribute('data-theme', nextTheme);
        saveAppState('currentTheme', nextTheme);
    });

    // --- NOUVEAUX ÉCOUTEURS POUR LES 2 BOUTONS DE SAUVEGARDE ---
    const btnSaveMobile = document.getElementById('btn-save-mobile');
    if (btnSaveMobile) {
        btnSaveMobile.addEventListener('click', () => {
            saveUserData(false); // Mode Lite (Mobile)
        });
    }

    const btnSaveFull = document.getElementById('btn-save-full');
    if (btnSaveFull) {
        btnSaveFull.addEventListener('click', () => {
            saveUserData(true); // Mode Full (PC)
        });
    }

    DOM.btnRestoreData.addEventListener('click', () => {
        if (DOM.btnRestoreData.disabled) return;
        DOM.restoreLoader.click()
    });
    DOM.restoreLoader.addEventListener('change', handleRestoreFile);

    DOM.geojsonLoader.addEventListener('change', handleFileLoad);
    
    DOM.searchInput.addEventListener('input', setupSearch);

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-container')) {
            DOM.searchResults.style.display = 'none';
        }
    });
    
    setupTabs();
    setupCircuitPanelEventListeners();
    
    DOM.closeCircuitsModal.addEventListener('click', closeCircuitsModal);
    DOM.circuitsModal.addEventListener('click', (e) => {
        if (e.target === DOM.circuitsModal) closeCircuitsModal();
    });
    DOM.circuitsListContainer.addEventListener('click', handleCircuitsListClick);

    DOM.gpxImporter.addEventListener('change', handleGpxFileImport);
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

        if (typeof closeDetailsPanel === 'function') {
            closeDetailsPanel(true);
        }

        if (typeof applyFilters === 'function') {
            applyFilters();
        } else {
            location.reload();
        }
    }
};

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(function(registrations) {
        for(let registration of registrations) {
            registration.unregister();
        }
    });
}