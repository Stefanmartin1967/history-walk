import { map } from './map.js';
import { addPoiFeature, getPoiId } from './data.js';
import { state } from './state.js';
import { saveAppState, savePoiData } from './database.js';
import { logModification } from './logger.js';
import { DOM, closeDetailsPanel, openDetailsPanel } from './ui.js';
import { getExifLocation, calculateDistance, resizeImage, getZoneFromCoords, clusterByLocation, calculateBarycenter, filterOutliers } from './utils.js';
import { showToast } from './toast.js';

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

// --- FONCTION D'IMPORT AVEC CLUSTERING ET DÉTECTION ---
export async function handleDesktopPhotoImport(filesList) {
    console.log(">>> Démarrage Import Desktop. Fichiers reçus :", filesList);

    const files = Array.from(filesList);
    if (!files || files.length === 0) {
        showToast("Erreur : Aucun fichier reçu par le module.", "error");
        return;
    }

    const loader = (DOM && DOM.loaderOverlay) ? DOM.loaderOverlay : null;
    if (loader) loader.style.display = 'flex';

    try {
        // --- ETAPE 1 : EXTRACTION GPS ---
        const filesData = [];

        for (let file of files) {
            try {
                const coords = await getExifLocation(file);
                filesData.push({ file, coords, hasGps: true });
            } catch (e) {
                console.warn(`Pas de GPS pour ${file.name}`);
                filesData.push({ file, coords: null, hasGps: false });
            }
        }

        const validItems = filesData.filter(f => f.hasGps);
        if (validItems.length === 0) {
             if (loader) loader.style.display = 'none';
             return showToast("Aucune coordonnée GPS trouvée dans ces photos.", 'error');
        }

        // --- ETAPE 2 : CLUSTERING (Regroupement) ---
        // On groupe les photos distantes de moins de 50m
        const clusters = clusterByLocation(validItems, 50);

        // On trie par taille : Les plus gros groupes d'abord ("Majorité")
        clusters.sort((a, b) => b.length - a.length);

        console.log(`>>> ${clusters.length} clusters identifiés.`);

        // --- ETAPE 3 : TRAITEMENT SÉQUENTIEL DES GROUPES ---
        let processedCount = 0;

        for (let i = 0; i < clusters.length; i++) {
            let cluster = clusters[i];

            // --- ETAPE 2b : DÉTECTION ET EXCLUSION DES OUTLIERS (Parasites) ---
            const { main, outliers } = filterOutliers(cluster);

            if (outliers.length > 0) {
                console.log(`>>> Cluster ${i+1}: ${outliers.length} outliers détectés et séparés.`);
                // On garde le noyau principal
                cluster = main;
                // On ajoute les outliers comme un nouveau groupe à traiter plus tard
                // (Ils seront ajoutés à la fin du tableau 'clusters', donc la boucle les traitera)
                clusters.push(outliers);

                showToast(`${outliers.length} photos écartées du groupe principal (distance excessive).`, "info");
            }

            const center = calculateBarycenter(cluster.map(c => c.coords));

            console.log(`>>> Traitement Cluster ${i+1}/${clusters.length} (${cluster.length} photos) à [${center.lat}, ${center.lng}]`);

            // Centrage Carte
            if (map) map.flyTo([center.lat, center.lng], 18, { duration: 1.0 });

            // Recherche POI proche du BARYCENTRE de ce groupe
            let nearestPoi = null;
            let minDistance = 100; // Rayon de recherche 100m

            state.loadedFeatures.forEach(feature => {
                if (feature.geometry && feature.geometry.coordinates) {
                    const [fLng, fLat] = feature.geometry.coordinates;
                    const dist = calculateDistance(center.lat, center.lng, fLat, fLng);
                    if (dist < minDistance) {
                        minDistance = dist;
                        nearestPoi = feature;
                    }
                }
            });

            if (nearestPoi) {
                // CAS A : POI EXISTANT TROUVÉ
                const poiName = getPoiName(nearestPoi);
                const confirmAdd = confirm(
                    `Groupe ${i+1}/${clusters.length} : ${cluster.length} photo(s) détecté(es) près de "${poiName}" (${Math.round(minDistance)}m).\n\n` +
                    `Voulez-vous les AJOUTER à ce lieu ?\n` +
                    `(Annuler = Vérifier si création nécessaire)`
                );

                if (confirmAdd) {
                    await addPhotosToPoi(nearestPoi, cluster);
                    processedCount += cluster.length;
                    continue; // On passe au cluster suivant
                }
            }

            // CAS B : PAS DE POI PROCHE OU REFUS D'AJOUT -> PROPOSITION DE CRÉATION
            // On vérifie une dernière fois avec l'utilisateur
            const confirmCreate = confirm(
                `Groupe ${i+1}/${clusters.length} : ${cluster.length} photo(s) à une position non rattachée.\n` +
                `Aucun lieu correspondant accepté.\n\n` +
                `Créer un NOUVEAU lieu ici ?`
            );

            if (confirmCreate) {
                if (loader) loader.style.display = 'none';
                // On lance la création
                createDraftMarker(center.lat, center.lng, map);

                showToast(`Placez le marqueur pour le groupe ${i+1}. L'import s'arrête ici.`, 'info');
                // IMPORTANT : On doit arrêter la boucle ici car la création est manuelle
                // L'utilisateur devra relancer l'import pour les autres groupes s'il y en a.
                return;
            }
            // Si refus de création, on ignore ce groupe et on passe au suivant (boucle continue)
        }

        if (loader) loader.style.display = 'none';
        if (processedCount > 0) showToast(`${processedCount} photos importées au total.`, 'success');

    } catch (error) {
        if (loader) loader.style.display = 'none';
        console.error(">>> ERREUR IMPORT :", error);
        showToast("Erreur lors du traitement : " + error.message, 'error');
    }
}

