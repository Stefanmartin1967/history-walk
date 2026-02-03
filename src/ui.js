// ui.js
import { state, POI_CATEGORIES } from './state.js';
import { getPoiId, getPoiName, applyFilters, updatePoiData } from './data.js';
import { restoreCircuit, saveAppState } from './database.js';
import { escapeXml } from './gpx.js';
import { eventBus } from './events.js';
import { speakText, stopDictation, isDictationActive } from './voice.js';
import { clearCircuit, navigatePoiDetails, toggleSelectionMode, loadCircuitById } from './circuit.js';
import { map } from './map.js';
import { isMobileView, updatePoiPosition, renderMobileCircuitsList, renderMobilePoiList, switchMobileView } from './mobile.js';
import { createIcons, icons } from 'lucide';
import { showToast } from './toast.js';
import { buildDetailsPanelHtml as buildHTML, ICONS } from './templates.js';
import { getZonesData, calculateAdjustedTime } from './circuit-actions.js';
import { initPhotoViewer, setupPhotoPanelListeners } from './ui-photo-viewer.js';
import { initCircuitListUI, renderExplorerList } from './ui-circuit-list.js';
import { showConfirm } from './modal.js';
import { RichEditor } from './richEditor.js';

// Re-exports for external use
export { openCircuitsModal, closeCircuitsModal } from './ui-circuit-list.js';

export const DOM = {};
let currentEditor = { fieldId: null, poiId: null, callback: null };

// --- INITIALISATION DOM ---

export function initializeDomReferences() {
    const ids = [
        'geojson-loader', 'search-input', 'search-results', 'btn-mode-selection', 'right-sidebar', 'sidebar-tabs', 
        'details-panel', 'circuit-panel', 'circuit-steps-list', 'circuit-title-text', 'circuit-title-input', 
        'circuit-description', 'edit-circuit-title-button', 'circuit-poi-count', 'circuit-distance', 'circuits-modal', 
        'close-circuits-modal', 'circuits-list-container', 'gpx-importer', 'btn-export-gpx',
        'btn-import-gpx', 'loader-overlay', 'btn-save-data', 'btn-restore-data', 'restore-loader', 'btn-open-geojson', 
        'mobile-container', 'mobile-main-container', 'mobile-nav', 'fullscreen-editor', 'editor-title', 
        'editor-cancel-btn', 'editor-save-btn', 'editor-textarea', 'destination-loader',
        'photo-viewer', 'viewer-img', 'viewer-next', 'viewer-prev',
        'backup-modal', 'btn-backup-full', 'btn-backup-lite', 'btn-backup-cancel',
        'btn-loop-circuit',
        'btn-clear-circuit', 'close-circuit-panel-btn',
        'btn-categories', 'btn-legend',
        'explorer-list', 'btn-open-my-circuits',
        'btn-bmc'
    ];
    
    // Récupération sécurisée des éléments
    ids.forEach(id => {
        const camelCaseId = id.replace(/-(\w)/g, (_, c) => c.toUpperCase());
        const el = document.getElementById(id);
        if (el) DOM[camelCaseId] = el;
    });

    if (DOM.btnOpenMyCircuits) {
        DOM.btnOpenMyCircuits.addEventListener('click', () => {
            renderExplorerList();
            switchSidebarTab('explorer');
        });
    }

    if (DOM.btnBmc) {
        DOM.btnBmc.addEventListener('click', () => {
            window.open('https://www.buymeacoffee.com/history_walk', '_blank');
        });
    }

    if (DOM.btnModeSelection) {
        updateSelectionModeButton(state.isSelectionModeActive);
    }

    DOM.tabButtons = document.querySelectorAll('.tab-button');
    DOM.sidebarPanels = document.querySelectorAll('.sidebar-panel');
    
    // Écouteurs globaux (définis une seule fois au démarrage)
    if (DOM.editorCancelBtn) DOM.editorCancelBtn.addEventListener('click', () => DOM.fullscreenEditor.style.display = 'none');
    
    if (DOM.editorSaveBtn) DOM.editorSaveBtn.addEventListener('click', () => {
        if (currentEditor.callback) currentEditor.callback(DOM.editorTextarea.value);
        DOM.fullscreenEditor.style.display = 'none';
    });

    if (DOM.closeCircuitPanelBtn) {
        DOM.closeCircuitPanelBtn.addEventListener('click', () => toggleSelectionMode(false));
    }

    // Activation du God Mode
    setupGodModeListener();

    // Initialisation des sous-modules UI
    initPhotoViewer();
    initCircuitListUI();
    RichEditor.init(); // Setup écouteurs Rich Modal

    // Listen for tab change requests from other modules
    eventBus.on('ui:request-tab-change', (tabName) => {
        switchSidebarTab(tabName);
    });
}

