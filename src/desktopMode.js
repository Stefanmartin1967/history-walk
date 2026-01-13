// desktopMode.js
import { map } from './map.js';
import { addPoiFeature } from './data.js';
import { state } from './state.js';
import { saveAppState } from './database.js';
import { logModification } from './logger.js';
import { showToast } from './ui.js';

let desktopDraftMarker = null;
const BASE_CATEGORIES = ["Mosquée", "Site historique", "Curiosité", "Hôtel", "Restaurant", "Café", "Taxi", "Commerce"];

export function enableDesktopCreationMode() {
    // GESTION DU CLIC-DROIT
    if (!map) return;
    
    map.on('contextmenu', (e) => {
        const { lat, lng } = e.latlng;
        if (desktopDraftMarker) {
            desktopDraftMarker.setLatLng(e.latlng);
        } else {
            createDraftMarker(lat, lng, map);
        }
    });
}

export function createDraftMarker(lat, lng, mapInstance) {
    // Marqueur déplaçable
    desktopDraftMarker = L.marker([lat, lng], {
        draggable: true,
        title: "Déplacez-moi pour ajuster"
    }).addTo(mapInstance);

    const popupContent = document.createElement('div');
    popupContent.style.textAlign = 'center';
    popupContent.innerHTML = `
        <div style="font-weight:bold; margin-bottom:5px;">Nouveau Lieu ?</div>
        <div style="font-size:12px; color:#666; margin-bottom:8px;">Glissez pour ajuster.</div>
        <button id="btn-validate-desktop-poi" class="action-btn" style="background:var(--brand); color:white; padding:4px 8px; font-size:12px; cursor:pointer;">
            Valider cette position
        </button>
    `;

    desktopDraftMarker.bindPopup(popupContent, { minWidth: 200 }).openPopup();

    // Gestionnaire du bouton Valider
    const validateHandler = (e) => {
        if (e.target && e.target.id === 'btn-validate-desktop-poi') {
            const finalLatLng = desktopDraftMarker.getLatLng();
            openDesktopAddModal(finalLatLng.lat, finalLatLng.lng);
            
            // Nettoyage
            if (mapInstance && desktopDraftMarker) {
                mapInstance.removeLayer(desktopDraftMarker);
            }
            desktopDraftMarker = null;
            document.body.removeEventListener('click', validateHandler);
        }
    };
    document.body.addEventListener('click', validateHandler);

    // Réouverture du popup après déplacement
    desktopDraftMarker.on('dragend', () => desktopDraftMarker.openPopup());
}

export function openDesktopAddModal(lat, lng) {
    const modal = document.getElementById('add-poi-modal');
    if (!modal) {
        console.error("Erreur: La modale 'add-poi-modal' est introuvable."); 
        return;
    }

    const coordsDisplay = document.getElementById('new-poi-coords');
    const nameInput = document.getElementById('new-poi-name');
    const catSelect = document.getElementById('new-poi-category');
    const confirmBtn = document.getElementById('btn-confirm-add-poi');
    const closeBtn = document.getElementById('close-add-poi-modal');

    // Reset et Remplissage
    nameInput.value = '';
    coordsDisplay.textContent = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    
    catSelect.innerHTML = '';
    const existingCats = new Set(state.loadedFeatures.map(f => f.properties.Catégorie).filter(Boolean));
    const allCats = new Set([...BASE_CATEGORIES, ...existingCats]);
    Array.from(allCats).sort().forEach(cat => {
        const option = document.createElement('option');
        option.value = cat;
        option.textContent = cat;
        if (cat === 'Mosquée' && state.currentMapId?.includes('Djerba')) option.selected = true;
        catSelect.appendChild(option);
    });

    modal.style.display = 'flex';
    nameInput.focus();

    // Gestionnaire unique pour le bouton confirmer
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

    newConfirmBtn.addEventListener('click', async () => {
        const name = nameInput.value.trim();
        const category = catSelect.value;
        if (!name) return showToast("Nom requis", "warning");

        const newPoiId = `HW-PC-${Date.now()}`;
        const newFeature = {
            type: "Feature",
            geometry: { type: "Point", coordinates: [lng, lat] },
            properties: {
                "Nom du site FR": name,
                "Catégorie": category,
                "Zone": "A définir (PC)",
                "Description": "Ajouté depuis PC",
                "HW_ID": newPoiId
            }
        };

        addPoiFeature(newFeature);
        await saveAppState('lastGeoJSON', { type: 'FeatureCollection', features: state.loadedFeatures });
        await logModification(newPoiId, 'Création PC', 'All', null, 'Nouveau lieu PC');

        showToast(`Lieu "${name}" ajouté !`, "success");
        modal.style.display = 'none';
    });

    // Fermeture
    const closeHandler = () => { modal.style.display = 'none'; };
    const newCloseBtn = closeBtn.cloneNode(true);
    closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);
    newCloseBtn.addEventListener('click', closeHandler);
}