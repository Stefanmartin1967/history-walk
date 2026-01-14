// mobile.js
import { state } from './state.js';
import { DOM, showToast, openDetailsPanel } from './ui.js';
import { getPoiId, getPoiName, addPoiFeature } from './data.js';
import { loadCircuitById, clearCircuit } from './circuit.js';
import { createIcons, icons } from 'lucide';
import { saveUserData } from './fileManager.js'; 
import { deleteDatabase, saveAppState } from './database.js'; 

// État local du mobile
let currentView = 'circuits'; 

export function isMobileView() {
    return window.innerWidth <= 768;
}

export function initMobileMode() {
    document.body.classList.add('mobile-mode');
    
    const navButtons = document.querySelectorAll('.mobile-nav-btn[data-view]');
    navButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const view = btn.dataset.view;
            switchMobileView(view);
        });
    });

    switchMobileView('circuits');
}

export function switchMobileView(viewName) {
    currentView = viewName;
    
    document.querySelectorAll('.mobile-nav-btn').forEach(btn => {
        if (btn.dataset.view === viewName) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    const container = document.getElementById('mobile-main-container');
    container.innerHTML = ''; 
    
    switch (viewName) {
        case 'circuits':
            renderMobileCircuitsList();
            break;
        case 'search':
            renderMobileSearch();
            break;
        case 'add-poi':
            handleAddPoiClick();
            break;
        case 'actions':
            renderMobileMenu();
            break;
    }
    
    createIcons({ icons });
}

async function handleAddPoiClick() {
    if (!confirm("Capturer votre position GPS actuelle pour créer un nouveau lieu ?")) {
        switchMobileView('circuits');
        return;
    }

    showToast("Acquisition GPS en cours...", "info");

    if (!navigator.geolocation) {
        showToast("GPS non supporté par ce navigateur.", "error");
        return;
    }

    navigator.geolocation.getCurrentPosition(
        async (pos) => {
            const { latitude, longitude } = pos.coords;
            const newPoiId = `HW-MOB-${Date.now()}`;
            
            const newFeature = {
                type: "Feature",
                geometry: { type: "Point", coordinates: [longitude, latitude] },
                properties: {
                    "Nom du site FR": "Nouveau Lieu",
                    "Catégorie": "A définir",
                    "Zone": "Terrain",
                    "Description": "Créé sur le terrain",
                    "HW_ID": newPoiId
                }
            };

            addPoiFeature(newFeature);
            await saveAppState('lastGeoJSON', { type: 'FeatureCollection', features: state.loadedFeatures });
            
            showToast(`Lieu créé !`, "success");
            
            const index = state.loadedFeatures.length - 1;
            openDetailsPanel(index);
        },
        (err) => {
            console.error(err);
            showToast("Erreur GPS : " + err.message, "error");
            switchMobileView('circuits');
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
}

export function renderMobileCircuitsList() {
    const container = document.getElementById('mobile-main-container');
    
    let html = `
        <div class="mobile-view-header">
            <h1>Mes Circuits</h1>
        </div>
        <div class="panel-content" style="padding: 10px;">
    `;

    if (state.myCircuits.length === 0) {
        html += `<p style="text-align:center; color:var(--ink-soft); margin-top:20px;">
            Aucun circuit enregistré.<br>
            Utilisez le menu <b>Menu > Restaurer</b> pour charger une sauvegarde.
        </p>`;
    } else {
        html += `<div class="mobile-list">`;
        state.myCircuits.forEach(circuit => {
            html += `
                <button class="mobile-list-item circuit-item-mobile" data-id="${circuit.id}">
                    <i data-lucide="route" style="color:var(--brand);"></i>
                    <span>${circuit.name}</span>
                    <i data-lucide="chevron-right"></i>
                </button>
            `;
        });
        html += `</div>`;
    }
    
    html += `</div>`;
    container.innerHTML = html;

    container.querySelectorAll('.circuit-item-mobile').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.dataset.id;
            await loadCircuitById(id);
        });
    });
}