// --- ÉDITION DE CONTENU ---

function openFullscreenEditor(title, content, fieldId, poiId, onSave) {
    DOM.editorTitle.textContent = `Éditer: ${title}`;
    DOM.editorTextarea.value = content;
    currentEditor = { fieldId, poiId, callback: onSave };
    DOM.fullscreenEditor.style.display = 'flex';
    DOM.editorTextarea.focus();
}

export function setupEditableField(fieldId, poiId) {
    const container = document.querySelector(`.editable-field[data-field-id="${fieldId}"]`);
    if (!container) return;
    
    const displayEl = container.querySelector('.editable-text, .editable-content');
    const inputEl = container.querySelector('.editable-input');
    const editBtn = container.querySelector('.edit-btn');
    const saveBtn = container.querySelector('.save-btn');
    const cancelBtn = container.querySelector('.cancel-btn');
    const speakBtn = container.querySelector('.speak-btn');
    const categorySelect = document.getElementById('panel-category-select');
    
    const saveValue = async (newValue) => {
        const key = (fieldId === 'title') ? 'custom_title' : (fieldId === 'short_desc' ? 'Description_courte' : fieldId);
        await updatePoiData(poiId, key, newValue.trim());
        
        if (fieldId === 'title' && categorySelect) {
             const newCat = categorySelect.value;
             await updatePoiData(poiId, 'Catégorie', newCat);
        }
        
        openDetailsPanel(state.currentFeatureId, state.currentCircuitIndex);
    };
    
    if (editBtn) {
        editBtn.addEventListener('click', () => {
            // --- GOD MODE INTERCEPTION ---
            // Si on est Admin et qu'on clique sur le crayon du titre, on ouvre la modale riche
            if (state.isAdmin && fieldId === 'title') {
                import('./richEditor.js').then(m => m.RichEditor.openForEdit(poiId));
                return;
            }

            const currentFeature = state.loadedFeatures.find(f => getPoiId(f) === poiId);
            if (!currentFeature) return;

            const poiData = currentFeature.properties.userData || {};
            
            let content = '';
            if (fieldId === 'title') content = poiData.custom_title || currentFeature.properties['Nom du site FR'] || '';
            else if (fieldId === 'short_desc') content = poiData.Description_courte || currentFeature.properties.Desc_wpt || '';
            else content = poiData[fieldId] || currentFeature.properties[fieldId] || currentFeature.properties[fieldId.charAt(0).toUpperCase() + fieldId.slice(1)] || '';
            
            // Mode Mobile Fullscreen pour les textes longs
            if (isMobileView() && (fieldId === 'description' || fieldId === 'notes')) {
                openFullscreenEditor(fieldId, content, fieldId, poiId, saveValue);
            } else {
                // Mode Inline Desktop
                if (inputEl) {
                    inputEl.value = content;
                    inputEl.style.display = (inputEl.tagName === 'TEXTAREA') ? 'flex' : 'block';
                    inputEl.focus();
                }
                
                if (displayEl) displayEl.style.display = 'none';
                
                if (fieldId === 'title' && categorySelect) {
                    categorySelect.style.display = 'block';
                    categorySelect.value = currentFeature.properties['Catégorie'] || 'A définir';
                }
                
                editBtn.style.display = 'none';
                if(speakBtn) speakBtn.style.display = 'none';
                if(saveBtn) saveBtn.style.display = 'inline-flex';
                if(cancelBtn) cancelBtn.style.display = 'inline-flex';
            }
        });
    }

    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            if (displayEl) displayEl.style.display = (inputEl.tagName === 'TEXTAREA' || fieldId === 'title') ? '' : 'block';
            if (fieldId === 'title' && displayEl) displayEl.style.display = 'block';
            
            if (fieldId === 'title' && categorySelect) categorySelect.style.display = 'none';

            if (inputEl) inputEl.style.display = 'none';
            if (editBtn) editBtn.style.display = 'inline-flex';
            if (speakBtn) speakBtn.style.display = 'inline-flex';
            if (saveBtn) saveBtn.style.display = 'none';
            if (cancelBtn) cancelBtn.style.display = 'none';
        });
    }
    
    if (saveBtn) {
        saveBtn.addEventListener('click', () => { 
            if (inputEl) saveValue(inputEl.value); 
        });
    }

    if (speakBtn) {
        speakBtn.addEventListener('click', () => {
            if (displayEl) speakText(displayEl.textContent, speakBtn);
        });
    }
}

