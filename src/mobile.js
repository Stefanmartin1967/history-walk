// mobile.js
import { state } from './state.js';
import { DOM, showToast, openDetailsPanel } from './ui.js';
import { getPoiId, getPoiName, addPoiFeature } from './data.js';
import { loadCircuitById, clearCircuit, setCircuitVisitedState } from './circuit.js'; 
import { createIcons, icons } from 'lucide';
import { saveUserData } from './fileManager.js'; 
import { deleteDatabase, saveAppState } from './database.js';
import { getIconForFeature } from './map.js';

let currentView = 'circuits'; 

export function isMobileView() {
    return window.innerWidth <= 768;
}

export function initMobileMode() {
    document.body.classList.add('mobile-mode');
    
    // Gestion des boutons de navigation
    const navButtons = document.querySelectorAll('.mobile-nav-btn[data-view]');
    navButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const view = btn.dataset.view;
            switchMobileView(view);
        });
    });

    // --- GESTION DU BOUTON FILTRE (Oeil) ---
    const filterBtn = document.getElementById('btn-mobile-filter');
    
    // On clone le bouton pour supprimer les anciens écouteurs et éviter les bugs
    if (filterBtn) {
        const newFilterBtn = filterBtn.cloneNode(true);
        filterBtn.parentNode.replaceChild(newFilterBtn, filterBtn);
        
        newFilterBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();

            // 1. On inverse l'état
            state.filterCompleted = !state.filterCompleted;
            
            // 2. Définition des valeurs
            const iconName = state.filterCompleted ? 'eye-off' : 'eye';
            const labelText = state.filterCompleted ? 'A faire' : 'Tout';
            const colorStyle = state.filterCompleted ? 'color:var(--brand);' : '';

            // 3. Reconstruction du bouton
            newFilterBtn.style = colorStyle;
            newFilterBtn.innerHTML = `
                <i data-lucide="${iconName}"></i>
                <span>${labelText}</span>
            `;

            // 4. Message Toast
            if (state.filterCompleted) {
                showToast("Circuits terminés masqués", "info");
            } else {
                showToast("Tous les circuits affichés", "info");
            }
            
            createIcons({ icons });

            // 5. Rafraîchissement
            if (currentView === 'circuits') {
                renderMobileCircuitsList();
            } else {
                switchMobileView('circuits');
            }
        });
    }

    switchMobileView('circuits');
}

export function switchMobileView(viewName) {
    currentView = viewName;
    
    document.querySelectorAll('.mobile-nav-btn[data-view]').forEach(btn => {
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
    
    let circuitsToDisplay = state.myCircuits;

    if (state.filterCompleted) {
        circuitsToDisplay = state.myCircuits.filter(c => {
            const existingFeatures = c.poiIds
                .map(id => state.loadedFeatures.find(feat => getPoiId(feat) === id))
                .filter(f => f); 

            if (existingFeatures.length === 0) return true; 
            
            const allVisited = existingFeatures.every(f => 
                f.properties.userData && f.properties.userData.vu
            );
            
            return !allVisited; 
        });
    }

    let html = `
        <div class="mobile-view-header">
            <h1>Mes Circuits ${state.filterCompleted ? '(A faire)' : ''}</h1>
        </div>
        <div class="panel-content" style="padding: 10px;">
    `;

    if (state.myCircuits.length === 0) {
        html += `<p style="text-align:center; color:var(--ink-soft); margin-top:20px;">
            Aucun circuit enregistré.<br>
            Utilisez le menu <b>Menu > Restaurer</b> pour charger une sauvegarde.
        </p>`;
    } else if (circuitsToDisplay.length === 0) {
        html += `<div style="text-align:center; color:var(--ink-soft); margin-top:40px; display:flex; flex-direction:column; align-items:center;">
            <i data-lucide="check-circle" style="width:48px; height:48px; color:var(--ok); margin-bottom:10px;"></i>
            <p>Bravo ! Tout est terminé.</p>
            <button id="btn-reset-filter-inline" style="margin-top:10px; padding:8px 16px; background:var(--surface-muted); border:1px solid var(--line); border-radius:8px;">
                Tout afficher
            </button>
        </div>`;
    } else {
        html += `<div class="mobile-list">`;
        circuitsToDisplay.forEach(circuit => {
            const validPois = circuit.poiIds.map(id => state.loadedFeatures.find(f => getPoiId(f) === id)).filter(f => f);
            const total = validPois.length;
            const done = validPois.filter(f => f.properties.userData?.vu).length;
            const isDone = (total > 0 && total === done);
            
            const statusIcon = isDone 
                ? `<i data-lucide="check-circle" style="color:var(--ok); width:16px;"></i>`
                : `<span style="font-size:11px; color:var(--ink-soft); font-weight:500;">${done}/${total}</span>`;

            // CORRECTION DESIGN : Utilisation de Flexbox pour coller le compteur à droite
            html += `
                <button class="mobile-list-item circuit-item-mobile" data-id="${circuit.id}" style="justify-content: space-between;">
                    <div style="display:flex; align-items:center; flex:1; min-width:0; margin-right:10px;">
                        <i data-lucide="route" style="color:var(--brand); margin-right:10px; flex-shrink:0;"></i>
                        <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${circuit.name}</span>
                    </div>
                    
                    <div style="display:flex; align-items:center; gap:8px; flex-shrink:0;">
                        ${statusIcon}
                        <i data-lucide="chevron-right" style="opacity:0.5;"></i>
                    </div>
                </button>
            `;
        });
        html += `</div>`;
    }
    
    html += `</div>`;
    container.innerHTML = html;

    const resetBtn = document.getElementById('btn-reset-filter-inline');
    if(resetBtn) {
        resetBtn.addEventListener('click', () => {
            document.getElementById('btn-mobile-filter').click(); 
        });
    }

    container.querySelectorAll('.circuit-item-mobile').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.dataset.id;
            await loadCircuitById(id);
        });
    });
}

