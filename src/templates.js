// templates.js
import { getPoiName } from './data.js';
import { escapeXml } from './gpx.js';
import { POI_CATEGORIES, state } from './state.js';
import { isMobileView } from './mobile.js';

// On rapatrie les icônes ici car c'est le "visuel"
export const ICONS = {
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
    googleMaps: `<i data-lucide="map-pin" style="width:18px;height:18px;"></i>`,
    globe: `<i data-lucide="globe" style="width:18px;height:18px;"></i>`
};

export function renderSource(allProps) {
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

export function buildDetailsPanelHtml(feature, circuitIndex) {
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
    
    // BOUTON ADMIN (GOD MODE) - Supprimé car fusionné avec le crayon standard
    const adminButtonHtml = '';

    const categorySelectHtml = `
        <select id="panel-category-select" class="editable-input header-input" style="display:none; margin-top:5px; width:100%; font-size:14px;">
            ${categoryOptions}
        </select>
    `;

    // --- TEMPLATE PC ---
    const pcHtml = `
        <div class="panel-header editable-field pc-layout" data-field-id="title" style="display:flex; justify-content:space-between; align-items:center;">

            <div class="left-text-block pc-text-block" style="flex:1; margin-right: 10px; display:flex; flex-direction:column;">
                 <div class="editable-content">
                    <h2 id="panel-title-display" title="${escapeXml(poiName)}">${escapeXml(poiName)}</h2>
                    <p class="panel-nom-arabe">${escapeXml(allProps['Nom du site arabe'] || '')}</p>
                 </div>
                 <input type="text" id="panel-title-input" class="editable-input header-input" style="display: none; width:100%; margin-top:5px;">
                 ${categorySelectHtml}
            </div>

            <div class="right-icon-block" style="display:flex; flex-direction:column; align-items:flex-end; gap:8px; flex-shrink:0;">
                <div class="details-nav" style="display:flex; gap:4px;">
                    <button class="action-button btn-web-search" id="btn-web-search" title="Rechercher sur Google">${ICONS.globe}</button>
                    ${inCircuit ? `<button class="action-button" id="prev-poi-button" title="Précédent" ${circuitIndex === 0 ? 'disabled' : ''}>${ICONS.chevronLeft}</button>
                                  <button class="action-button" id="next-poi-button" title="Suivant" ${circuitIndex === state.currentCircuit.length - 1 ? 'disabled' : ''}>${ICONS.chevronRight}</button>` : ''}
                    <button class="action-button" id="close-details-button" title="Fermer">${ICONS.x}</button>
                </div>

                <div class="edit-controls" style="display:flex; gap:5px; justify-content:flex-end;">
                    ${gmapsButtonHtml}
                    ${adminButtonHtml}
                    <button class="action-button" id="btn-global-edit" title="Modifier le lieu">${ICONS.pen}</button>
                    <button class="action-button" id="btn-soft-delete" title="Signaler pour suppression" style="color: var(--danger);">${ICONS.trash}</button>
                </div>
            </div>
        </div>
        <div class="panel-content">
            <div class="detail-section editable-field" data-field-id="short_desc">
                <h3>Description du circuit</h3>
                <div class="content">
                    <p id="panel-short-desc-display" class="editable-text short-text">${escapeXml(allProps.Description_courte || allProps.Desc_wpt || '')}</p>
                </div>
            </div>
            <div class="detail-section editable-field description-section" data-field-id="description">
                <h3>Description
                    <div class="edit-controls section-controls">
                        <button class="action-button speak-btn">${ICONS.volume}</button>
                    </div>
                </h3>
                <div class="content">
                    <div id="panel-description-display" class="description-content editable-text">${(allProps.description || allProps.Description || '').replace(/\n/g, '<br>')}</div>
                    ${renderSource(allProps)}
                </div>
            </div>
            ${practicalDetailsHtml}
            <div class="detail-section">
                <h3>Mon Suivi</h3>
                <div class="content checkbox-group">
                  <label class="checkbox-label"><input type="checkbox" id="panel-chk-vu" ${isVuChecked}> Visité</label>
                  <label class="checkbox-label"><input type="checkbox" id="panel-chk-incontournable" ${isIncontournableChecked}> Incontournable</label>
                </div>
            </div>
            <div class="detail-section editable-field notes-section" data-field-id="notes">
                <h3>Notes
                     <div class="edit-controls section-controls">
                        <button class="action-button speak-btn">${ICONS.volume}</button>
                    </div>
                </h3>
                <div class="content">
                    <div id="panel-notes-display" class="description-content editable-text">${(allProps.notes || '').replace(/\n/g, '<br>')}</div>
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
    
    // --- TEMPLATE MOBILE ---
    const mobileHtml = `
        <div class="panel-content" style="padding-bottom: 100px;">
            <div class="detail-section editable-field" data-field-id="title">
                <div class="content">
                    <div class="title-section-line">
                        <div class="title-names editable-content">
                            <h2 class="editable-text">${escapeXml(poiName)}</h2>
                        </div>
                        <div class="title-actions details-header-nav">
                            <button class="btn-web-search" id="btn-web-search" title="Rechercher sur Google">${ICONS.globe}</button>
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
                             ${adminButtonHtml}
                             <button id="mobile-move-poi-btn" class="action-button" title="Mettre à jour la position">${ICONS.locate}</button>
                             <button class="action-button" id="btn-global-edit" title="Tout éditer">${ICONS.pen}</button>
                             <button class="action-button" id="btn-soft-delete" title="Supprimer (Corbeille)" style="color: var(--danger);">${ICONS.trash}</button>
                        </div>
                    </div>
                </div>
            </div>
            <div class="detail-section editable-field" data-field-id="short_desc">
                <h3>Description du circuit</h3>
                <div class="content">
                    <p class="editable-text short-text">${escapeXml(allProps.Description_courte || allProps.Desc_wpt || '')}</p>
                </div>
            </div>
            <div class="detail-section editable-field description-section" data-field-id="description">
                <h3>Description
                    <div class="edit-controls section-controls">
                        <button class="action-button speak-btn" title="Lire la description">${ICONS.volume}</button>
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
                </div>
            </div>
            <div class="detail-section editable-field notes-section" data-field-id="notes">
                <h3>Notes
                    <div class="edit-controls section-controls">
                        <button class="action-button speak-btn" title="Lire les notes">${ICONS.volume}</button>
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