function setupAllEditableFields(poiId) {
    ['title', 'short_desc', 'description', 'notes'].forEach(fieldId => {
        setupEditableField(fieldId, poiId);
    });
}

// --- SETUP LISTENERS DU PANNEAU DE DÉTAILS ---

function setupDetailsEventListeners(poiId) {
    // Note : Comme le HTML est écrasé à chaque ouverture, pas de risque de double-binding ici
    // tant qu'on cible des éléments à l'intérieur du panneau.
    
    const inputPrice = document.getElementById('panel-price');
    if (inputPrice) {
        inputPrice.addEventListener('input', (e) => updatePoiData(poiId, 'price', e.target.value));
    }
    
    const chkVu = document.getElementById('panel-chk-vu');
    if (chkVu) {
        chkVu.addEventListener('change', (e) => {
            updatePoiData(poiId, 'vu', e.target.checked);

            if (!isMobileView()) {
                import('./data.js').then(dataModule => {
                    import('./map.js').then(mapModule => {
                        if (mapModule.refreshMapMarkers && dataModule.getFilteredFeatures) {
                            mapModule.refreshMapMarkers(dataModule.getFilteredFeatures());
                        }
                    });
                });

                if (state.activeFilters.vus) applyFilters();
            }
        });
    }

    // --- NOUVEAU CÂBLAGE : CASE INCONTOURNABLE ---
const chkInc = document.getElementById('panel-chk-incontournable');
if (chkInc) {
    chkInc.addEventListener('change', async (e) => {
        // 1. Sauvegarde (Mémoire + Disque) via votre fonction habituelle
        await updatePoiData(poiId, 'incontournable', e.target.checked);

        // 2. Mise à jour visuelle : On demande au Peintre de rafraîchir la carte
        if (!isMobileView()) {
            import('./data.js').then(dataModule => {
                import('./map.js').then(mapModule => {
                    if (mapModule.refreshMapMarkers && dataModule.getFilteredFeatures) {
                        // Le Tamis filtre, le Peintre dessine (avec le nouveau style doré !)
                        mapModule.refreshMapMarkers(dataModule.getFilteredFeatures());
                    }
                });
            });
        }
    });
}

    const chkVerif = document.getElementById('panel-chk-verified');
    if (chkVerif) {
        chkVerif.addEventListener('change', (e) => updatePoiData(poiId, 'verified', e.target.checked));
    }

    const softDeleteBtn = document.getElementById('btn-soft-delete');
    if (softDeleteBtn) {
        softDeleteBtn.addEventListener('click', () => {
            requestSoftDelete(state.currentFeatureId);
        });
    }

    const gmapsBtn = document.getElementById('open-gmaps-btn');
    if (gmapsBtn) {
        gmapsBtn.addEventListener('click', () => {
            const feature = state.loadedFeatures.find(f => getPoiId(f) === poiId);
            if (feature && feature.geometry && feature.geometry.coordinates) {
                const [lng, lat] = feature.geometry.coordinates;
                // Lien Google Maps universel
                window.open(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`, '_blank');
            } else {
                showToast("Coordonnées introuvables.", "error");
            }
        });
    }

    // --- NOUVEAU : BOUTON RECHERCHE GOOGLE ---
    const searchBtns = document.querySelectorAll('.btn-web-search');
    searchBtns.forEach(btn => {
        btn.addEventListener('click', () => {
             const feature = state.loadedFeatures.find(f => getPoiId(f) === poiId);
             if (feature) {
                 const name = getPoiName(feature);
                 // Construction de la requête "Nom + Djerba"
                 const query = encodeURIComponent(`${name} Djerba`);
                 window.open(`https://www.google.com/search?q=${query}`, '_blank');
             }
        });
    });

    // (Ancien bouton Admin supprimé - géré par le crayon standard en God Mode)

    // Gestion Photos DÉLÉGUÉE
    setupPhotoPanelListeners(poiId);

    // Ajustement du temps
    document.getElementById('time-increment-btn')?.addEventListener('click', () => adjustTime(5));
    document.getElementById('time-decrement-btn')?.addEventListener('click', () => adjustTime(-5));

    // Navigation Mobile vs Desktop
    if (isMobileView()) {
        const moveBtn = document.getElementById('mobile-move-poi-btn');
        if (moveBtn) {
            moveBtn.addEventListener('click', async () => {
                if (await showConfirm("Mise à jour GPS", "Mettre à jour avec votre position GPS actuelle ?", "Mettre à jour", "Annuler")) {
                    // On délègue la mise à jour et on affiche le toast
                    await updatePoiPosition(poiId);
                    showToast("Position mise à jour", "success");
                }
            });
        }
        // ON GARDE CES BOUTONS : ils sont essentiels pour la navigation mobile
        document.getElementById('details-prev-btn')?.addEventListener('click', () => navigatePoiDetails(-1));
        document.getElementById('details-next-btn')?.addEventListener('click', () => navigatePoiDetails(1));
        document.getElementById('details-close-btn')?.addEventListener('click', () => closeDetailsPanel(true));
    } else {
        // ON GARDE CE BLOC : il gère la navigation sur ordinateur
        document.getElementById('prev-poi-button')?.addEventListener('click', () => navigatePoiDetails(-1));
        document.getElementById('next-poi-button')?.addEventListener('click', () => navigatePoiDetails(1));
        document.getElementById('close-details-button')?.addEventListener('click', () => closeDetailsPanel());
    }
}