function getCategoryIconName(category) {
    if (!category) return 'map-pin';
    const cat = category.toLowerCase();
    
    if (cat.includes('mosquée')) return 'landmark';
    if (cat.includes('synagogue')) return 'star';
    if (cat.includes('église')) return 'church'; 
    if (cat.includes('musée')) return 'library';
    if (cat.includes('puits')) return 'droplet';
    if (cat.includes('atelier')) return 'hammer';
    if (cat.includes('phare')) return 'tower-control'; 
    if (cat.includes('tour')) return 'castle';
    if (cat.includes('fort')) return 'shield';
    
    return 'map-pin';
}

export function renderMobilePoiList(features) {
    const listToDisplay = features || [];
    const container = document.getElementById('mobile-main-container');
    const isCircuit = state.activeCircuitId !== null;
    
    let pageTitle = 'Lieux';
    let isAllVisited = false;

    if (isCircuit) {
        const currentCircuit = state.myCircuits.find(c => c.id === state.activeCircuitId);
        pageTitle = currentCircuit ? currentCircuit.name : 'Circuit inconnu';
        
        if(features.length > 0) {
            isAllVisited = features.every(f => f.properties.userData && f.properties.userData.vu);
        }
    }

    const reverseBtnHtml = isCircuit 
        ? `<button id="mobile-reverse-btn" style="margin-left:auto; background:none; border:none; color:var(--brand); cursor:pointer;" title="Inverser le sens du circuit">
             <i data-lucide="arrow-up-down"></i>
           </button>` 
        : '';

    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.overflow = 'hidden'; 
    container.innerHTML = '';

    const headerDiv = document.createElement('div');
    headerDiv.className = 'mobile-view-header';
    headerDiv.style.flexShrink = '0';
    headerDiv.style.display = 'flex';
    headerDiv.style.alignItems = 'center';
    headerDiv.style.justifyContent = 'space-between';
    headerDiv.style.paddingRight = '15px';
    headerDiv.innerHTML = `
        <div style="display:flex; align-items:center;">
            ${isCircuit ? '<button id="mobile-back-btn" style="margin-right:10px;"><i data-lucide="arrow-left"></i></button>' : ''}
            <h1 style="margin:0; font-size:18px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:220px;">${pageTitle}</h1>
        </div>
        ${reverseBtnHtml}
    `;
    container.appendChild(headerDiv);

    const listDiv = document.createElement('div');
    listDiv.className = 'mobile-list';
    listDiv.style.flexGrow = '1';
    listDiv.style.overflowY = 'auto';
    listDiv.style.padding = '10px';
    
    let listHtml = '';
    listToDisplay.forEach(feature => {
        const name = getPoiName(feature);
        const poiId = getPoiId(feature);
        const cat = feature.properties.Catégorie || '';
        const icon = getCategoryIconName(cat);
        const isVisited = feature.properties.userData?.vu;
        const checkIcon = isVisited ? '<i data-lucide="check" style="width:14px; margin-left:5px; color:var(--ok);"></i>' : '';
        const opacityStyle = isVisited ? 'opacity:0.7;' : '';

        listHtml += `
            <button class="mobile-list-item poi-item-mobile" data-id="${poiId}" style="justify-content: space-between; ${opacityStyle}">
                <div style="display:flex; align-items:center; gap:10px;">
                    <i data-lucide="${icon}" style="color:${isVisited ? 'var(--ok)' : 'var(--brand)'};"></i>
                    <span>${name}</span>
                </div>
                ${checkIcon}
            </button>
        `;
    });
    listDiv.innerHTML = listHtml;
    container.appendChild(listDiv);

    if (isCircuit) {
        const footerDiv = document.createElement('div');
        footerDiv.style.flexShrink = '0';
        footerDiv.style.padding = '16px 16px 80px 16px'; 
        footerDiv.style.borderTop = '1px solid var(--line)';
        footerDiv.style.backgroundColor = 'var(--surface)';
        footerDiv.style.zIndex = '10';
        
        const btnStateClass = isAllVisited ? 'background-color:var(--ok); color:white;' : 'background-color:var(--surface-muted); color:var(--ink); border:1px solid var(--line);';
        const btnIcon = isAllVisited ? 'check-circle' : 'circle';
        const btnText = isAllVisited ? 'Circuit Terminé !' : 'Marquer comme Fait';
        
        footerDiv.innerHTML = `
            <button id="btn-toggle-visited" style="width:100%; padding:14px; border-radius:12px; font-weight:bold; display:flex; justify-content:center; align-items:center; gap:8px; cursor:pointer; font-size:16px; transition:all 0.2s; ${btnStateClass}">
                <i data-lucide="${btnIcon}"></i>
                <span>${btnText}</span>
            </button>
        `;
        container.appendChild(footerDiv);
        
        setTimeout(() => {
            const btnToggle = document.getElementById('btn-toggle-visited');
            if(btnToggle) {
                btnToggle.addEventListener('click', async () => {
                    const newState = !isAllVisited; 
                    if(newState) {
                         if(confirm("Bravo ! Marquer tous les lieux de ce circuit comme visités ?")) {
                             await setCircuitVisitedState(state.activeCircuitId, true);
                         }
                    } else {
                         if(confirm("Voulez-vous vraiment décocher tous les lieux (remettre à 'Non visité') ?")) {
                             await setCircuitVisitedState(state.activeCircuitId, false);
                         }
                    }
                });
            }
        }, 0);
    }

    const backBtn = document.getElementById('mobile-back-btn');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            container.style.display = '';
            container.style.flexDirection = '';
            container.style.overflow = '';
            clearCircuit(false); 
            renderMobileCircuitsList(); 
        });
    }

    const reverseBtn = document.getElementById('mobile-reverse-btn');
    if (reverseBtn) {
        reverseBtn.addEventListener('click', () => {
            if(!state.currentCircuit || state.currentCircuit.length < 2) return;
            state.currentCircuit.reverse();
            showToast("Circuit inversé ⇅", "info");
            renderMobilePoiList(state.currentCircuit);
        });
    }

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
    container.style.display = '';
    container.style.flexDirection = '';
    container.style.overflow = '';

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
            if (state.hiddenPoiIds && state.hiddenPoiIds.includes(id)) return false;
            return name.includes(term);
        });

        let html = '';
        matches.forEach(f => {
            const cat = f.properties.Catégorie || '';
            const icon = getCategoryIconName(cat);
            html += `
                <button class="mobile-list-item result-item" data-id="${getPoiId(f)}">
                    <i data-lucide="${icon}"></i>
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
    container.style.display = '';
    container.style.flexDirection = '';
    container.style.overflow = '';
    
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
            History Walk Mobile v${state.appVersion || '3.1'}
        </div>
    `;

    document.getElementById('mob-action-restore').addEventListener('click', () => DOM.restoreLoader.click());
    document.getElementById('mob-action-save').addEventListener('click', () => saveUserData());
    document.getElementById('mob-action-geojson').addEventListener('click', () => DOM.geojsonLoader.click());
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