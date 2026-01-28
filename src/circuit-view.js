// circuit-view.js
import { DOM, openDetailsPanel, switchSidebarTab } from './ui.js';
import { getPoiName, getPoiId } from './data.js';

/**
 * Génère le HTML pour une étape du circuit
 */
function createStepElement(feature, index, totalPoints, callbacks) {
    const poiName = getPoiName(feature);
    const stepDiv = document.createElement('div');
    stepDiv.className = 'step';
    
    stepDiv.innerHTML = `
        <div class="num">${index + 1}</div>
        <div class="step-main" title="${poiName}">${poiName}</div>
        <div class="step-actions">
            <button class="stepbtn" data-action="up" title="Monter" ${index === 0 ? 'disabled' : ''}>
                <i data-lucide="chevron-up"></i>
            </button>
            <button class="stepbtn" data-action="down" title="Descendre" ${index === totalPoints - 1 ? 'disabled' : ''}>
                <i data-lucide="chevron-down"></i>
            </button>
            <button class="stepbtn" data-action="remove" title="Retirer">
                <i data-lucide="trash-2"></i>
            </button>
        </div>`;

    // Événements
    stepDiv.querySelector('.step-actions').addEventListener('click', (e) => {
        const button = e.target.closest('button');
        if (button) callbacks.onAction(button.dataset.action, index);
    });

    stepDiv.querySelector('.step-main').addEventListener('click', () => {
        callbacks.onDetails(feature, index);
    });

    return stepDiv;
}

/**
 * Rendu complet du panneau de circuit
 */
export function renderCircuitList(points, callbacks) {
    if (!DOM.circuitStepsList) return;

    DOM.circuitStepsList.innerHTML = '';

    if (points.length === 0) {
        DOM.circuitStepsList.innerHTML = `<p class="empty-list-info">Cliquez sur les lieux sur la carte pour les ajouter à votre circuit.</p>`;
    } else {
        points.forEach((feature, index) => {
            const stepEl = createStepElement(feature, index, points.length, callbacks);
            DOM.circuitStepsList.appendChild(stepEl);
        });
    }

    // Rafraîchissement des icônes Lucide après injection HTML
    if (window.lucide) window.lucide.createIcons();
}

/**
 * Mise à jour des compteurs et textes
 */
export function updateStatsUI(data) {
    if (DOM.circuitPoiCount) DOM.circuitPoiCount.textContent = data.countText;
    if (DOM.circuitDistance) DOM.circuitDistance.textContent = data.distanceText;
    if (DOM.circuitTitleText) {
        DOM.circuitTitleText.textContent = data.title;
        DOM.circuitTitleText.title = data.title;
    }

    const distIcon = document.getElementById('distance-icon');
    if (distIcon) {
        distIcon.setAttribute('data-lucide', data.iconType);
        distIcon.title = data.iconTitle;
        if (window.lucide) window.lucide.createIcons();
    }
}

/**
 * Gestion de l'état visuel des boutons de contrôle
 */
export function updateControlButtons(uiState) {
    const btnLoop = document.getElementById('btn-loop-circuit');
    const btnExport = document.getElementById('btn-export-gpx');
    const btnImport = document.getElementById('btn-import-gpx'); // On récupère l'import
    
    if (btnLoop) btnLoop.disabled = uiState.cannotLoop;
    if (btnExport) btnExport.disabled = uiState.isEmpty;
    
    // Le bouton import est actif si on a un circuit OU si on est en train d'en créer un
    if (btnImport) btnImport.disabled = false; 
}

export function updateCircuitForm(data) {
    if (DOM.circuitTitleText) DOM.circuitTitleText.textContent = data.name || 'Circuit chargé';
    if (DOM.circuitDescription) DOM.circuitDescription.value = data.description || '';
    
    // Remplissage des transports
    const fields = {
        'transport-aller-temps': data.transport?.allerTemps,
        'transport-aller-cout': data.transport?.allerCout,
        'transport-retour-temps': data.transport?.retourTemps,
        'transport-retour-cout': data.transport?.retourCout
    };

    for (const [id, value] of Object.entries(fields)) {
        const el = document.getElementById(id);
        if (el) el.value = value || '';
    }
}