// --- OUVERTURE/FERMETURE ---

export function openDetailsPanel(featureId, circuitIndex = null) {
    if (featureId === undefined || featureId < 0) return;
    
    // Fermeture propre d'une éventuelle popup carte existante
    if(!isMobileView() && map) map.closePopup();

    // Sécurité: feature existe ?
    const feature = state.loadedFeatures[featureId];
    if (!feature) return;

    // --- CORRECTION : Auto-détection intelligente du circuit ---
    // Si la position n'est pas fournie mais qu'un circuit est actif, on la retrouve !
    if (circuitIndex === null && state.currentCircuit && state.currentCircuit.length > 0) {
        const currentId = getPoiId(feature);
        const foundIndex = state.currentCircuit.findIndex(f => getPoiId(f) === currentId);
        if (foundIndex !== -1) circuitIndex = foundIndex;
    }

    state.currentFeatureId = featureId;
    state.currentCircuitIndex = circuitIndex;

    // Injection du HTML
    const targetPanel = isMobileView() ? DOM.mobileMainContainer : DOM.detailsPanel;
    targetPanel.innerHTML = buildHTML(feature, circuitIndex);
    
    // Ré-attachement des écouteurs (sur les nouveaux éléments uniquement)
    const poiId = getPoiId(feature);
    setupAllEditableFields(poiId);
    setupDetailsEventListeners(poiId);

    // Initialisation icônes Lucide
    createIcons({ icons });

    if (isMobileView()) {
        targetPanel.style.display = 'block';
    } else {
        DOM.rightSidebar.style.display = 'flex';
        document.body.classList.add('sidebar-open');
        switchSidebarTab('details', true);
    }
}

