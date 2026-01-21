import { map } from './map.js';
import { addPoiFeature, getPoiId } from './data.js';
import { state } from './state.js';
import { saveAppState, savePoiData } from './database.js';
import { logModification } from './logger.js';
import { showToast, DOM, closeDetailsPanel, openDetailsPanel } from './ui.js';
import { getExifLocation, calculateDistance, resizeImage } from './utils.js';

let desktopDraftMarker = null;
const BASE_CATEGORIES = ["Mosquée", "Site historique", "Curiosité", "Hôtel", "Restaurant", "Café", "Taxi", "Commerce"];

export function enableDesktopCreationMode() {
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

// --- FONCTION D'IMPORT AVEC MOUCHARDS ---
export async function handleDesktopPhotoImport(filesList) {
    console.log(">>> Démarrage Import Desktop. Fichiers reçus :", filesList);

    // 1. Vérification immédiate
    const files = Array.from(filesList);
    console.log(">>> Conversion tableau :", files.length, "fichiers.");

    if (!files || files.length === 0) {
        console.warn(">>> ALERTE : Liste de fichiers vide !");
        showToast("Erreur : Aucun fichier reçu par le module.", "error");
        return;
    }

    // Sécurité UI : On vérifie si DOM et loaderOverlay existent
    const loader = (DOM && DOM.loaderOverlay) ? DOM.loaderOverlay : null;
    if (loader) loader.style.display = 'flex';

    try {
        // --- ETAPE 1 : ANALYSE (BARYCENTRE) ---
        let validCoords = [];
        const filesData = []; 

        console.log(">>> Début lecture EXIF...");

        for (let file of files) {
            try {
                const coords = await getExifLocation(file);
                // Log pour vérifier si on trouve des GPS
                console.log(`Fichier ${file.name} : GPS trouvé ?`, !!coords); 
                
                if (coords) {
                    validCoords.push(coords);
                    filesData.push({ file, coords });
                } else {
                    filesData.push({ file, coords: null });
                }
            } catch (e) {
                console.warn(`Erreur EXIF sur ${file.name}:`, e);
                filesData.push({ file, coords: null });
            }
        }

        console.log(">>> Coordonnées valides trouvées :", validCoords.length);

        if (validCoords.length === 0) throw new Error("GPS_MISSING");

        // Calcul Moyenne
        const avgLat = validCoords.reduce((sum, c) => sum + c.lat, 0) / validCoords.length;
        const avgLng = validCoords.reduce((sum, c) => sum + c.lng, 0) / validCoords.length;

        console.log(">>> Barycentre calculé :", avgLat, avgLng);

        // Centrage Carte
        if (map) map.flyTo([avgLat, avgLng], 18, { duration: 1.5 });

        // --- ETAPE 2 : RADAR ---
        let nearestPoi = null;
        let minDistance = 100; 

        state.loadedFeatures.forEach(feature => {
            if (feature.geometry && feature.geometry.coordinates) {
                const [fLng, fLat] = feature.geometry.coordinates;
                const dist = calculateDistance(avgLat, avgLng, fLat, fLng);
                if (dist < minDistance) {
                    minDistance = dist;
                    nearestPoi = feature;
                }
            }
        });

        console.log(">>> POI le plus proche :", nearestPoi ? getPoiName(nearestPoi) : "Aucun", "à", Math.round(minDistance), "m");

        // --- ETAPE 3 : UI ---
        if (nearestPoi) {
            // Petite astuce pour récupérer le nom proprement
            const poiName = nearestPoi.properties['Nom du site FR'] || nearestPoi.properties['name'] || "Lieu inconnu";

            const userChoice = confirm(
                `📍 Lieu existant détecté !\n` +
                `Cible : "${poiName}" (à environ ${Math.round(minDistance)}m).\n\n` +
                `OK = AJOUTER les photos à ce lieu.\n` +
                `Annuler = Créer un NOUVEAU lieu.`
            );

            if (userChoice) {
                // >>> CAS A : AJOUT <<<
                let poiId = getPoiId(nearestPoi);
                if (!poiId) {
                    const [lng, lat] = nearestPoi.geometry.coordinates;
                    poiId = `auto_${Math.round(lat*100000)}_${Math.round(lng*100000)}`;
                    if (!nearestPoi.properties) nearestPoi.properties = {};
                    nearestPoi.properties.HW_ID = poiId;
                }

                if (!state.userData[poiId]) state.userData[poiId] = {};
                if (!state.userData[poiId].photos) state.userData[poiId].photos = [];

                let addedCount = 0;
                const [poiLng, poiLat] = nearestPoi.geometry.coordinates;

                for (let item of filesData) {
                    const file = item.file;
                    const coords = item.coords;
                    let shouldAdd = true;

                    if (coords) {
                        const dist = calculateDistance(coords.lat, coords.lng, poiLat, poiLng);
                        if (dist > 130) {
                            shouldAdd = confirm(`⚠️ Photo "${file.name}" est loin (${Math.round(dist)}m). Ajouter quand même ?`);
                        }
                    }

                    if (shouldAdd) {
                        try {
                            const resizedBase64 = await resizeImage(file);
                            state.userData[poiId].photos.push(resizedBase64);
                            addedCount++;
                        } catch (err) { console.error("Erreur Resize:", err); }
                    }
                }

                await savePoiData(state.currentMapId, poiId, state.userData[poiId]);
                
                if (loader) loader.style.display = 'none';
                showToast(`${addedCount} photo(s) ajoutée(s).`, 'success');

                closeDetailsPanel();
                setTimeout(() => {
                    const index = state.loadedFeatures.indexOf(nearestPoi);
                    if (index > -1) openDetailsPanel(index);
                }, 100);

            } else {
                // >>> CAS B : NOUVEAU <<<
                if (loader) loader.style.display = 'none';
                createDraftMarker(avgLat, avgLng, map);
                showToast("Veuillez valider la position.", 'info');
            }

        } else {
            // >>> CAS C : RIEN TROUVÉ <<<
            if (loader) loader.style.display = 'none';
            createDraftMarker(avgLat, avgLng, map);
            showToast("Aucun lieu proche. Nouveau lieu...", 'info');
        }

    } catch (error) {
        if (loader) loader.style.display = 'none';
        console.error(">>> ERREUR CRITIQUE IMPORT :", error); // C'est ici qu'on verra le bug
        
        if (error.message === "GPS_MISSING") {
            showToast("Aucune coordonnée GPS trouvée dans ces photos.", 'error');
        } else {
            showToast("Erreur technique : " + error.message, 'error');
        }
    }
}

export function createDraftMarker(lat, lng, mapInstance) {
    // Nettoyage préventif : on s'assure qu'il n'y a pas deux draft markers en même temps
    if (desktopDraftMarker) {
        mapInstance.removeLayer(desktopDraftMarker);
    }

    desktopDraftMarker = L.marker([lat, lng], {
        draggable: true,
        title: "Déplacez-moi pour ajuster"
    }).addTo(mapInstance);

    // Création du DOM de la popup
    const popupContent = document.createElement('div');
    popupContent.style.textAlign = 'center';
    popupContent.innerHTML = `
        <div style="font-weight:bold; margin-bottom:5px;">Nouveau Lieu ?</div>
        <div style="font-size:12px; color:#666; margin-bottom:8px;">Glissez pour ajuster.</div>
        <button id="btn-validate-desktop-poi" class="action-btn" style="background:var(--brand); color:white; padding:4px 8px; font-size:12px; cursor:pointer;">
            Valider cette position
        </button>
    `;

    // --- CORRECTION ---
    // On récupère le bouton DANS le conteneur créé, et on met l'event listener dessus.
    // Plus besoin de passer par document.body.
    const validateBtn = popupContent.querySelector('#btn-validate-desktop-poi');
    
    validateBtn.addEventListener('click', () => {
        const finalLatLng = desktopDraftMarker.getLatLng();
        openDesktopAddModal(finalLatLng.lat, finalLatLng.lng);
        
        // Nettoyage propre
        if (mapInstance && desktopDraftMarker) {
            mapInstance.removeLayer(desktopDraftMarker);
        }
        desktopDraftMarker = null;
        // Pas besoin de removeEventListener ici car le bouton (et le marker) sont détruits
    });

    desktopDraftMarker.bindPopup(popupContent, { minWidth: 200 }).openPopup();

    desktopDraftMarker.on('dragend', () => desktopDraftMarker.openPopup());
}

export function openDesktopAddModal(lat, lng) {
    const modal = document.getElementById('add-poi-modal');
    if (!modal) { console.error("Erreur Modal Manquant"); return; }

    const coordsDisplay = document.getElementById('new-poi-coords');
    const nameInput = document.getElementById('new-poi-name');
    const catSelect = document.getElementById('new-poi-category');
    const confirmBtn = document.getElementById('btn-confirm-add-poi');
    const closeBtn = document.getElementById('close-add-poi-modal');

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

    const closeHandler = () => { modal.style.display = 'none'; };
    const newCloseBtn = closeBtn.cloneNode(true);
    closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);
    newCloseBtn.addEventListener('click', closeHandler);
}

// Helper simple au cas où il manque dans l'import
function getPoiName(feature) {
    return feature.properties['Nom du site FR'] || feature.properties['name'] || "Lieu inconnu";
}