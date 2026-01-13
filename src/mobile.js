import { state } from './state.js';
import { 
    DOM, 
    showToast, 
    closeDetailsPanel, 
    openDetailsPanel, 
    openCircuitsModal 
} from './ui.js';
import { toggleSelectionMode } from './circuit.js';
import { handleRestoreFile, saveUserData, handlePhotoImport } from './fileManager.js';
import { getPoiName, getPoiId } from './data.js';

export function isMobileView() {
    return window.innerWidth <= 768;
}

export function initMobileMode() {
    console.log("Mobile mode initialized");
    document.body.classList.add('mobile-mode');
    
    // Bottom Nav
    const navButtons = document.querySelectorAll('.mobile-nav-btn');
    navButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            navButtons.forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            handleMobileViewChange(e.currentTarget.dataset.view);
        });
    });

    setupMobileActions();
}

function handleMobileViewChange(view) {
    closeDetailsPanel();
    const rightSidebar = document.getElementById('right-sidebar');
    if (rightSidebar) rightSidebar.style.display = 'none';

    switch(view) {
        case 'circuits':
            openCircuitsModal();
            break;
        case 'search':
            if (DOM.searchInput) DOM.searchInput.focus();
            break;
        case 'add-poi':
            toggleSelectionMode();
            showToast("Touchez la carte pour ajouter un lieu", "info");
            break;
        case 'actions':
            openMobileMenu();
            break;
    }
}

// --- FONCTION AJOUTÉE (Correction de l'erreur ui.js) ---
export function updatePoiPosition(lat, lng) {
    const coordsEl = document.getElementById('new-poi-coords');
    if (coordsEl) {
        coordsEl.textContent = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    }
}

export function renderMobilePoiList(features) {
    const container = document.getElementById('mobile-main-container');
    if (!container) return;

    const listData = features || state.loadedFeatures;
    container.innerHTML = '';
    
    const ul = document.createElement('ul');
    ul.style.listStyle = 'none';
    ul.style.padding = '0';
    ul.style.margin = '0';

    listData.slice(0, 50).forEach(feature => {
        const li = document.createElement('li');
        li.style.cssText = 'padding:15px; border-bottom:1px solid var(--border); cursor:pointer; background:var(--surface);';
        
        const name = getPoiName(feature);
        const cat = feature.properties['Catégorie'] || 'Divers';
        
        li.innerHTML = `
            <div style="font-weight:600; font-size:16px;">${name}</div>
            <div style="font-size:13px; color:var(--text-soft); margin-top:4px;">${cat}</div>
        `;
        
        li.addEventListener('click', () => {
             const featureId = state.loadedFeatures.indexOf(feature);
             if (featureId > -1) openDetailsPanel(featureId);
        });
        
        ul.appendChild(li);
    });

    container.appendChild(ul);
}

export function renderMobileCircuitsList() {
    const list = document.getElementById('circuits-list-container');
    if (!list) return;

    list.innerHTML = '';
    
    if (state.myCircuits.length === 0) {
        list.innerHTML = '<div style="padding:20px; text-align:center; color:var(--text-muted);">Aucun circuit sauvegardé.</div>';
        return;
    }

    state.myCircuits.forEach(circuit => {
        const div = document.createElement('div');
        div.className = 'circuit-card'; 
        div.style.cssText = 'background:var(--surface); padding:15px; margin-bottom:10px; border-radius:12px; border:1px solid var(--border); box-shadow:0 2px 4px rgba(0,0,0,0.05);';
        
        div.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
                <h3 style="margin:0; font-size:16px; font-weight:600;">${circuit.name}</h3>
                <span style="font-size:12px; background:var(--surface-muted); padding:2px 8px; border-radius:10px;">${circuit.points.length} pts</span>
            </div>
            <p style="font-size:14px; color:var(--text-soft); margin-bottom:12px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${circuit.description || 'Aucune description'}</p>
            <div style="display:flex; gap:10px;">
                <button class="btn-load-circuit header-btn" data-id="${circuit.id}" style="flex:1; justify-content:center; background:var(--brand); color:white; border-radius:6px; padding:8px;"><i data-lucide="map"></i> Charger</button>
                <button class="btn-delete-circuit header-btn" data-id="${circuit.id}" style="padding:8px; color:var(--ink); border:1px solid var(--border); border-radius:6px;"><i data-lucide="trash-2"></i></button>
            </div>
        `;
        list.appendChild(div);
    });
    
    if(window.lucide) window.lucide.createIcons();
}

function setupMobileActions() {
    // Hooks pour actions futures
}

function openMobileMenu() {
    let menu = document.getElementById('mobile-actions-menu');
    if (!menu) {
        menu = document.createElement('div');
        menu.id = 'mobile-actions-menu';
        menu.className = 'modal-overlay';
        menu.style.display = 'flex';
        menu.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>Menu</h2>
                    <button class="header-btn" id="close-mobile-menu"><i data-lucide="x"></i></button>
                </div>
                <div class="modal-body" style="display:flex; flex-direction:column; gap:10px;">
                    <button id="mob-btn-save" class="btn" style="justify-content:flex-start; width:100%"><i data-lucide="save"></i> Sauvegarder</button>
                    <button id="mob-btn-restore" class="btn" style="justify-content:flex-start; width:100%"><i data-lucide="folder-down"></i> Restaurer</button>
                    <button id="mob-btn-photos" class="btn" style="justify-content:flex-start; width:100%"><i data-lucide="camera"></i> Photos GPS</button>
                    <div class="separator" style="margin: 10px 0; border-top:1px solid var(--border);"></div>
                    <button id="mob-btn-theme" class="btn" style="justify-content:flex-start; width:100%"><i data-lucide="palette"></i> Changer Thème</button>
                </div>
            </div>
        `;
        document.body.appendChild(menu);
        if(window.lucide) window.lucide.createIcons();

        menu.querySelector('#close-mobile-menu').addEventListener('click', () => menu.style.display = 'none');
        
        menu.querySelector('#mob-btn-save').addEventListener('click', () => {
            saveUserData();
            menu.style.display = 'none';
        });

        menu.querySelector('#mob-btn-restore').addEventListener('click', () => {
            DOM.restoreLoader.click(); 
            menu.style.display = 'none';
        });
        
        menu.querySelector('#mob-btn-photos').addEventListener('click', () => {
            document.getElementById('photo-gps-loader').click();
            menu.style.display = 'none';
        });

        menu.querySelector('#mob-btn-theme').addEventListener('click', () => {
            document.getElementById('btn-theme-selector').click(); 
        });
    } else {
        menu.style.display = 'flex';
    }
}

window.openGeneratorModal = function() {
    showToast("Générateur de circuit : Bientôt disponible !", "info");
}