export function closeDetailsPanel(goBackToList = false) {
    if (window.speechSynthesis && window.speechSynthesis.speaking) window.speechSynthesis.cancel();
    if (isDictationActive()) stopDictation();
    
    if (isMobileView()) {
        if(goBackToList && state.activeCircuitId) {
            renderMobilePoiList(state.currentCircuit);
        } else {
             renderMobileCircuitsList();
        }
    } else {
        if (state.isSelectionModeActive) {
            switchSidebarTab('circuit');
        } else {
            // Default to explorer when closing details
            renderExplorerList();
            switchSidebarTab('explorer');
            state.currentFeatureId = null;
        }
    }
}

// --- NAVIGATION ONGLETS ---

export function switchSidebarTab(tabName, isNavigating = false) {
    if (!isNavigating && window.speechSynthesis && window.speechSynthesis.speaking) window.speechSynthesis.cancel();
    if (isDictationActive()) stopDictation();
    
    DOM.sidebarPanels.forEach(panel => {
        if(panel) panel.classList.toggle('active', panel.dataset.panel === tabName);
    });
    DOM.tabButtons.forEach(button => {
        if(button) button.classList.toggle('active', button.dataset.tab === tabName);
    });
}

export function setupTabs() {
    DOM.tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabName = button.dataset.tab;
            if (tabName === 'explorer') {
                renderExplorerList();
                switchSidebarTab('explorer');
            } else if (tabName === 'details') {
                if (state.currentFeatureId !== null) {
                    // Si on revient sur l'onglet détails, on essaie de garder le contexte
                    const currentFeature = state.loadedFeatures[state.currentFeatureId];
                    if (currentFeature) {
                        const id = getPoiId(currentFeature);
                        const circuitIndex = state.currentCircuit ? state.currentCircuit.findIndex(f => getPoiId(f) === id) : -1;
                        openDetailsPanel(state.currentFeatureId, circuitIndex !== -1 ? circuitIndex : null);
                    }
                } else if (state.currentCircuit && state.currentCircuit.length > 0) {
                    // Si on ouvre l'onglet détails alors qu'un circuit est en cours mais qu'aucun POI n'est sélectionné,
                    // on ouvre le premier POI du circuit.
                    const firstFeature = state.currentCircuit[0];
                    const featureId = state.loadedFeatures.indexOf(firstFeature);
                    if (featureId > -1) {
                        openDetailsPanel(featureId, 0);
                    } else {
                        switchSidebarTab(tabName);
                    }
                } else {
                    switchSidebarTab(tabName);
                }
            } else {
                switchSidebarTab(tabName);
            }
        });
    });
}

// --- UTILITAIRES ---

function setupGodModeListener() {
    let buffer = [];
    let timeout;

    window.addEventListener('keydown', (e) => {
        // Ignorer si on est dans un champ texte
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        const key = e.key.toLowerCase();
        buffer.push(key);

        // Reset buffer si pause trop longue
        clearTimeout(timeout);
        timeout = setTimeout(() => { buffer = []; }, 1000);

        // Check sequence "god"
        if (buffer.join('').endsWith('god')) {
            state.isAdmin = !state.isAdmin;
            showToast(`Mode GOD : ${state.isAdmin ? 'ACTIVÉ' : 'DÉSACTIVÉ'}`, state.isAdmin ? 'success' : 'info');

            // Émettre un événement pour que l'UI se mette à jour
            eventBus.emit('admin:mode-toggled', state.isAdmin);

            buffer = []; // Reset
        }
    });
}

export function adjustTime(minutesToAdd) {
    if (state.currentFeatureId === null) return;
    const trigger = document.getElementById('panel-time-display');
    if (!trigger) return;

    // On délègue le calcul mathématique au spécialiste
    const newTime = calculateAdjustedTime(
        trigger.dataset.hours, 
        trigger.dataset.minutes, 
        minutesToAdd
    );
    
    const poiId = getPoiId(state.loadedFeatures[state.currentFeatureId]);
    updatePoiData(poiId, 'timeH', newTime.h);
    updatePoiData(poiId, 'timeM', newTime.m);
    
    // ui.js ne fait plus que l'affichage visuel
    trigger.textContent = `${String(newTime.h).padStart(2, '0')}h${String(newTime.m).padStart(2, '0')}`;
    trigger.dataset.hours = newTime.h;
    trigger.dataset.minutes = newTime.m;
}

