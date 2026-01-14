// fusion.js - Version Corrigée & Robustifiée

const DOM = {
    sourceInput: document.getElementById('source-file'),
    backupInput: document.getElementById('backup-file'),
    btnAnalyze: document.getElementById('btn-analyze'),
    dashboard: document.getElementById('dashboard'),
    uploadCard: document.getElementById('upload-card'),
    listNew: document.getElementById('list-new'),
    listGps: document.getElementById('list-gps'),
    listContent: document.getElementById('list-content'),
    btnFusion: document.getElementById('btn-fusion')
};

let sourceData = null;
let backupData = null;
let pendingChanges = { newPois: [], gpsUpdates: [], contentUpdates: [] };

// Fonction de vérification centralisée
function updateAnalyzeButton() {
    console.log("État actuel -> Source:", !!sourceData, "Backup:", !!backupData);
    if (sourceData && backupData) {
        DOM.btnAnalyze.disabled = false;
        DOM.btnAnalyze.innerHTML = `<i data-lucide="scan-search"></i> Analyser les différences`;
        DOM.btnAnalyze.classList.add('btn-success'); // Petit effet visuel
        lucide.createIcons();
    } else {
        DOM.btnAnalyze.disabled = true;
    }
}

// Gestionnaire de fichier générique
function setupFileInput(inputElement, nameDisplayId, boxId, isSource) {
    inputElement.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const nameDisplay = document.getElementById(nameDisplayId);
        const box = document.getElementById(boxId);

        // Feedback immédiat : On a vu le fichier
        nameDisplay.innerHTML = `<span style="color:var(--ink);">Chargement de : ${file.name}...</span>`;

        try {
            const text = await file.text();
            
            // Tentative de parsing JSON
            let json;
            try {
                json = JSON.parse(text);
            } catch (jsonErr) {
                throw new Error("Ce n'est pas un fichier JSON valide (Format incorrect).");
            }

            // Vérification du contenu
            if (isSource) {
                if (!json.features || !Array.isArray(json.features)) {
                    throw new Error("Ce fichier ne ressemble pas à un GeoJSON (Pas de 'features').");
                }
                sourceData = json;
                nameDisplay.innerHTML = `<span style="color:var(--ok);">✅ ${file.name} (${json.features.length} lieux)</span>`;
            } else {
                if (!json.userData && !json.baseGeoJSON) {
                    throw new Error("Ce n'est pas un Backup History Walk valide (userData manquant).");
                }
                backupData = json;
                const count = Object.keys(json.userData || {}).length;
                nameDisplay.innerHTML = `<span style="color:var(--ok);">✅ ${file.name} (${count} données)</span>`;
            }

            box.classList.add('active');
            box.style.borderColor = "var(--ok)";
            updateAnalyzeButton();

        } catch (err) {
            console.error(err);
            // Affichage de l'erreur à l'utilisateur
            nameDisplay.innerHTML = `<span style="color:var(--danger);">❌ Erreur : ${err.message}</span>`;
            box.style.borderColor = "var(--danger)";
            
            // On invalide la donnée pour empêcher la fusion
            if (isSource) sourceData = null;
            else backupData = null;
            updateAnalyzeButton();
        }
    });
}

// Initialisation des écouteurs
setupFileInput(DOM.sourceInput, 'source-name', 'box-source', true);
setupFileInput(DOM.backupInput, 'backup-name', 'box-backup', false);


// --- 2. ANALYSE (Reste du code inchangé, mais sécurisé) ---

DOM.btnAnalyze.addEventListener('click', () => {
    if (!sourceData || !backupData) return;
    DOM.btnAnalyze.textContent = "Analyse en cours...";
    setTimeout(analyzeFiles, 50);
});

