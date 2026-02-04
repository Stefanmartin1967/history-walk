import { getZonesData } from './circuit-actions.js';
import { applyFilters } from './data.js';
import { toggleSelectionMode, clearCircuit } from './circuit.js';
import { map } from './map.js';
import { addPoiFeature, getPoiId, updatePoiData } from './data.js';
import { state } from './state.js';
import { saveAppState, savePoiData } from './database.js';
import { logModification } from './logger.js';
import { DOM, closeDetailsPanel, openDetailsPanel, closeAllDropdowns } from './ui.js';
import { getExifLocation, calculateDistance, resizeImage, getZoneFromCoords, clusterByLocation, calculateBarycenter, filterOutliers } from './utils.js';
import { showToast } from './toast.js';
import { showConfirm } from './modal.js';
import { RichEditor } from './richEditor.js';

let desktopDraftMarker = null;

export function enableDesktopCreationMode() {
    if (!map) return;
    RichEditor.init(); // Initialisation des écouteurs de la modale riche
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
        // On groupe les photos distantes de moins de 80m (augmenté pour éviter le split abusif)
        const clusters = clusterByLocation(validItems, 80);

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
                clusters.push(outliers);

                showToast(`${outliers.length} photos écartées du groupe principal (distance excessive).`, "info");
            }

            const center = calculateBarycenter(cluster.map(c => c.coords));

            console.log(`>>> Traitement Cluster ${i+1}/${clusters.length} (${cluster.length} photos) à [${center.lat}, ${center.lng}]`);

            // Centrage Carte
            if (map) map.flyTo([center.lat, center.lng], 18, { duration: 1.0 });

            // Recherche TOUS les POIs proches du BARYCENTRE (< 100m)
            let nearbyPois = [];
            state.loadedFeatures.forEach(feature => {
                const pId = getPoiId(feature);
                if (state.hiddenPoiIds && state.hiddenPoiIds.includes(pId)) return;

                if (feature.geometry && feature.geometry.coordinates) {
                    const [fLng, fLat] = feature.geometry.coordinates;
                    const dist = calculateDistance(center.lat, center.lng, fLat, fLng);
                    if (dist < 100) {
                        nearbyPois.push({ feature, dist });
                    }
                }
            });

            // Tri par distance croissante
            nearbyPois.sort((a, b) => a.dist - b.dist);

            let assigned = false;

            // CAS A : PROPOSITIONS ITÉRATIVES
            if (nearbyPois.length > 0) {
                if (loader) loader.style.display = 'none';

                for (let k = 0; k < nearbyPois.length; k++) {
                    const { feature, dist } = nearbyPois[k];
                    const poiName = getPoiName(feature);

                    const confirmAdd = await showConfirm(
                        "Ajout Photos",
                        `Groupe ${i+1}/${clusters.length} : ${cluster.length} photo(s) détecté(es) près de :\n` +
                        `"${poiName}" (${Math.round(dist)}m).\n\n` +
                        `Voulez-vous les AJOUTER à ce lieu ?\n` +
                        (k < nearbyPois.length - 1 ? `(Vérifier = Voir le suivant)` : `(Vérifier = Créer nouveau)`),
                        "Ajouter",
                        "Vérifier"
                    );

                    if (confirmAdd) {
                        if (loader) loader.style.display = 'flex';
                        await addPhotosToPoi(feature, cluster);
                        processedCount += cluster.length;
                        assigned = true;
                        break; // Sort de la boucle des POIs proches
                    }
                    // Si refus, on passe au POI suivant
                }

                if (assigned) continue; // On passe au cluster suivant
            }

            // CAS B : PAS DE POI PROCHE OU TOUS REFUSÉS -> PROPOSITION DE CRÉATION
            if (loader) loader.style.display = 'none';

            const confirmCreate = await showConfirm(
                "Nouveau Lieu ?",
                `Groupe ${i+1}/${clusters.length} : ${cluster.length} photo(s) non rattachées.\n` +
                `Créer un NOUVEAU lieu ici ?`,
                "Créer",
                "Passer"
            );

            if (confirmCreate) {
                if (loader) loader.style.display = 'none';
                createDraftMarker(center.lat, center.lng, map, cluster);
                showToast(`Placez le marqueur pour le groupe ${i+1}. L'import s'arrête ici.`, 'info');
                return;
            }
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
        // Utilisation de updatePoiData pour garantir la sync Mémoire + DB + UI
        await updatePoiData(poiId, 'photos', state.userData[poiId].photos);
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