export function populateZonesMenu() {
    const zonesMenu = document.getElementById('zonesMenu');
    const zonesLabel = document.getElementById('zonesLabel');
    if (!zonesMenu) return;

    zonesMenu.innerHTML = '';

    // On demande les données calculées au spécialiste
    const data = getZonesData();

    if (!data || data.sortedZones.length === 0) {
        zonesMenu.innerHTML = '<button disabled>Aucune zone visible</button>';
        return;
    }

    // Création du bouton "Toutes"
    const allZonesBtn = document.createElement('button');
    allZonesBtn.textContent = `Toutes les zones (${data.totalVisible})`;
    allZonesBtn.onclick = () => {
        state.activeFilters.zone = null;
        if(zonesLabel) zonesLabel.textContent = 'Zone';
        zonesMenu.style.display = 'none';
        applyFilters();
    };
    zonesMenu.appendChild(allZonesBtn);

    // Création des boutons par zone
    data.sortedZones.forEach(zone => {
        const zoneBtn = document.createElement('button');
        zoneBtn.textContent = `${zone} (${data.zoneCounts[zone]})`;
        zoneBtn.onclick = () => {
            state.activeFilters.zone = zone;
            if(zonesLabel) zonesLabel.textContent = zone;
            zonesMenu.style.display = 'none';
            applyFilters();
        };
        zonesMenu.appendChild(zoneBtn);
    });
}

export function populateCircuitsMenu() {
    const circuitsMenu = document.getElementById('circuitsMenu');
    if (!circuitsMenu) return;

    circuitsMenu.innerHTML = '';
    const visibleCircuits = state.myCircuits.filter(c => !c.isDeleted);

    if (visibleCircuits.length === 0) {
        circuitsMenu.innerHTML = '<button disabled>Aucun circuit</button>';
        return;
    }

    visibleCircuits.forEach(circuit => {
        const btn = document.createElement('button');
        btn.textContent = escapeXml(circuit.name);
        btn.onclick = () => {
            loadCircuitById(circuit.id);
            switchSidebarTab('circuit');
            circuitsMenu.style.display = 'none';
        };
        circuitsMenu.appendChild(btn);
    });
}

// --- NOTIFICATIONS (TOASTS) ---

export function populateAddPoiModalCategories() {
    const select = document.getElementById('new-poi-category');
    if (!select) return;

    select.innerHTML = POI_CATEGORIES.map(c => 
        `<option value="${c}">${c}</option>`
    ).join('');
    
    select.value = "A définir";
}

export function populateCategoriesMenu() {
    const menu = document.getElementById('categoriesMenu');
    if (!menu) return;

    menu.innerHTML = '';

    POI_CATEGORIES.forEach(cat => {
        const wrapper = document.createElement('label');
        wrapper.style.display = 'flex';
        wrapper.style.alignItems = 'center';
        wrapper.style.padding = '8px 16px';
        wrapper.style.cursor = 'pointer';
        wrapper.style.userSelect = 'none';

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.value = cat;
        cb.style.marginRight = '10px';

        if (state.activeFilters.categories.includes(cat)) {
            cb.checked = true;
        }

        cb.addEventListener('change', (e) => {
            if (e.target.checked) {
                state.activeFilters.categories.push(cat);
            } else {
                state.activeFilters.categories = state.activeFilters.categories.filter(c => c !== cat);
            }
            applyFilters();
        });

        wrapper.appendChild(cb);
        wrapper.appendChild(document.createTextNode(cat));

        wrapper.addEventListener('mouseenter', () => wrapper.style.backgroundColor = 'var(--surface-muted)');
        wrapper.addEventListener('mouseleave', () => wrapper.style.backgroundColor = 'transparent');

        menu.appendChild(wrapper);
    });
}