// Fonction utilitaire pour l'ajout effectif avec détection de doublons
async function addPhotosToPoi(feature, clusterItems) {
    let poiId = getPoiId(feature);

    // Si c'est un POI "natif" sans ID user, on lui en crée un
    if (!poiId) {
        const [lng, lat] = feature.geometry.coordinates;
        poiId = `auto_${Math.round(lat*100000)}_${Math.round(lng*100000)}`;
        if (!feature.properties) feature.properties = {};
        feature.properties.HW_ID = poiId;
    }

    if (!state.userData[poiId]) state.userData[poiId] = {};
    if (!state.userData[poiId].photos) state.userData[poiId].photos = [];

    let added = 0;
    let duplicates = 0;

    for (const item of clusterItems) {
        try {
            const resizedBase64 = await resizeImage(item.file);

            // DÉTECTION DOUBLON (Bonus demandé)
            if (state.userData[poiId].photos.includes(resizedBase64)) {
                duplicates++;
            } else {
                state.userData[poiId].photos.push(resizedBase64);
                added++;
            }
        } catch (err) {
            console.error("Erreur compression:", err);
        }
    }

    if (added > 0) {
        await savePoiData(state.currentMapId, poiId, state.userData[poiId]);
        showToast(`${added} photos ajoutées (${duplicates} ignorées).`, 'success');
        
        // Refresh UI
        closeDetailsPanel();
        setTimeout(() => {
            const index = state.loadedFeatures.indexOf(feature);
            if (index > -1) openDetailsPanel(index);
        }, 100);
    } else if (duplicates > 0) {
        showToast(`Toutes les photos existent déjà (${duplicates} doublons).`, 'warning');
    }
}

export function createDraftMarker(lat, lng, mapInstance) {
    if (desktopDraftMarker) {
        mapInstance.removeLayer(desktopDraftMarker);
    }

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

    const validateBtn = popupContent.querySelector('#btn-validate-desktop-poi');
    
    validateBtn.addEventListener('click', () => {
        const finalLatLng = desktopDraftMarker.getLatLng();
        openDesktopAddModal(finalLatLng.lat, finalLatLng.lng);
        
        if (mapInstance && desktopDraftMarker) {
            mapInstance.removeLayer(desktopDraftMarker);
        }
        desktopDraftMarker = null;
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

        const zoneAutomatique = getZoneFromCoords(lat, lng);

        const newPoiId = `HW-PC-${Date.now()}`;
        const newFeature = {
            type: "Feature",
            geometry: { type: "Point", coordinates: [lng, lat] },
            properties: {
                "Nom du site FR": name,
                "Catégorie": category,
                "Zone": zoneAutomatique || "Non définie", 
                "Description": "Ajouté depuis PC",
                "HW_ID": newPoiId
            }
        };

        addPoiFeature(newFeature);
        await saveAppState('lastGeoJSON', { type: 'FeatureCollection', features: state.loadedFeatures });
        await logModification(newPoiId, 'Création PC', 'All', null, 'Nouveau lieu PC');

        showToast(`Lieu "${name}" ajouté dans ${zoneAutomatique || 'A définir'} !`, "success");
        modal.style.display = 'none';
    });

    const closeHandler = () => { modal.style.display = 'none'; };
    const newCloseBtn = closeBtn.cloneNode(true);
    closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);
    newCloseBtn.addEventListener('click', closeHandler);
}

function getPoiName(feature) {
    return feature.properties['Nom du site FR'] || feature.properties['name'] || "Lieu inconnu";
}
