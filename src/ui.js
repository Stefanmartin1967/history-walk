// ui.js
import { state, POI_CATEGORIES } from './state.js';
import { getPoiId, getPoiName, updatePoiData, getDomainFromUrl, applyFilters } from './data.js';
import { speakText, stopDictation, isDictationActive } from './voice.js';
import { loadCircuitById, clearCircuit, navigatePoiDetails, setCircuitVisitedState } from './circuit.js';
import { escapeXml, recalculatePlannedCountersForMap } from './gpx.js';
import { map } from './map.js';
import { deleteCircuitById } from './database.js';
import { isMobileView, updatePoiPosition, renderMobileCircuitsList, renderMobilePoiList } from './mobile.js';
import { createIcons, icons } from 'lucide';

export const DOM = {};
let currentEditor = { fieldId: null, poiId: null, callback: null };
let currentPhotoList = [];
let currentPhotoIndex = 0;

const ICONS = {
    mosque: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20H4v-7a8 8 0 0 1 16 0z"/><path d="M12 5V2"/><circle cx="12" cy="8" r="2"/></svg>`,    
    pen: `<i data-lucide="pencil" style="width:18px;height:18px;"></i>`,
    check: `<i data-lucide="check" style="width:18px;height:18px;"></i>`,
    chevronLeft: `<i data-lucide="chevron-left" style="width:18px;height:18px;"></i>`,
    chevronRight: `<i data-lucide="chevron-right" style="width:18px;height:18px;"></i>`,
    x: `<i data-lucide="x" style="width:18px;height:18px;"></i>`,
    arrowLeftToLine: `<i data-lucide="arrow-left-to-line" style="width:18px;height:18px;"></i>`,
    volume: `<i data-lucide="volume-2" style="width:18px;height:18px;"></i>`,
    imagePlus: `<i data-lucide="image-plus" style="width:18px;height:18px;"></i>`,
    locate: `<i data-lucide="locate-fixed" style="width:18px;height:18px;"></i>`,
    clock: `<i data-lucide="clock" style="width:18px;height:18px;"></i>`,
    minus: `<i data-lucide="minus" style="width:18px;height:18px;"></i>`,
    plus: `<i data-lucide="plus" style="width:18px;height:18px;"></i>`,
    ticket: `<i data-lucide="ticket" style="width:18px;height:18px;"></i>`,
    upload: `<i data-lucide="upload" style="width:18px;height:18px;"></i>`,
    download: `<i data-lucide="download" style="width:18px;height:18px;"></i>`,
    play: `<i data-lucide="play" style="width:18px;height:18px;"></i>`,
    trash: `<i data-lucide="trash-2" style="width:18px;height:18px;"></i>`,
    googleMaps: `<i data-lucide="map-pin" style="width:18px;height:18px;"></i>`
};

export function initializeDomReferences() {
    const ids = [
        'geojson-loader', 'search-input', 'search-results', 'btn-mode-selection', 'right-sidebar', 'sidebar-tabs', 
        'details-panel', 'circuit-panel', 'circuit-steps-list', 'circuit-title-text', 'circuit-title-input', 
        'circuit-description', 'edit-circuit-title-button', 'circuit-poi-count', 'circuit-distance', 'circuits-modal', 
        'close-circuits-modal', 'circuits-list-container', 'gpx-importer', 'btn-my-circuits', 'btn-export-gpx', 
        'btn-import-gpx', 'loader-overlay', 'btn-save-data', 'btn-restore-data', 'restore-loader', 'btn-open-geojson', 
        'mobile-container', 'mobile-main-container', 'mobile-nav', 'fullscreen-editor', 'editor-title', 
        'editor-cancel-btn', 'editor-save-btn', 'editor-textarea', 'destination-loader',
        'photo-viewer', 'viewer-img', 'viewer-next', 'viewer-prev',
        'backup-modal', 'btn-backup-full', 'btn-backup-lite', 'btn-backup-cancel',
        'btn-loop-circuit',
        'btn-clear-circuit'
    ];
    ids.forEach(id => {
        const camelCaseId = id.replace(/-(\w)/g, (_, c) => c.toUpperCase());
        DOM[camelCaseId] = document.getElementById(id);
    });
    DOM.tabButtons = document.querySelectorAll('.tab-button');
    DOM.sidebarPanels = document.querySelectorAll('.sidebar-panel');
    
    if (DOM.editorCancelBtn) DOM.editorCancelBtn.addEventListener('click', () => DOM.fullscreenEditor.style.display = 'none');
    if (DOM.editorSaveBtn) DOM.editorSaveBtn.addEventListener('click', () => {
        if (currentEditor.callback) currentEditor.callback(DOM.editorTextarea.value);
        DOM.fullscreenEditor.style.display = 'none';
    });

    const closeViewer = document.querySelector('.close-viewer');
    if (closeViewer) {
        closeViewer.addEventListener('click', () => {
            DOM.photoViewer.style.display = 'none';
        });
        DOM.photoViewer.addEventListener('click', (e) => {
            if(e.target === DOM.photoViewer) DOM.photoViewer.style.display = 'none';
        });
    }
    
    if(DOM.viewerNext) DOM.viewerNext.addEventListener('click', (e) => { e.stopPropagation(); changePhoto(1); });
    if(DOM.viewerPrev) DOM.viewerPrev.addEventListener('click', (e) => { e.stopPropagation(); changePhoto(-1); });
    
    document.addEventListener('keydown', (e) => {
        if (DOM.photoViewer && DOM.photoViewer.style.display === 'block') {
            if (e.key === 'ArrowRight') changePhoto(1);
            if (e.key === 'ArrowLeft') changePhoto(-1);
            if (e.key === 'Escape') DOM.photoViewer.style.display = 'none';
        }
    });
}

