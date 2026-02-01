import { state } from './state.js';
import { getPoiId } from './data.js';
import { ICONS } from './templates.js';
import { escapeXml } from './gpx.js';
import { createIcons, icons } from 'lucide';
import { eventBus } from './events.js';
import { showConfirm } from './modal.js';
import { getZoneFromCoords } from './utils.js';
import { getOrthodromicDistance, getRealDistance } from './map.js';

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
        const modal = getEl('circuits-modal');
        if (modal && modal.style.display !== 'none') {
            renderCircuitsList();
        }
        // Also refresh explorer list if it exists
        if (document.getElementById('explorer-list')) {
            renderExplorerList();
        }
    });
}

export function renderExplorerList() {
    const listContainer = document.getElementById('explorer-list');
    if (!listContainer) return;

    // 1. Circuits Officiels
    const officialCircuits = state.officialCircuits || [];

    // 2. Circuits Locaux (Triés par récent)
    // Note: state.myCircuits is usually appended to, so reverse gives newest first.
    const localCircuits = state.myCircuits
        .filter(c => !c.isDeleted)
        .slice()
        .reverse();

    // Fusion : Officiels en premier
    const allCircuits = [...officialCircuits, ...localCircuits];

    listContainer.innerHTML = (allCircuits.length === 0)
        ? '<div style="padding:20px; text-align:center; color:var(--ink-soft);">Aucun circuit.</div>'
        : allCircuits.map(c => {
            const displayName = c.name.split(' via ')[0];
            const ids = c.poiIds || [];
            const poiCount = ids.length;

            // Resolve POIs to calculate distance/zone
            const circuitFeatures = ids
                .map(id => state.loadedFeatures.find(f => getPoiId(f) === id))
                .filter(Boolean);

            // Distance
            let distance = 0;
            if (c.realTrack) {
                distance = getRealDistance(c);
            } else {
                distance = getOrthodromicDistance(circuitFeatures);
            }

            let distDisplay;
            // Si c'est un circuit officiel avec une distance pré-remplie (ex: "3.5 km")
            if (c.isOfficial && c.distance) {
                 distDisplay = c.distance;
            }
            // Sinon on calcule
            else {
                 distDisplay = (distance / 1000).toFixed(1) + ' km';
            }

            // Zone
            let zoneName = "Inconnue";
            if (circuitFeatures.length > 0) {
                 const firstPoi = circuitFeatures[0];
                 const [lng, lat] = firstPoi.geometry.coordinates;
                 zoneName = getZoneFromCoords(lat, lng);
            }

            const iconName = c.realTrack ? 'footprints' : 'bird';

            // LOGIQUE OFFICIEL (Nettoyée sur PC)
            const isOfficial = c.isOfficial;

            // Sur PC, on retire le badge et le bouton download comme demandé
            // On garde juste le bouton Supprimer SI ce n'est PAS officiel
            let actionsHtml = '';

            if (!isOfficial) {
                actionsHtml += `
                <button class="explorer-item-delete" data-id="${c.id}" title="Supprimer">
                    <i data-lucide="trash-2"></i>
                </button>`;
            } else {
                // Pour les officiels sur PC, on met un espace vide ou rien pour garder l'alignement si besoin
                // Ici on laisse vide, ce qui rend l'item non supprimable
            }

            return `
            <div class="explorer-item" data-id="${c.id}">
                <div class="explorer-item-content">
                    <div class="explorer-item-name" title="${escapeXml(c.name)}">${escapeXml(displayName)}</div>
                    <div class="explorer-item-meta">
                        ${poiCount} POI • ${distDisplay} <i data-lucide="${iconName}" style="width:14px; height:14px; vertical-align:text-bottom; margin:0 2px;"></i> • ${zoneName}
                    </div>
                </div>
                ${actionsHtml}
            </div>
            `;
        }).join('');

    createIcons({ icons });

    // Event Listeners (Load)
    listContainer.querySelectorAll('.explorer-item').forEach(item => {
        item.addEventListener('click', (e) => {
            // Prevent if clicking action buttons (delete button or download link)
            if (e.target.closest('.explorer-item-delete') || e.target.closest('a')) return;

            const id = item.dataset.id;
            eventBus.emit('circuit:request-load', id);
            eventBus.emit('ui:request-tab-change', 'circuit');
        });
    });

    // Event Listeners (Delete) - Only for local ones
    listContainer.querySelectorAll('.explorer-item-delete').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const id = btn.dataset.id;
            if (await showConfirm("Suppression", "Voulez-vous vraiment supprimer ce circuit ?", "Supprimer", "Annuler", true)) {
                eventBus.emit('circuit:request-delete', id);
            }
        });
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