export function updateSelectionModeButton(isActive) {
    const btn = document.getElementById('btn-mode-selection');
    if (!btn) return;

    if (isActive) {
        btn.innerHTML = `<i data-lucide="map-pin-plus"></i><span>Créer circuit</span>`;
        btn.title = "Mode création activé";
    } else {
        btn.innerHTML = `<i data-lucide="map-pin-off"></i><span>Explorer</span>`;
        btn.title = "Mode consultation";
    }
    createIcons({ icons });
}

export function showLegendModal() {
    const title = "Légende des Marqueurs";
    const message = `
    <div style="text-align: left; display: flex; flex-direction: column; gap: 10px;">
        <div style="display: flex; align-items: center; gap: 10px;">
            <div style="width: 20px; height: 20px; border-radius: 50%; border: 3px solid #10B981; box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.3);"></div>
            <span><strong>Visité</strong> (Lieu marqué comme vu)</span>
        </div>
        <div style="display: flex; align-items: center; gap: 10px;">
            <div style="width: 20px; height: 20px; border-radius: 50%; border: 3px solid #F97316; box-shadow: 0 0 0 2px rgba(249, 115, 22, 0.3);"></div>
            <span><strong>Planifié</strong> (Ajouté à un circuit)</span>
        </div>
        <div style="display: flex; align-items: center; gap: 10px;">
            <div style="display: flex; align-items: center; justify-content: center; width: 24px; height: 24px;">
                <i data-lucide="gem" style="color: #FFD700; fill: #FFD700; width: 20px; height: 20px;"></i>
            </div>
            <span><strong>Incontournable</strong> (Lieu VIP à ne pas manquer)</span>
        </div>
    </div>`;

    showConfirm(title, message, "Fermer", null, false).catch(() => {});
}

export function openRestoreModal() {
    const deletedCircuits = state.myCircuits.filter(c => c.isDeleted);

    if (deletedCircuits.length === 0) {
        showToast("Corbeille vide.", "info");
        return;
    }

    const html = `
        <div style="display: flex; flex-direction: column; gap: 10px; max-height: 300px; overflow-y: auto;">
            ${deletedCircuits.map(c => `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; background: var(--surface-muted); border-radius: 8px;">
                    <span style="font-weight: 500; color: var(--ink); text-align: left;">${escapeXml(c.name)}</span>
                    <button class="restore-btn" data-id="${c.id}" style="background: transparent; color: var(--ok); border: 1px solid var(--ok); border-radius: 6px; padding: 6px 12px; cursor: pointer; font-weight: 600;">
                        Restaurer
                    </button>
                </div>
            `).join('')}
        </div>
    `;

    const modal = document.getElementById('custom-modal-overlay');
    const titleEl = document.getElementById('custom-modal-title');
    const msgEl = document.getElementById('custom-modal-message');
    const actionsEl = document.getElementById('custom-modal-actions');

    if (!modal) return;

    titleEl.textContent = "Corbeille";
    msgEl.innerHTML = html;
    actionsEl.innerHTML = `<button class="custom-modal-btn secondary" id="btn-close-restore">Fermer</button>`;

    modal.classList.add('active');

    const closeBtn = document.getElementById('btn-close-restore');
    if (closeBtn) closeBtn.onclick = () => modal.classList.remove('active');

    msgEl.querySelectorAll('.restore-btn').forEach(btn => {
        btn.onclick = async (e) => {
            const id = e.currentTarget.dataset.id;
            await restoreCircuit(id);
            const c = state.myCircuits.find(cir => cir.id === id);
            if(c) c.isDeleted = false;

            showToast("Circuit restauré", "success");
            modal.classList.remove('active');
            eventBus.emit('circuit:list-updated');
        };
    });
}

// --- FONCTION DE SUPPRESSION DOUCE (Déplacée de main.js) ---
export async function requestSoftDelete(idOrIndex) {
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

        // On ferme le panneau
        closeDetailsPanel(true);

        // Refresh selon mode
        if (isMobileView()) {
            switchMobileView('circuits'); // Refresh liste
        } else {
            applyFilters();
        }
    }
}