function analyzeFiles() {
    pendingChanges = { newPois: [], gpsUpdates: [], contentUpdates: [] };
    
    // Sécurité : On s'assure que les features existent
    const sourceFeatures = sourceData.features || [];
    const backupFeatures = (backupData.baseGeoJSON && backupData.baseGeoJSON.features) ? backupData.baseGeoJSON.features : [];
    const userDataMap = backupData.userData || {};

    const sourceIds = new Set(sourceFeatures.map(f => f.properties.HW_ID));
    
    // A. Détecter les Nouveaux POI
    backupFeatures.forEach(feature => {
        if (!sourceIds.has(feature.properties.HW_ID)) {
            const uData = userDataMap[feature.properties.HW_ID] || {};
            const name = uData.custom_title || feature.properties['Nom du site FR'] || "Nouveau POI";
            const notes = uData.notes || "";
            
            pendingChanges.newPois.push({
                feature: feature,
                proposedName: name,
                proposedDesc: notes,
                originalId: feature.properties.HW_ID
            });
        }
    });

    // B. Détecter les Modifications
    sourceFeatures.forEach(sourceFeat => {
        const id = sourceFeat.properties.HW_ID;
        const uData = userDataMap[id];
        const backupFeat = backupFeatures.find(f => f.properties.HW_ID === id);

        if (!uData && !backupFeat) return;

        // GPS
        if (backupFeat) {
            const oldC = sourceFeat.geometry.coordinates;
            const newC = backupFeat.geometry.coordinates;
            // Vérif que les coordonnées existent bien
            if (oldC && newC && oldC.length === 2 && newC.length === 2) {
                const dist = calculateDistance(oldC[1], oldC[0], newC[1], newC[0]);
                if (dist > 5) { 
                    pendingChanges.gpsUpdates.push({
                        id: id,
                        name: sourceFeat.properties['Nom du site FR'],
                        oldCoords: oldC,
                        newCoords: newC,
                        distance: Math.round(dist)
                    });
                }
            }
        }

        // Contenu
        if (uData) {
            const changes = [];
            if (uData.custom_title && uData.custom_title !== sourceFeat.properties['Nom du site FR']) {
                changes.push({ type: 'Nom', old: sourceFeat.properties['Nom du site FR'], new: uData.custom_title });
            }
            if (uData.notes) {
                changes.push({ type: 'Note', old: '(vide)', new: uData.notes });
            }
            if (uData.Description_courte && uData.Description_courte !== sourceFeat.properties['Desc_wpt']) {
                changes.push({ type: 'GPX', old: sourceFeat.properties['Desc_wpt'] || '', new: uData.Description_courte });
            }

            if (changes.length > 0) {
                pendingChanges.contentUpdates.push({
                    id: id,
                    name: sourceFeat.properties['Nom du site FR'],
                    changes: changes
                });
            }
        }
    });

    renderDashboard();
}

// ... (Le reste : renderDashboard, renderSection, btnFusion, downloadResult, calculateDistance) ...
// Vous pouvez réutiliser exactement les mêmes fonctions que dans le message précédent pour la partie affichage
// Je les remets ici pour être sûr que le fichier soit complet.

function renderDashboard() {
    DOM.uploadCard.style.display = 'none';
    DOM.dashboard.style.display = 'block';

    renderSection(DOM.listNew, 'Nouveaux Lieux Créés', 'badge-new', pendingChanges.newPois, (item, idx) => `
        <div class="change-item">
            <div class="checkbox-wrapper"><input type="checkbox" checked id="new-${idx}"></div>
            <div class="change-content">
                <div class="poi-name">Nouveau Lieu <span class="badge badge-new">Création</span></div>
                <label style="font-size:12px; color:#64748B;">Nom définitif :</label>
                <input type="text" class="new-poi-input" id="name-new-${idx}" value="${item.proposedName}">
                ${item.proposedDesc ? `<div class="change-detail"><span style="font-style:italic">Note : ${item.proposedDesc}</span></div>` : ''}
            </div>
        </div>`);

    renderSection(DOM.listGps, 'Corrections GPS', 'badge-gps', pendingChanges.gpsUpdates, (item, idx) => {
        const mapsLink = `https://www.google.com/maps/search/?api=1&query=${item.newCoords[1]},${item.newCoords[0]}`;
        return `
            <div class="change-item">
                <div class="checkbox-wrapper"><input type="checkbox" checked id="gps-${idx}"></div>
                <div class="change-content">
                    <div class="poi-name">${item.name} <a href="${mapsLink}" target="_blank" class="gps-link">Voir sur Maps ↗</a></div>
                    <div class="change-detail">
                        <span class="badge badge-gps">Déplacement ${item.distance}m</span>
                        <span class="old-val">[${item.oldCoords[1].toFixed(5)}, ${item.oldCoords[0].toFixed(5)}]</span>
                        <span class="arrow">➜</span>
                        <span class="new-val">[${item.newCoords[1].toFixed(5)}, ${item.newCoords[0].toFixed(5)}]</span>
                    </div>
                </div>
            </div>`;
    });

    renderSection(DOM.listContent, 'Enrichissements', 'badge-content', pendingChanges.contentUpdates, (item, idx) => {
        const details = item.changes.map(c => `
            <div class="change-detail">
                <span class="badge badge-content">${c.type}</span>
                <span class="old-val">${(c.old||'').substring(0, 20)}...</span>
                <span class="arrow">➜</span>
                <span class="new-val">${c.new}</span>
            </div>
        `).join('');
        return `
            <div class="change-item">
                <div class="checkbox-wrapper"><input type="checkbox" checked id="content-${idx}"></div>
                <div class="change-content">
                    <div class="poi-name">${item.name}</div>
                    ${details}
                </div>
            </div>`;
    });
    
    lucide.createIcons();
}

