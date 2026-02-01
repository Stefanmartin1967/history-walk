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

// --- LOCAL STATE ---
let explorerSort = 'recent'; // 'recent', 'dist_asc', 'dist_desc'
let explorerFilter = 'none'; // 'none', 'restaurant'

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

    // Initial render of header
    renderExplorerHeader();

    // Global listener for closing menu (Fixed memory leak)
    document.addEventListener('click', (e) => {
        const header = document.querySelector('.explorer-header');
        const menu = document.getElementById('explorer-filter-menu');
        if (header && menu && !header.contains(e.target)) {
             menu.style.display = 'none';
        }
    });
}

// --- EXPLORER HEADER (NEW) ---
function renderExplorerHeader() {
    const header = document.querySelector('.explorer-header');
    if (!header) return;

    const mapName = state.currentMapId ? (state.currentMapId.charAt(0).toUpperCase() + state.currentMapId.slice(1)) : 'Circuits';

    header.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; width:100%; padding: 0 10px; position:relative;">
            <div style="position:relative;">
                <button id="btn-explorer-filter" class="header-btn" title="Trier et Filtrer">
                    <i data-lucide="list-filter"></i>
                </button>
                <div id="explorer-filter-menu" class="tools-menu" style="display:none; top:40px; left:0; min-width:220px; z-index: 2000;">
                    <div style="padding:8px; font-weight:600; color:var(--ink-soft); font-size:12px;">TRIER PAR</div>
                    <button class="tools-menu-item ${explorerSort === 'recent' ? 'active' : ''}" data-sort="recent">
                        <i data-lucide="clock"></i> Plus récents
                    </button>
                    <button class="tools-menu-item ${explorerSort === 'dist_desc' ? 'active' : ''}" data-sort="dist_desc">
                        <i data-lucide="arrow-down-0-1"></i> Distance (Long -> Court)
                    </button>
                    <button class="tools-menu-item ${explorerSort === 'dist_asc' ? 'active' : ''}" data-sort="dist_asc">
                        <i data-lucide="arrow-up-0-1"></i> Distance (Court -> Long)
                    </button>

                    <div style="height:1px; background:var(--line); margin:5px 0;"></div>

                    <div style="padding:8px; font-weight:600; color:var(--ink-soft); font-size:12px;">FILTRER</div>
                    <button class="tools-menu-item ${explorerFilter === 'restaurant' ? 'active' : ''}" data-filter="restaurant">
                        <i data-lucide="utensils"></i> Avec Restaurant
                    </button>
                    <button class="tools-menu-item ${explorerFilter === 'none' ? 'active' : ''}" data-filter="none">
                        <i data-lucide="x"></i> Aucun filtre
                    </button>
                </div>
            </div>

            <h2 style="margin:0; font-size:22px; text-align:center; flex:1;">${mapName}</h2>

            <!-- Spacer to balance the left button -->
            <div style="width:32px;"></div>
        </div>
    `;

    createIcons({ icons });

    // Event Listeners
    const btnFilter = header.querySelector('#btn-explorer-filter');
    const menu = header.querySelector('#explorer-filter-menu');

    if (btnFilter && menu) {
        btnFilter.addEventListener('click', (e) => {
            e.stopPropagation();
            const isVisible = menu.style.display === 'block';
            menu.style.display = isVisible ? 'none' : 'block';
        });

        // Menu items
        menu.querySelectorAll('.tools-menu-item').forEach(item => {
            item.addEventListener('click', () => {
                const sort = item.dataset.sort;
                const filter = item.dataset.filter;

                if (sort) explorerSort = sort;
                if (filter) explorerFilter = filter;

                renderExplorerHeader(); // Re-render to update 'active' class
                renderExplorerList(); // Re-render list
                menu.style.display = 'none';
            });
        });
    }
}

export function renderExplorerList() {
    // Need to call header render in case mapId wasn't ready at init
    const headerTitle = document.querySelector('.explorer-header h2');
    if (headerTitle && state.currentMapId && !headerTitle.textContent.includes(state.currentMapId.charAt(0).toUpperCase())) {
         renderExplorerHeader();
    }

    const listContainer = document.getElementById('explorer-list');
    if (!listContainer) return;

    // 1. Data Prep (Unified - No Official Distinction in UI)
    // We only show state.myCircuits because we now merge everything there on load
    const visibleCircuits = (state.myCircuits || []).filter(c => !c.isDeleted);

    // 2. Pre-calculation (Distance / Features) for Sorting/Filtering
    const enrichedCircuits = visibleCircuits.map(c => {
        const ids = c.poiIds || [];
        const features = ids
            .map(id => state.loadedFeatures.find(f => getPoiId(f) === id))
            .filter(Boolean);

        let distance = 0;
        if (c.realTrack) {
            distance = getRealDistance(c);
        } else {
            distance = getOrthodromicDistance(features);
        }

        let sortDistance = distance;
        // Legacy check for string distance if imported from old json
        if (c.distance && typeof c.distance === 'string') {
            const parsed = parseFloat(c.distance.replace(',', '.'));
            if (!isNaN(parsed)) sortDistance = parsed * 1000;
        }

        const hasRestaurant = features.some(f => {
            const cat = f.properties['Catégorie'] || f.properties.userData?.Catégorie;
            return cat === 'Restaurant';
        });

        // Zone
        let zoneName = "Inconnue";
        if (features.length > 0) {
             const firstPoi = features[0];
             const [lng, lat] = firstPoi.geometry.coordinates;
             zoneName = getZoneFromCoords(lat, lng);
        }

        return {
            ...c,
            features,
            distVal: sortDistance,
            hasRestaurant,
            zoneName,
            poiCount: ids.length
        };
    });

    // 3. Filter
    let processedCircuits = enrichedCircuits;
    if (explorerFilter === 'restaurant') {
        processedCircuits = enrichedCircuits.filter(c => c.hasRestaurant);
    }

    // 4. Sort
    if (explorerSort === 'recent') {
        // Just reverse to show newest first (since we push new ones to end)
        processedCircuits.reverse();
    } else if (explorerSort === 'dist_asc') {
        processedCircuits.sort((a, b) => a.distVal - b.distVal);
    } else if (explorerSort === 'dist_desc') {
        processedCircuits.sort((a, b) => b.distVal - a.distVal);
    }

    // 5. Render
    listContainer.innerHTML = (processedCircuits.length === 0)
        ? '<div style="padding:20px; text-align:center; color:var(--ink-soft);">Aucun circuit correspondant.</div>'
        : processedCircuits.map(c => {
            const displayName = c.name.split(' via ')[0];

            let distDisplay;
            if (c.isOfficial && c.distance) {
                 distDisplay = c.distance;
            } else {
                 distDisplay = (c.distVal / 1000).toFixed(1) + ' km';
            }

            const iconName = c.realTrack ? 'footprints' : 'bird';

            // Unified Action Button (Delete for everyone)
            const actionsHtml = `
                <button class="explorer-item-delete" data-id="${c.id}" title="Supprimer">
                    <i data-lucide="trash-2"></i>
                </button>`;

            return `
            <div class="explorer-item" data-id="${c.id}">
                <div class="explorer-item-content">
                    <div class="explorer-item-name" title="${escapeXml(c.name)}">${escapeXml(displayName)}</div>
                    <div class="explorer-item-meta">
                        ${c.poiCount} POI • ${distDisplay} <i data-lucide="${iconName}" style="width:14px; height:14px; vertical-align:text-bottom; margin:0 2px;"></i> • ${c.zoneName}
                    </div>
                </div>
                ${actionsHtml}
            </div>
            `;
        }).join('');

    createIcons({ icons });

    // Event Listeners
    listContainer.querySelectorAll('.explorer-item').forEach(item => {
        item.addEventListener('click', (e) => {
            if (e.target.closest('.explorer-item-delete') || e.target.closest('a')) return;
            const id = item.dataset.id;
            eventBus.emit('circuit:request-load', id);
            eventBus.emit('ui:request-tab-change', 'circuit');
        });
    });

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