export function renderMobilePoiList(features) {
    // Si features n'est pas fourni, on utilise tout (ou rien)
    const listToDisplay = features || [];
    
    const container = document.getElementById('mobile-main-container');
    const isCircuit = state.activeCircuitId !== null;
    
    // Bouton Inverser (Uniquement si on est dans un circuit)
    const reverseBtnHtml = isCircuit 
        ? `<button id="mobile-reverse-btn" style="margin-left:auto; background:none; border:none; color:var(--brand); cursor:pointer;" title="Inverser le sens du circuit">
             <i data-lucide="arrow-up-down"></i>
           </button>` 
        : '';

    let html = `
        <div class="mobile-view-header" style="display:flex; align-items:center; justify-content:space-between; padding-right:15px;">
            <div style="display:flex; align-items:center;">
                ${isCircuit ? '<button id="mobile-back-btn" style="margin-right:10px;"><i data-lucide="arrow-left"></i></button>' : ''}
                <h1 style="margin:0; font-size:18px;">${isCircuit ? state.currentCircuitName : 'Lieux'}</h1>
            </div>
            ${reverseBtnHtml}
        </div>
        <div class="mobile-list">
    `;

    listToDisplay.forEach(feature => {
        const name = getPoiName(feature);
        const poiId = getPoiId(feature);
        const icon = feature.properties.Catégorie === 'Mosquée' ? 'landmark' : 'map-pin';
        
        // On vérifie si le point est visité pour le griser ou ajouter un check (optionnel mais sympa)
        const isVisited = feature.properties.userData?.vu;
        const checkIcon = isVisited ? '<i data-lucide="check" style="width:14px; margin-left:5px; color:var(--ok);"></i>' : '';

        html += `
            <button class="mobile-list-item poi-item-mobile" data-id="${poiId}" style="justify-content: space-between;">
                <div style="display:flex; align-items:center; gap:10px;">
                    <i data-lucide="${icon}"></i>
                    <span>${name}</span>
                </div>
                ${checkIcon}
            </button>
        `;
    });

    html += `</div>`;
    container.innerHTML = html;
    
    // 1. Gestion du bouton retour
    const backBtn = document.getElementById('mobile-back-btn');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            clearCircuit(false); 
            renderMobileCircuitsList(); 
        });
    }

    // 2. Gestion du bouton INVERSER (Nouveau !)
    const reverseBtn = document.getElementById('mobile-reverse-btn');
    if (reverseBtn) {
        reverseBtn.addEventListener('click', () => {
            if(!state.currentCircuit || state.currentCircuit.length < 2) return;
            
            // On inverse le tableau en mémoire
            state.currentCircuit.reverse();
            
            // Petit Toast pour confirmer
            showToast("Circuit inversé ⇅", "info");
            
            // On rafraîchit la liste immédiatement
            renderMobilePoiList(state.currentCircuit);
        });
    }

    // 3. Clic sur un lieu -> Ouvre détails
    container.querySelectorAll('.poi-item-mobile').forEach(btn => {
        btn.addEventListener('click', () => {
            const poiId = btn.dataset.id;
            const feature = state.loadedFeatures.find(f => getPoiId(f) === poiId);
            const index = state.loadedFeatures.indexOf(feature);
            if (index > -1) openDetailsPanel(index);
        });
    });
    
    createIcons({ icons });
}