export function createDraftMarker(lat, lng, mapInstance, photos = []) {
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
        // REMPLACEMENT PAR LA RICH EDITOR
        RichEditor.openForCreate(finalLatLng.lat, finalLatLng.lng, photos);
        
        if (mapInstance && desktopDraftMarker) {
            mapInstance.removeLayer(desktopDraftMarker);
        }
        desktopDraftMarker = null;
    });

    desktopDraftMarker.bindPopup(popupContent, { minWidth: 200 }).openPopup();

    desktopDraftMarker.on('dragend', () => desktopDraftMarker.openPopup());
}

// L'ancienne fonction openDesktopAddModal a été supprimée car remplacée par RichEditor.

function getPoiName(feature) {
    return feature.properties['Nom du site FR'] || feature.properties['name'] || "Lieu inconnu";
}

// --- LOGIQUE WIZARD & OUTILS ---

export function setupDesktopTools() {
    // 1. Bouton "Mode Sélection" avec Interception pour Wizard
    const btnSelect = document.getElementById('btn-mode-selection');
    if (btnSelect) {
        // On clone le bouton pour supprimer les anciens écouteurs (toggle simple)
        const newBtn = btnSelect.cloneNode(true);
        btnSelect.parentNode.replaceChild(newBtn, btnSelect);

        newBtn.addEventListener('click', () => {
             if (state.isSelectionModeActive) {
                 toggleSelectionMode(false);
             } else {
                 openSelectionWizard();
             }
        });
    }

    // 2. Menu Outils (Dropdown) - GÉRÉ DANS ui.js (initializeDomReferences)
    // Ne pas dupliquer l'écouteur ici !

    // La fermeture au clic ailleurs est aussi gérée globalement dans main.js/setupDesktopUIListeners

    // 3. Initialisation du Wizard
    const btnStart = document.getElementById('btn-wizard-start');
    const btnClose = document.getElementById('close-wizard-modal');
    if (btnStart) btnStart.addEventListener('click', handleWizardStart);
    if (btnClose) btnClose.addEventListener('click', () => {
        document.getElementById('selection-wizard-modal').style.display = 'none';
    });
}

function openSelectionWizard() {
    const modal = document.getElementById('selection-wizard-modal');
    if (!modal) return;

    // Remplissage de la liste des zones
    const zoneSelect = document.getElementById('wizard-zone-select');
    if (zoneSelect) {
        // On garde "Toute l'île"
        zoneSelect.innerHTML = '<option value="">Toute l\'île</option>';
        const data = getZonesData();
        if (data && data.sortedZones) {
             data.sortedZones.forEach(zone => {
                 const option = document.createElement('option');
                 option.value = zone;
                 option.textContent = `${zone} (${data.zoneCounts[zone]})`;
                 zoneSelect.appendChild(option);
             });
        }
    }

    modal.style.display = 'flex';
}

function handleWizardStart() {
    // 1. Récupération des choix
    const zoneSelect = document.getElementById('wizard-zone-select');
    const checkVisited = document.getElementById('wizard-check-visited');
    const checkPlanned = document.getElementById('wizard-check-planned');

    const selectedZone = zoneSelect ? zoneSelect.value : "";
    const hideVisited = checkVisited ? checkVisited.checked : true;
    const hidePlanned = checkPlanned ? checkPlanned.checked : true;

    // 2. Mise à jour de l'état
    state.selectionModeFilters = {
        hideVisited: hideVisited,
        hidePlanned: hidePlanned
    };

    // On met à jour le filtre Zone global car il est partagé
    state.activeFilters.zone = selectedZone || null;

    // Mise à jour de l'étiquette du bouton Zone
    const zonesLabel = document.getElementById('zonesLabel');
    if (zonesLabel) {
        zonesLabel.textContent = selectedZone || 'Zone';
    }

    // 3. Lancement du mode (Avec reset du circuit précédent pour éviter la confusion)
    clearCircuit(false);
    toggleSelectionMode(true);
    applyFilters(); // Force le rafraîchissement avec les nouvelles règles

    // 4. Fermeture du Wizard
    document.getElementById('selection-wizard-modal').style.display = 'none';
    showToast("Mode Sélection Configuré", "success");
}