function changePhoto(direction) {
    if (currentPhotoList.length <= 1) return;
    currentPhotoIndex += direction;
    if (currentPhotoIndex >= currentPhotoList.length) currentPhotoIndex = 0;
    if (currentPhotoIndex < 0) currentPhotoIndex = currentPhotoList.length - 1;
    DOM.viewerImg.src = currentPhotoList[currentPhotoIndex];
}

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
            const currentFeature = state.loadedFeatures.find(f => getPoiId(f) === poiId);
            const poiData = currentFeature.properties.userData || {};
            
            let content = '';
            if (fieldId === 'title') content = poiData.custom_title || currentFeature.properties['Nom du site FR'] || '';
            else if (fieldId === 'short_desc') content = poiData.Description_courte || currentFeature.properties.Desc_wpt || '';
            else content = poiData[fieldId] || currentFeature.properties[fieldId] || currentFeature.properties[fieldId.charAt(0).toUpperCase() + fieldId.slice(1)] || '';
            
            if (isMobileView() && (fieldId === 'description' || fieldId === 'notes')) {
                openFullscreenEditor(fieldId, content, fieldId, poiId, saveValue);
            } else {
                inputEl.value = content;
                if(displayEl) displayEl.style.display = 'none';
                inputEl.style.display = (inputEl.tagName === 'TEXTAREA') ? 'flex' : 'block';
                
                if (fieldId === 'title' && categorySelect) {
                    categorySelect.style.display = 'block';
                    categorySelect.value = currentFeature.properties['Catégorie'] || 'A définir';
                }
                
                editBtn.style.display = 'none';
                if(speakBtn) speakBtn.style.display = 'none';
                if(saveBtn) saveBtn.style.display = 'inline-flex';
                if(cancelBtn) cancelBtn.style.display = 'inline-flex';
                inputEl.focus();
            }
        });
    }

    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            if(displayEl) displayEl.style.display = (inputEl.tagName === 'TEXTAREA' || fieldId === 'title') ? '' : 'block';
            if(fieldId === 'title') { if(displayEl) displayEl.style.display = 'block'; }
            
            if (fieldId === 'title' && categorySelect) {
                categorySelect.style.display = 'none';
            }

            inputEl.style.display = 'none';
            editBtn.style.display = 'inline-flex';
            if(speakBtn) speakBtn.style.display = 'inline-flex';
            if(saveBtn) saveBtn.style.display = 'none';
            if(cancelBtn) cancelBtn.style.display = 'none';
        });
    }
    
    if (saveBtn) {
        saveBtn.addEventListener('click', () => { saveValue(inputEl.value); });
    }

    if (speakBtn) {
        speakBtn.addEventListener('click', () => {
            const textToSpeak = displayEl.textContent;
            speakText(textToSpeak, speakBtn);
        });
    }
}

function renderSource(allProps) {
    const sourceString = allProps.Source;
    if (!sourceString || typeof sourceString !== 'string' || sourceString.trim() === '') return '';
    const firstLine = sourceString.split('\n')[0].trim();
    try {
        const fullUrl = firstLine.startsWith('http') ? firstLine : `https://${firstLine}`;
        new URL(fullUrl);
        const domain = new URL(fullUrl).hostname.replace(/^www\./, '');
        return `<div class="source-container">Source: <a href="${fullUrl}" target="_blank" rel="noopener noreferrer">${domain}</a></div>`;
    } catch (_) {
        return `<div class="source-container">Source: <span>${escapeXml(firstLine)}</span></div>`;
    }
}

function setupAllEditableFields(poiId) {
    ['title', 'short_desc', 'description', 'notes'].forEach(fieldId => {
        setupEditableField(fieldId, poiId);
    });
}