export function renderMobileSearch() {
    const container = document.getElementById('mobile-main-container');
    container.innerHTML = `
        <div class="mobile-view-header">
            <h1>Rechercher</h1>
        </div>
        <div style="padding: 16px;" class="mobile-search">
            <div style="position:relative;">
                <i data-lucide="search" class="search-icon" style="position:absolute; left:12px; top:12px;"></i>
                <input type="text" id="mobile-search-input" placeholder="Nom du lieu..." 
                    style="width:100%; padding:10px 10px 10px 40px; border-radius:12px; border:1px solid var(--line);">
            </div>
            <div id="mobile-search-results" class="mobile-list" style="margin-top:20px;"></div>
        </div>
    `;

    const input = document.getElementById('mobile-search-input');
    const resultsContainer = document.getElementById('mobile-search-results');

    input.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        if (term.length < 2) {
            resultsContainer.innerHTML = '';
            return;
        }

        const matches = state.loadedFeatures.filter(f => {
            const name = getPoiName(f).toLowerCase();
            const id = getPoiId(f);
            
            // FILTRE DES SUPPRIMÉS
            if (state.hiddenPoiIds && state.hiddenPoiIds.includes(id)) return false;

            return name.includes(term);
        });

        let html = '';
        matches.forEach(f => {
            html += `
                <button class="mobile-list-item result-item" data-id="${getPoiId(f)}">
                    <i data-lucide="map-pin"></i>
                    <span>${getPoiName(f)}</span>
                </button>
            `;
        });
        resultsContainer.innerHTML = html;
        createIcons({ icons });

        resultsContainer.querySelectorAll('.result-item').forEach(btn => {
            btn.addEventListener('click', () => {
                const feature = state.loadedFeatures.find(f => getPoiId(f) === btn.dataset.id);
                const index = state.loadedFeatures.indexOf(feature);
                openDetailsPanel(index);
            });
        });
    });
    
    input.focus();
}

export function renderMobileMenu() {
    const container = document.getElementById('mobile-main-container');
    container.innerHTML = `
        <div class="mobile-view-header">
            <h1>Menu</h1>
        </div>
        <div class="mobile-list actions-list" style="padding: 16px;">
            
            <button class="mobile-list-item" id="mob-action-restore">
                <i data-lucide="folder-down"></i>
                <span>Restaurer les données</span>
            </button>

            <button class="mobile-list-item" id="mob-action-save">
                <i data-lucide="save"></i>
                <span>Sauvegarder</span>
            </button>
            
            <div style="height:1px; background:var(--line); margin:10px 0;"></div>
            
             <button class="mobile-list-item" id="mob-action-geojson">
                <i data-lucide="map"></i>
                <span>Charger Destination (GeoJSON)</span>
            </button>

            <button class="mobile-list-item" id="mob-action-reset" style="color:var(--danger);">
                <i data-lucide="trash-2"></i>
                <span>Vider les données locales</span>
            </button>

            <div style="height:1px; background:var(--line); margin:10px 0;"></div>

            <button class="mobile-list-item" id="mob-action-theme">
                <i data-lucide="palette"></i>
                <span>Changer Thème</span>
            </button>
        </div>
        <div style="text-align:center; color:var(--ink-soft); font-size:12px; margin-top:20px;">
            History Walk Mobile v${state.appVersion || '2.0'}
        </div>
    `;

    document.getElementById('mob-action-restore').addEventListener('click', () => {
        DOM.restoreLoader.click(); 
    });

    document.getElementById('mob-action-save').addEventListener('click', () => {
        saveUserData(); 
    });
    
    document.getElementById('mob-action-geojson').addEventListener('click', () => {
        DOM.geojsonLoader.click(); 
    });

    document.getElementById('mob-action-reset').addEventListener('click', async () => {
        if(confirm("ATTENTION : Cela va effacer toutes les données locales (caches, sauvegardes automatiques). Continuez ?")) {
            await deleteDatabase();
            location.reload();
        }
    });

    document.getElementById('mob-action-theme').addEventListener('click', () => {
        document.getElementById('btn-theme-selector').click(); 
        showToast("Thème changé", "success");
    });
}

export function updatePoiPosition(poiId) {
    if (!navigator.geolocation) return showToast("GPS non supporté", "error");
    
    navigator.geolocation.getCurrentPosition(
        (pos) => {
            const { latitude, longitude } = pos.coords;
            showToast(`Position capturée: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
        },
        (err) => showToast("Erreur GPS: " + err.message, "error")
    );
}