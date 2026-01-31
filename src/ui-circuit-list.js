import { state } from './state.js';
import { getPoiId } from './data.js';
import { ICONS } from './templates.js';
import { escapeXml } from './gpx.js';
import { createIcons, icons } from 'lucide';
import { eventBus } from './events.js';
import { showConfirm } from './modal.js';

const getEl = (id) => document.getElementById(id);

export function openCircuitsModal() {
    renderCircuitsList();
    const modal = getEl('circuits-modal');
    if(modal) modal.style.display = 'flex';
}

export function closeCircuitsModal() {
    const modal = getEl('circuits-modal');
    if(modal) modal.style.display = 'none';
}

export function initCircuitListUI() {
    const closeBtn = getEl('close-circuits-modal');
    const modal = getEl('circuits-modal');
    const container = getEl('circuits-list-container');

    if (closeBtn) closeBtn.addEventListener('click', closeCircuitsModal);

    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeCircuitsModal();
        });
    }

    if (container) {
        container.addEventListener('click', handleCircuitsListClick);
    }

    eventBus.on('circuit:list-updated', () => {
        if (modal && modal.style.display !== 'none') {
            renderCircuitsList();
        }
    });
}

function renderCircuitsList() {
    const container = getEl('circuits-list-container');
    if (!container) return;

    const visibleCircuits = state.myCircuits.filter(c => !c.isDeleted);

    container.innerHTML = (visibleCircuits.length === 0)
        ? '<p class="empty-list-info">Aucun circuit sauvegardé pour cette carte.</p>'
        : visibleCircuits.map(c => {
            const existingFeatures = c.poiIds
                .map(id => state.loadedFeatures.find(feat => getPoiId(feat) === id))
                .filter(f => f);

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

async function handleCircuitsListClick(e) {
    const button = e.target.closest('button');
    if (button) {
        const circuitItem = button.closest('.circuit-item');
        if (!circuitItem) return;

        const circuitId = circuitItem.dataset.id;
        const action = button.dataset.action;

        if (action === 'load') {
            eventBus.emit('circuit:request-load', circuitId);
            closeCircuitsModal();
        } else if (action === 'delete') {
            if (await showConfirm("Suppression du circuit", "Voulez-vous vraiment effacer ce parcours ?", "Supprimer", "Garder", true)) {
                 eventBus.emit('circuit:request-delete', circuitId);
            }
        } else if (action === 'import') {
             eventBus.emit('circuit:request-import', circuitId);
        }
        return;
    }

    const checkbox = e.target.closest('.circuit-visited-checkbox');
    if (checkbox) {
        const circuitId = checkbox.dataset.id;
        const isChecked = checkbox.checked;

        const confirmMsg = isChecked
            ? "Marquer tous les lieux de ce circuit comme visités ?"
            : "Décocher tous les lieux (remettre à 'Non visité') ?";

        if (await showConfirm("Marquer Circuit", confirmMsg, isChecked ? "Tout cocher" : "Tout décocher", "Annuler")) {
             eventBus.emit('circuit:request-toggle-visited', { id: circuitId, isChecked });
        } else {
            checkbox.checked = !isChecked;
        }
    }
}