async function compressImage(file, targetMinSize = 800) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const elem = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                const smallestSide = Math.min(width, height);
                if (smallestSide > targetMinSize) {
                    const ratio = targetMinSize / smallestSide;
                    width *= ratio;
                    height *= ratio;
                }
                elem.width = width;
                elem.height = height;
                const ctx = elem.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                resolve(elem.toDataURL('image/jpeg', 0.8)); 
            };
        };
    });
}

function setupDetailsEventListeners(poiId) {
    document.getElementById('panel-price').addEventListener('input', (e) => updatePoiData(poiId, 'price', e.target.value));
    
    document.getElementById('panel-chk-vu').addEventListener('change', (e) => {
        updatePoiData(poiId, 'vu', e.target.checked);
        if (state.activeFilters.vus && !isMobileView()) applyFilters();
    });

    document.getElementById('panel-chk-incontournable').addEventListener('change', (e) => {
        updatePoiData(poiId, 'incontournable', e.target.checked);
        if ((state.activeFilters.vus || state.activeFilters.planifies) && !isMobileView()) applyFilters();
    });

    document.getElementById('panel-chk-verified').addEventListener('change', (e) => {
        updatePoiData(poiId, 'verified', e.target.checked);
    });

    const softDeleteBtn = document.getElementById('btn-soft-delete');
    if (softDeleteBtn) {
        softDeleteBtn.addEventListener('click', () => {
            if (typeof window.requestSoftDelete === 'function') {
                window.requestSoftDelete(state.currentFeatureId);
            } else {
                showToast("Erreur: Fonction de suppression non chargée.", "error");
            }
        });
    }

    const gmapsBtn = document.getElementById('open-gmaps-btn');
    if (gmapsBtn) {
        gmapsBtn.addEventListener('click', () => {
            const feature = state.loadedFeatures.find(f => getPoiId(f) === poiId);
            if (feature && feature.geometry && feature.geometry.coordinates) {
                const [lng, lat] = feature.geometry.coordinates;
                window.open(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`, '_blank');
            } else {
                showToast("Coordonnées introuvables.", "error");
            }
        });
    }

    const photoInput = document.getElementById('panel-photo-input');
    const photoBtn = document.querySelector('.photo-placeholder');
    
    if(photoBtn) photoBtn.addEventListener('click', () => photoInput.click());

    if(photoInput) {
        photoInput.addEventListener('change', async (e) => {
            const files = Array.from(e.target.files);
            if(files.length === 0) return;
            showToast("Traitement des photos...", "info");
            
            const feature = state.loadedFeatures.find(f => getPoiId(f) === poiId);
            const poiData = feature.properties.userData || {};
            const currentPhotos = poiData.photos || [];
            
            const newPhotos = [];
            for(const file of files) {
                try {
                    const compressed = await compressImage(file);
                    newPhotos.push(compressed);
                } catch(err) {
                    console.error("Erreur image", err);
                }
            }

            const updatedPhotos = [...currentPhotos, ...newPhotos];
            await updatePoiData(poiId, 'photos', updatedPhotos);
            showToast(`${newPhotos.length} photo(s) ajoutée(s).`, "success");
            openDetailsPanel(state.currentFeatureId, state.currentCircuitIndex);
        });
    }

    document.querySelectorAll('.photo-item .img-preview').forEach(img => {
        img.addEventListener('click', (e) => {
            const feature = state.loadedFeatures.find(f => getPoiId(f) === poiId);
            const poiData = feature.properties.userData || {};
            currentPhotoList = poiData.photos || [];
            currentPhotoIndex = parseInt(e.target.closest('.photo-item').querySelector('.photo-delete-btn').dataset.index, 10);
            
            DOM.viewerImg.src = currentPhotoList[currentPhotoIndex];
            DOM.photoViewer.style.display = 'flex';
            
            const displayNav = currentPhotoList.length > 1 ? 'block' : 'none';
            if(DOM.viewerNext) DOM.viewerNext.style.display = displayNav;
            if(DOM.viewerPrev) DOM.viewerPrev.style.display = displayNav;
        });
    });

    document.querySelectorAll('.photo-delete-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            if(!confirm("Supprimer cette photo ?")) return;
            const index = parseInt(e.target.closest('.photo-delete-btn').dataset.index, 10);
            const feature = state.loadedFeatures.find(f => getPoiId(f) === poiId);
            const currentPhotos = feature.properties.userData.photos || [];
            const updatedPhotos = currentPhotos.filter((_, i) => i !== index);
            await updatePoiData(poiId, 'photos', updatedPhotos);
            openDetailsPanel(state.currentFeatureId, state.currentCircuitIndex);
        });
    });

    document.getElementById('time-increment-btn')?.addEventListener('click', () => adjustTime(5));
    document.getElementById('time-decrement-btn')?.addEventListener('click', () => adjustTime(-5));

    if (isMobileView()) {
        const moveBtn = document.getElementById('mobile-move-poi-btn');
        if (moveBtn) {
            moveBtn.addEventListener('click', () => {
                if (confirm("Mettre à jour avec votre position GPS actuelle ?")) {
                    updatePoiPosition(poiId);
                }
            });
        }
        document.getElementById('details-prev-btn')?.addEventListener('click', () => navigatePoiDetails(-1));
        document.getElementById('details-next-btn')?.addEventListener('click', () => navigatePoiDetails(1));
        document.getElementById('details-close-btn')?.addEventListener('click', () => closeDetailsPanel(true));
    } else {
        document.getElementById('prev-poi-button')?.addEventListener('click', () => navigatePoiDetails(-1));
        document.getElementById('next-poi-button')?.addEventListener('click', () => navigatePoiDetails(1));
        document.getElementById('close-details-button')?.addEventListener('click', closeDetailsPanel);
    }
}

function buildDetailsPanelHtml(feature, circuitIndex) {
    const allProps = { ...feature.properties, ...feature.properties.userData };
    const poiName = getPoiName(feature);
    const inCircuit = circuitIndex !== null;
    const currentCat = allProps['Catégorie'] || '';

    const categoryOptions = POI_CATEGORIES.map(c => 
        `<option value="${c}" ${c === currentCat ? 'selected' : ''}>${c}</option>`
    ).join('');

    let timeText = '00h00', hours = 0, minutes = 0;
    if (allProps.timeH !== undefined && allProps.timeM !== undefined) {
        hours = allProps.timeH; minutes = allProps.timeM;
    } else if (allProps['Temps de visite']) {
        const timeParts = allProps['Temps de visite'].split(':');
        hours = parseInt(timeParts[0], 10) || 0;
        minutes = parseInt(timeParts[1], 10) || 0;
    }
    timeText = `${String(hours).padStart(2, '0')}h${String(minutes).padStart(2, '0')}`;
    const priceValue = allProps.price !== undefined ? allProps.price : (parseFloat(allProps['Prix d\'entrée']) || '');
    const isVuChecked = allProps.vu ? 'checked' : '';
    const isIncontournableChecked = allProps.incontournable ? 'checked' : '';
    const isVerifiedChecked = allProps.verified ? 'checked' : '';

    const photos = allProps.photos || [];
    let photosHtml = photos.map((src, index) => `
        <div class="photo-item">
            <img src="${src}" class="img-preview" title="Cliquez pour agrandir">
            <button class="photo-delete-btn" data-index="${index}">${ICONS.trash}</button>
        </div>
    `).join('');

    const practicalDetailsHtml = `
        <div class="detail-section">
            <h3>Détails Pratiques</h3>
            <div class="content structured-input-row">
                <div class="input-group">
                    ${ICONS.clock}
                    <div class="time-editor">
                        <button class="time-adjust-btn" id="time-decrement-btn" title="- 5 min">${ICONS.minus}</button>
                        <span id="panel-time-display" class="duration-picker-trigger" data-hours="${hours}" data-minutes="${minutes}">${timeText}</span>
                        <button class="time-adjust-btn" id="time-increment-btn" title="+ 5 min">${ICONS.plus}</button>
                    </div>
                </div>
                <div class="input-group">
                    ${ICONS.ticket}
                    <div class="price-editor fields">
                        <input type="number" id="panel-price" min="0" placeholder="0" value="${priceValue}"><span class="currency">TND</span>
                    </div>
                </div>
            </div>
        </div>`;

    const gmapsButtonHtml = `<button class="action-button" id="open-gmaps-btn" title="Itinéraire Google Maps">${ICONS.googleMaps}</button>`;
    
    const categorySelectHtml = `
        <select id="panel-category-select" class="editable-input header-input" style="display:none; margin-top:5px; width:100%; font-size:14px;">
            ${categoryOptions}
        </select>
    `;

    const pcHtml = `
        <div class="panel-header editable-field" data-field-id="title">
            <div class="header-top-row" style="display:flex; justify-content:space-between; align-items:start; width:100%; margin-bottom:10px;">
                <div class="editable-content" style="flex:1;">
                    <h2 id="panel-title-display" title="${escapeXml(poiName)}">${escapeXml(poiName)}</h2>
                    <p class="panel-nom-arabe">${escapeXml(allProps['Nom du site arabe'] || '')}</p>
                </div>
                <div class="details-nav">
                    ${inCircuit ? `<button class="header-btn" id="prev-poi-button" title="Précédent" ${circuitIndex === 0 ? 'disabled' : ''}>${ICONS.chevronLeft}</button>
                                  <button class="header-btn" id="next-poi-button" title="Suivant" ${circuitIndex === state.currentCircuit.length - 1 ? 'disabled' : ''}>${ICONS.chevronRight}</button>` : ''}
                    <button class="header-btn" id="close-details-button" title="${state.isSelectionModeActive ? 'Retour' : 'Fermer'}">${state.isSelectionModeActive ? ICONS.arrowLeftToLine : ICONS.x}</button>
                </div>
            </div>
            
            <input type="text" id="panel-title-input" class="editable-input header-input" style="display: none; width:100%;">
            ${categorySelectHtml}
            
            <div class="edit-controls" style="display:flex; gap:5px; margin-top:5px; justify-content:flex-start;">
                ${gmapsButtonHtml}
                <button class="action-button edit-btn" title="Modifier le nom">${ICONS.pen}</button>
                <button class="action-button" id="btn-soft-delete" title="Signaler pour suppression" style="color: var(--danger);">${ICONS.trash}</button>
                <button class="action-button save-btn" title="Sauvegarder" style="display: none;">${ICONS.check}</button>
                <button class="action-button cancel-btn" title="Annuler" style="display: none;">${ICONS.x}</button>
            </div>
        </div>
        <div class="panel-content">
            <div class="detail-section editable-field" data-field-id="short_desc">
                <h3>Description Courte (GPX)
                    <div class="edit-controls section-controls">
                        <button class="action-button edit-btn">${ICONS.pen}</button>
                        <button class="action-button save-btn" style="display: none;">${ICONS.check}</button>
                        <button class="action-button cancel-btn" style="display: none;">${ICONS.x}</button>
                    </div>
                </h3>
                <div class="content">
                    <p id="panel-short-desc-display" class="editable-text short-text">${escapeXml(allProps.Description_courte || allProps.Desc_wpt || '')}</p>
                    <input type="text" id="panel-short-desc-input" class="editable-input" style="display: none;" placeholder="Résumé pour l'export GPX..." maxlength="250">
                </div>
            </div>
            <div class="detail-section editable-field description-section" data-field-id="description">
                <h3>Description
                    <div class="edit-controls section-controls">
                        <button class="action-button speak-btn">${ICONS.volume}</button>
                        <button class="action-button edit-btn">${ICONS.pen}</button>
                        <button class="action-button save-btn" style="display: none;">${ICONS.check}</button>
                        <button class="action-button cancel-btn" style="display: none;">${ICONS.x}</button>
                    </div>
                </h3>
                <div class="content">
                    <div id="panel-description-display" class="description-content editable-text">${(allProps.description || allProps.Description || '').replace(/\n/g, '<br>')}</div>
                    <textarea id="panel-description-input" class="editable-input" style="display: none;" spellcheck="true"></textarea>
                    ${renderSource(allProps)}
                </div>
            </div>
            ${practicalDetailsHtml}
            <div class="detail-section">
                <h3>Mon Suivi</h3>
                <div class="content checkbox-group">
                  <label class="checkbox-label"><input type="checkbox" id="panel-chk-vu" ${isVuChecked}> Visité</label>
                  <label class="checkbox-label"><input type="checkbox" id="panel-chk-incontournable" ${isIncontournableChecked}> Incontournable</label>
                  <label class="checkbox-label"><input type="checkbox" id="panel-chk-verified" ${isVerifiedChecked}> Vérifié</label>
                </div>
            </div>
            <div class="detail-section editable-field notes-section" data-field-id="notes">
                <h3>Notes Personnelles
                     <div class="edit-controls section-controls">
                        <button class="action-button speak-btn">${ICONS.volume}</button>
                        <button class="action-button edit-btn">${ICONS.pen}</button>
                        <button class="action-button save-btn" style="display: none;">${ICONS.check}</button>
                        <button class="action-button cancel-btn" style="display: none;">${ICONS.x}</button>
                    </div>
                </h3>
                <div class="content">
                    <div id="panel-notes-display" class="description-content editable-text">${(allProps.notes || '').replace(/\n/g, '<br>')}</div>
                    <textarea id="panel-notes-input" class="editable-input" placeholder="Ajoutez vos notes ici..." style="display:none;"></textarea>
                </div>
            </div>
            <div class="detail-section photos-section">
                <h3>Photos (${photos.length})</h3>
                <div class="content">
                    <div class="photos-grid-scroller">
                        ${photosHtml}
                        <div class="photo-placeholder" title="Ajouter une photo">${ICONS.imagePlus}</div>
                    </div>
                    <input type="file" id="panel-photo-input" accept="image/*" multiple style="display: none;">
                </div>
            </div>
        </div>`;
    
    const mobileHtml = `
        <div class="panel-content">
            <div class="detail-section editable-field" data-field-id="title">
                <div class="content">
                    <div class="title-section-line">
                        <div class="title-names editable-content">
                            <h2 class="editable-text">${escapeXml(poiName)}</h2>
                        </div>
                        <div class="title-actions details-header-nav">
                            <button id="details-prev-btn" data-direction="-1" ${(!inCircuit || circuitIndex === 0) ? 'disabled' : ''}>${ICONS.chevronLeft}</button>
                            <button id="details-next-btn" data-direction="1" ${(!inCircuit || circuitIndex === state.currentCircuit.length - 1) ? 'disabled' : ''}>${ICONS.chevronRight}</button>
                            <button id="details-close-btn">${ICONS.x}</button>
                        </div>
                    </div>
                     <input type="text" class="editable-input" style="display: none;" value="${escapeXml(poiName)}">
                     ${categorySelectHtml}
                     
                    <div class="title-section-line">
                        <div class="title-names">
                             <p class="panel-nom-arabe editable-text">${escapeXml(allProps['Nom du site arabe'] || '')}</p>
                        </div>
                        <div class="title-actions edit-controls">
                             ${gmapsButtonHtml}
                             <button id="mobile-move-poi-btn" class="action-button" title="Mettre à jour la position">${ICONS.locate}</button>
                             <button class="action-button edit-btn" title="Éditer">${ICONS.pen}</button>
                             <button class="action-button" id="btn-soft-delete" title="Supprimer (Corbeille)" style="color: var(--danger);">${ICONS.trash}</button>
                             <button class="action-button save-btn" title="Sauvegarder" style="display: none;">${ICONS.check}</button>
                             <button class="action-button cancel-btn" title="Annuler" style="display: none;">${ICONS.x}</button>
                        </div>
                    </div>
                </div>
            </div>
            <div class="detail-section editable-field" data-field-id="short_desc">
                <h3>Description Courte (GPX)
                    <div class="edit-controls section-controls">
                        <button class="action-button edit-btn" title="Éditer">${ICONS.pen}</button>
                        <button class="action-button save-btn" title="Sauvegarder" style="display: none;">${ICONS.check}</button>
                        <button class="action-button cancel-btn" title="Annuler" style="display: none;">${ICONS.x}</button>
                    </div>
                </h3>
                <div class="content">
                    <p class="editable-text short-text">${escapeXml(allProps.Description_courte || allProps.Desc_wpt || '')}</p>
                    <input type="text" class="editable-input" style="display: none;" placeholder="Résumé pour l'export GPX..." maxlength="250">
                </div>
            </div>
            <div class="detail-section editable-field description-section" data-field-id="description">
                <h3>Description
                    <div class="edit-controls section-controls">
                        <button class="action-button speak-btn" title="Lire la description">${ICONS.volume}</button>
                        <button class="action-button edit-btn" title="Éditer">${ICONS.pen}</button>
                    </div>
                </h3>
                <div class="content">
                    <div class="description-content editable-text">${(allProps.description || allProps.Description || '').replace(/\n/g, '<br>')}</div>
                    ${renderSource(allProps)}
                </div>
            </div>
            ${practicalDetailsHtml}
            <div class="detail-section">
                <h3>Mon Suivi</h3>
                <div class="content checkbox-group">
                  <label class="checkbox-label"><input type="checkbox" id="panel-chk-vu" ${isVuChecked}> Visité</label>
                  <label class="checkbox-label"><input type="checkbox" id="panel-chk-incontournable" ${isIncontournableChecked}> Incontournable</label>
                  <label class="checkbox-label"><input type="checkbox" id="panel-chk-verified" ${isVerifiedChecked}> Vérifié</label>
                </div>
            </div>
            <div class="detail-section editable-field notes-section" data-field-id="notes">
                <h3>Notes Personnelles
                    <div class="edit-controls section-controls">
                        <button class="action-button speak-btn" title="Lire les notes">${ICONS.volume}</button>
                        <button class="action-button edit-btn" title="Éditer">${ICONS.pen}</button>
                    </div>
                </h3>
                <div class="content">
                    <div class="description-content editable-text">${(allProps.notes || '').replace(/\n/g, '<br>')}</div>
                </div>
            </div>
            <div class="detail-section photos-section">
                <h3>Photos (${photos.length})</h3>
                <div class="content">
                    <div class="photos-grid-scroller">
                        ${photosHtml}
                        <div class="photo-placeholder" title="Ajouter une photo">${ICONS.imagePlus}</div>
                    </div>
                    <input type="file" id="panel-photo-input" accept="image/*" multiple style="display: none;">
                </div>
            </div>
        </div>`;

    return isMobileView() ? mobileHtml : pcHtml;
}


export function openDetailsPanel(featureId, circuitIndex = null) {
    if (featureId === undefined || featureId < 0) return;
    if(!isMobileView() && map) map.closePopup();

    state.currentFeatureId = featureId;
    state.currentCircuitIndex = circuitIndex;

    const feature = state.loadedFeatures[featureId];
    if (!feature) return;

    const targetPanel = isMobileView() ? DOM.mobileMainContainer : DOM.detailsPanel;
    targetPanel.innerHTML = buildDetailsPanelHtml(feature, circuitIndex);
    
    const poiId = getPoiId(feature);
    setupAllEditableFields(poiId);
    setupDetailsEventListeners(poiId);

    createIcons({ icons });

    if (isMobileView()) {
        targetPanel.style.display = 'block';
    } else {
        DOM.rightSidebar.style.display = 'flex';
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
            DOM.rightSidebar.style.display = 'none';
            state.currentFeatureId = null;
        }
    }
}

export function switchSidebarTab(tabName, isNavigating = false) {
    if (!isNavigating && window.speechSynthesis && window.speechSynthesis.speaking) window.speechSynthesis.cancel();
    if (isDictationActive()) stopDictation();
    DOM.sidebarPanels.forEach(panel => panel.classList.toggle('active', panel.dataset.panel === tabName));
    DOM.tabButtons.forEach(button => button.classList.toggle('active', button.dataset.tab === tabName));
}

export function setupTabs() {
    DOM.tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabName = button.dataset.tab;
            if (tabName === 'details' && state.currentFeatureId !== null) {
                const circuitIndex = state.currentCircuit.findIndex(f => getPoiId(f) === getPoiId(state.loadedFeatures[state.currentFeatureId]));
                openDetailsPanel(state.currentFeatureId, circuitIndex !== -1 ? circuitIndex : null);
            } else {
                switchSidebarTab(tabName);
            }
        });
    });
}

export function adjustTime(minutesToAdd) {
    if (state.currentFeatureId === null) return;
    const trigger = document.getElementById('panel-time-display');
    let h = parseInt(trigger.dataset.hours, 10) || 0;
    let m = parseInt(trigger.dataset.minutes, 10) || 0;
    let totalMinutes = h * 60 + m + minutesToAdd;
    if (totalMinutes < 0) totalMinutes = 0;
    h = Math.floor(totalMinutes / 60);
    m = totalMinutes % 60;
    const poiId = getPoiId(state.loadedFeatures[state.currentFeatureId]);
    updatePoiData(poiId, 'timeH', h);
    updatePoiData(poiId, 'timeM', m);
    trigger.textContent = `${String(h).padStart(2, '0')}h${String(m).padStart(2, '0')}`;
    trigger.dataset.hours = h;
    trigger.dataset.minutes = m;
}

export function populateZonesMenu() {
    const zonesMenu = document.getElementById('zonesMenu');
    if (!zonesMenu) return;

    const zonesLabel = document.getElementById('zonesLabel');
    zonesMenu.innerHTML = '';

    if (!state.loadedFeatures || state.loadedFeatures.length === 0) {
        zonesMenu.innerHTML = '<button disabled>Aucune zone</button>';
        return;
    }

    const preFilteredFeatures = state.loadedFeatures.filter(feature => {
        const props = { ...feature.properties, ...feature.properties.userData };
        if (state.activeFilters.mosquees && props.Catégorie !== 'Mosquée') return false;
        if (state.activeFilters.vus && props.vu && !props.incontournable) return false;
        const isPlanned = (props.planifieCounter || 0) > 0;
        if (state.activeFilters.planifies && isPlanned && !props.incontournable) return false;
        return true;
    });

    const zoneCounts = preFilteredFeatures.reduce((acc, feature) => {
        const zone = feature.properties.Zone;
        if (zone) {
            acc[zone] = (acc[zone] || 0) + 1;
        }
        return acc;
    }, {});

    const sortedZones = Object.keys(zoneCounts).sort();

    if (sortedZones.length === 0) {
        zonesMenu.innerHTML = '<button disabled>Aucune zone visible</button>';
        return;
    }

    const allZonesBtn = document.createElement('button');
    allZonesBtn.textContent = `Toutes les zones (${preFilteredFeatures.length})`;
    allZonesBtn.onclick = () => {
        state.activeFilters.zone = null;
        zonesLabel.textContent = 'Zone';
        zonesMenu.style.display = 'none';
        applyFilters();
    };
    zonesMenu.appendChild(allZonesBtn);

    sortedZones.forEach(zone => {
        const zoneBtn = document.createElement('button');
        zoneBtn.textContent = `${zone} (${zoneCounts[zone]})`;
        zoneBtn.onclick = () => {
            state.activeFilters.zone = zone;
            zonesLabel.textContent = zone;
            zonesMenu.style.display = 'none';
            applyFilters();
        };
        zonesMenu.appendChild(zoneBtn);
    });
}

export function openCircuitsModal() {
    renderCircuitsList();
    DOM.circuitsModal.style.display = 'flex';
}

export function closeCircuitsModal() {
    DOM.circuitsModal.style.display = 'none';
}

function renderCircuitsList() {
    DOM.circuitsListContainer.innerHTML = (state.myCircuits.length === 0)
        ? '<p class="empty-list-info">Aucun circuit sauvegardé pour cette carte.</p>'
        : state.myCircuits.map(c => {
            // CORRECTION BUG "FAIT" PC : On ne vérifie que les lieux qui EXISTENT encore dans la base
            // Les ID "fantômes" (supprimés de la source de données mais restés dans le circuit) sont ignorés
            const existingFeatures = c.poiIds
                .map(id => state.loadedFeatures.find(feat => getPoiId(feat) === id))
                .filter(f => f); // On retire les 'undefined' (lieux introuvables)

            // Si tous les lieux RESTANTS sont vus, le circuit est considéré comme fait
            const allVisited = existingFeatures.length > 0 && existingFeatures.every(f => 
                f.properties.userData && f.properties.userData.vu
            );
            
            const checkState = allVisited ? 'checked' : '';
            
            return `
            <div class="circuit-item" data-id="${c.id}">
                <div style="flex:1;">
                    <span class="circuit-item-name">${escapeXml(c.name)}</span>
                </div>
                
                <div class="circuit-item-actions">
                     <label style="display:flex; align-items:center; gap:5px; cursor:pointer; margin-right:10px; font-size:14px; user-select:none;">
                        <input type="checkbox" class="circuit-visited-checkbox" data-id="${c.id}" ${checkState} style="width:16px; height:16px; cursor:pointer;">
                        <span>Fait</span>
                    </label>
                    <button class="btn-import" data-action="import" title="Importer un tracé réel">${ICONS.upload}</button>
                    <button class="btn-load" data-action="load" title="Charger le circuit">${ICONS.play}</button>
                    <button class="btn-delete" data-action="delete" title="Supprimer le circuit">${ICONS.trash}</button>
                </div>
            </div>`;
        }).join('');
    createIcons({ icons });
}

export async function handleCircuitsListClick(e) {
    // 1. Gestion des boutons
    const button = e.target.closest('button');
    if (button) {
        const circuitItem = button.closest('.circuit-item');
        const circuitId = circuitItem.dataset.id;
        const action = button.dataset.action;

        if (action === 'load') {
            await loadCircuitById(circuitId);
            closeCircuitsModal();
        } else if (action === 'delete') {
            await deleteCircuit(circuitId);
        } else if (action === 'import') {
            state.circuitIdToImportFor = circuitId;
            DOM.gpxImporter.click();
        }
        return;
    }

    // 2. Gestion de la Checkbox "Fait"
    const checkbox = e.target.closest('.circuit-visited-checkbox');
    if (checkbox) {
        const circuitId = checkbox.dataset.id;
        const isChecked = checkbox.checked;
        
        // Petit délai pour laisser l'UI se mettre à jour
        setTimeout(async () => {
             const confirmMsg = isChecked 
                ? "Marquer tous les lieux de ce circuit comme visités ?" 
                : "Décocher tous les lieux (remettre à 'Non visité') ?";
             
             if(confirm(confirmMsg)) {
                 await setCircuitVisitedState(circuitId, isChecked);
                 // On ne rafraîchit pas toute la liste pour ne pas perdre le scroll, juste visuel ok
             } else {
                 checkbox.checked = !isChecked; // On annule
             }
        }, 50);
    }
}

async function deleteCircuit(id) {
    if (!confirm("Supprimer ce circuit ?")) return;
    try {
        await deleteCircuitById(id);
        state.myCircuits = state.myCircuits.filter(c => c.id !== id);
        if (state.activeCircuitId === id) await clearCircuit(false);
        await recalculatePlannedCountersForMap(state.currentMapId);
        renderCircuitsList();
        if(!isMobileView()) applyFilters();
        showToast("Circuit supprimé.", 'success');
    } catch (error) {
        console.error("Erreur suppression:", error);
        showToast("Erreur suppression.", 'error');
    }
}

export function showToast(message, type = 'info', duration = 4000) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let iconSvg = '';
    if (type === 'success') iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg>`;
    else if (type === 'error') iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>`;
    else if (type === 'warning') iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>`;
    else iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>`;

    toast.innerHTML = `${iconSvg}<span>${message}</span>`;
    container.appendChild(toast);
    createIcons({ icons });
    
    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.5s forwards';
        toast.addEventListener('animationend', () => toast.remove());
    }, duration - 500);
}

export function populateAddPoiModalCategories() {
    const select = document.getElementById('new-poi-category');
    if (!select) return;

    select.innerHTML = POI_CATEGORIES.map(c => 
        `<option value="${c}">${c}</option>`
    ).join('');
    
    select.value = "A définir";
}