function renderSection(container, title, badgeClass, data, renderFn) {
    if (data.length === 0) {
        container.innerHTML = ''; 
        return;
    }
    let html = `<div class="group-title">${title} <span class="badge ${badgeClass}">${data.length}</span></div>`;
    html += data.map((item, idx) => renderFn(item, idx)).join('');
    container.innerHTML = html;
}

DOM.btnFusion.addEventListener('click', () => {
    const finalFeatures = JSON.parse(JSON.stringify(sourceData.features));
    let logStats = { new: 0, gps: 0, content: 0 };

    pendingChanges.gpsUpdates.forEach((item, idx) => {
        if (document.getElementById(`gps-${idx}`).checked) {
            const feat = finalFeatures.find(f => f.properties.HW_ID === item.id);
            if (feat) { feat.geometry.coordinates = item.newCoords; logStats.gps++; }
        }
    });

    pendingChanges.contentUpdates.forEach((item, idx) => {
        if (document.getElementById(`content-${idx}`).checked) {
            const feat = finalFeatures.find(f => f.properties.HW_ID === item.id);
            if (feat) {
                item.changes.forEach(change => {
                    if (change.type === 'Nom') feat.properties['Nom du site FR'] = change.new;
                    if (change.type === 'GPX') feat.properties['Desc_wpt'] = change.new;
                    if (change.type === 'Note') {
                         const oldDesc = feat.properties['Description'] || "";
                         const separator = oldDesc ? "\n\n[Note ajoutée] : " : "[Note ajoutée] : ";
                         feat.properties['Description'] = oldDesc + separator + change.new;
                    }
                });
                logStats.content++;
            }
        }
    });

    pendingChanges.newPois.forEach((item, idx) => {
        if (document.getElementById(`new-${idx}`).checked) {
            const newName = document.getElementById(`name-new-${idx}`).value;
            
            // On clone proprement l'objet original qui contient TOUTES les infos du mobile
            const newPoi = JSON.parse(JSON.stringify(item.feature));
            
            // 1. On applique le nom validé
            newPoi.properties['Nom du site FR'] = newName;
            
            // 2. On nettoie les propriétés techniques internes (HW_ID reste, mais userData doit être aplati)
            const userData = newPoi.properties.userData || {};
            
            // 3. TRANSFERT DES DONNÉES (La correction est ici)
            
            // Description principale (On garde celle du mobile si elle existe)
            if (userData.description) newPoi.properties['Description'] = userData.description;
            
            // Description courte (GPX)
            if (userData.Description_courte) newPoi.properties['Desc_wpt'] = userData.Description_courte;
            
            // Notes personnelles (On les garde à part ou on les fusionne selon votre choix)
            // Ici, je propose de les garder dans une propriété dédiée si votre GeoJSON le supporte,
            // ou de les ajouter à la fin de la description si vous voulez.
            // Pour l'instant, ne les écrasons pas sur la description principale comme avant.
            if (userData.notes) newPoi.properties['Notes'] = userData.notes;

            // Temps de visite (Reconstruction du format HH:MM)
            if (userData.timeH !== undefined || userData.timeM !== undefined) {
                const h = userData.timeH || 0;
                const m = userData.timeM || 0;
                newPoi.properties['Temps de visite'] = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
            }

            // Prix
            if (userData.price) newPoi.properties["Prix d'entrée"] = userData.price + " TND";

            // Drapeaux (Visité, Vérifié...)
            if (userData.vu) newPoi.properties['Visité'] = true;
            if (userData.verified) newPoi.properties['Vérifié'] = true;
            if (userData.incontournable) newPoi.properties['Incontournable'] = true;

            // Nettoyage final : On supprime l'objet userData temporaire car tout est maintenant dans properties
            delete newPoi.properties.userData;
            delete newPoi.properties.Accuracy; // On ne garde pas la précision GPS technique

            finalFeatures.push(newPoi);
            logStats.new++;
        }
    });

    const finalGeoJSON = { type: "FeatureCollection", features: finalFeatures };
    downloadResult(finalGeoJSON, logStats);
});

function downloadResult(jsonObj, stats) {
    const str = JSON.stringify(jsonObj, null, 2);
    const blob = new Blob([str], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const date = new Date().toISOString().slice(0,10);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Djerba_V2_${date}.geojson`;
    a.click();
    DOM.btnFusion.textContent = `Succès ! Fichier téléchargé`;
    DOM.btnFusion.disabled = true;
    DOM.btnFusion.classList.remove('btn-success');
    DOM.btnFusion.style.backgroundColor = '#64748B';
}

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;
    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}