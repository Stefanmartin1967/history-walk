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
    populateZonesMenu
} from './ui.js';

import {
    toggleSelectionMode,
    setupCircuitPanelEventListeners
} from './circuit.js';

import { displayGeoJSON, applyFilters, getPoiId, getPoiName } from './data.js';
import { isMobileView, initMobileMode } from './mobile.js';

// --- NOUVEAUX IMPORTS ---
import { handleFileLoad, handleGpxFileImport, handlePhotoImport, saveUserData, handleRestoreFile } from './fileManager.js';
import { setupSearch, setupSmartSearch } from './searchManager.js';
import { enableDesktopCreationMode } from './desktopMode.js';

// --- INITIALISATION ---

async function loadDefaultMap() {
    const defaultMapUrl = 'Djerba.geojson';
    DOM.loaderOverlay.style.display = 'flex';

    try {
        const response = await fetch(defaultMapUrl);
        if (!response.ok) {
            throw new Error(`Le réseau a répondu avec une erreur: ${response.statusText}`);
        }
        const geojsonData = await response.json();

        await displayGeoJSON(geojsonData, 'Djerba');

        DOM.btnSaveData.disabled = false;
        DOM.btnRestoreData.disabled = false;

        showToast('Carte de Djerba chargée par défaut.', 'success');

    } catch (error) {
        console.error("Impossible de charger la carte par défaut:", error);
        showToast("Impossible de charger la carte. Veuillez la sélectionner manuellement.", 'error');
        DOM.btnSaveData.disabled = true;
        DOM.btnRestoreData.disabled = true;
    } finally {
        DOM.loaderOverlay.style.display = 'none';
    }
}

async function initializeApp() {
    document.getElementById('app-version').textContent = APP_VERSION;
    initializeDomReferences();

    try {
        await initDB();
        // Base de données prête

        const savedTheme = await getAppState('currentTheme');
        if (savedTheme) {
            document.documentElement.setAttribute('data-theme', savedTheme);
        }

        if (isMobileView()) {
            initMobileMode();
        } else {
            initDesktopMode();
        }

    } catch (error) {
        console.error("Échec de l'initialisation de l'application:", error);
        document.body.innerHTML = `<h1>Erreur critique</h1><p>Impossible d'initialiser l'application. Veuillez vérifier la console pour plus de détails.</p><p>${error.message}</p>`;
    }
}

async function initDesktopMode() {
    initMap();

    // Activation des modules spécifiques
    if (typeof map !== 'undefined') {
        enableDesktopCreationMode(); // Depuis desktopMode.js
        setupSmartSearch();          // Depuis searchManager.js
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
        DOM.btnSaveData.disabled = false;
        DOM.btnRestoreData.disabled = false;
        await displayGeoJSON(lastGeoJSON, lastMapId);
    } else {
        await loadDefaultMap();
    }
}

function setupEventListeners() {
    // Barre d'outils
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
        e.currentTarget.innerHTML = isActive ? '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.6 11.2c.4.8.6 1.7.6 2.8c0 4.4-4 8-9 8s-9-3.6-9-8c0-1.1.2-2 .6-2.8"/><path d="M7.6 7.6C5.6 9.2 4 11.2 4 14c0 4.4 4 8 9 8s9-3.6 9-8c0-2.8-1.6-4.8-3.6-6.4"/><path d="M12.5 9.5c.6.6 1.2 1.5 1.5 2.5"/><path d="m2 2 20 20"/><path d="M9.5 5.5c.3-1 .9-1.8 1.5-2.5"/></svg><span>Visités</span>' : '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg><span>Visités</span>';
        applyFilters();
        populateZonesMenu();
    });

    document.getElementById('btn-filter-planifies')?.addEventListener('click', (e) => {
        const isActive = e.currentTarget.classList.toggle('active');
        state.activeFilters.planifies = isActive;
        e.currentTarget.innerHTML = isActive ? '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 13V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/><line x1="2" x2="22" y1="2" y2="22"/></svg><span>Planifiés</span>' : '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="m9 16 2 2 4-4"/></svg><span>Planifiés</span>';
        applyFilters();
        populateZonesMenu();
    });

    document.getElementById('btn-filter-zones')?.addEventListener('click', (e) => {
        e.stopPropagation();
        document.getElementById('zonesMenu').style.display = document.getElementById('zonesMenu').style.display === 'none' ? 'block' : 'none';
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

    // Sauvegarde / Restauration (via fileManager)
    DOM.btnSaveData.addEventListener('click', saveUserData);
    DOM.btnRestoreData.addEventListener('click', () => {
        if (DOM.btnRestoreData.disabled) return;
        DOM.restoreLoader.click()
    });
    DOM.restoreLoader.addEventListener('change', handleRestoreFile);

    // Chargement de fichier (via fileManager)
    DOM.geojsonLoader.addEventListener('change', handleFileLoad);
    
    // Recherche (via searchManager)
    DOM.searchInput.addEventListener('input', setupSearch);

    // Click outside search
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-container')) {
            DOM.searchResults.style.display = 'none';
        }
    });
    
    // Panneaux et Onglets
    setupTabs();
    setupCircuitPanelEventListeners();
    
    // Modale Circuits
    DOM.closeCircuitsModal.addEventListener('click', closeCircuitsModal);
    DOM.circuitsModal.addEventListener('click', (e) => {
        if (e.target === DOM.circuitsModal) closeCircuitsModal();
    });
    DOM.circuitsListContainer.addEventListener('click', handleCircuitsListClick);

    DOM.gpxImporter.addEventListener('change', handleGpxFileImport);
}

document.addEventListener('DOMContentLoaded', initializeApp);

// --- FONCTION DE SUPPRESSION SÉCURISÉE (SOFT DELETE) ---
// Mise à disposition globale pour utilisation potentielle
window.requestSoftDelete = async function(idOrIndex) {
    let feature;
    // Récupération sécurisée via index ou ID
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

    if (confirm(`ATTENTION !\n\nVoulez-vous vraiment signaler "${poiName}" pour suppression ?\n\nCe lieu disparaîtra immédiatement de votre carte.`)) {
        
        if (!state.hiddenPoiIds) state.hiddenPoiIds = [];
        if (!state.hiddenPoiIds.includes(poiId)) {
            state.hiddenPoiIds.push(poiId);
        }

        await saveAppState(`hiddenPois_${state.currentMapId}`, state.hiddenPoiIds);

        if (typeof closeDetailsPanel === 'function') {
            closeDetailsPanel();
        }

        if (typeof applyFilters === 'function') {
            applyFilters();
        } else {
            location.reload();
        }
    }
};

// --- Nettoyage Service Worker ---
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(function(registrations) {
        for(let registration of registrations) {
            registration.unregister();
        }
    });
}